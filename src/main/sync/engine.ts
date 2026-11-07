import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { atomicWrite } from '../store/docs'
import { AuthError, HttpError, OfflineError } from './net'
import type { Remote, RemoteFile } from './remote'

/**
 * Motor do espelho local → Drive de UM livro. O disco é a fonte da verdade.
 *
 *  - push(): varre o livro, calcula MD5 (o mesmo hash que o Drive expõe em
 *    md5Checksum), enfileira só o que mudou e processa a fila com
 *    retentativa exponencial. A fila fica no manifesto, então sobrevive a
 *    reinícios e a períodos offline.
 *  - pull(): lista a pasta remota e baixa o que mudou lá enquanto o local
 *    ficou igual.
 *  - Conflito (local e remoto mudaram desde a última sincronização): a versão
 *    remota é gravada ao lado como "<nome>.conflito-<data>.<ext>"; nenhum lado
 *    é sobrescrito até o autor escolher (resolver) ou apagar a cópia.
 *
 * Manifesto: <livro>/.sync/manifest.json
 */

export const MANIFEST_DIR = '.sync'

export interface Entry {
  /** MD5 local no momento da última sincronização bem-sucedida (base comum) */
  hash: string
  remoteId?: string
  remoteMd5?: string
  remoteModified?: string
  /** caminho relativo da cópia de conflito, enquanto não resolvido */
  conflito?: string
  conflitoEm?: string
}

export interface QueueItem {
  rel: string
  op: 'enviar' | 'remover'
  tentativas: number
  proximaEm: number
  erro?: string
}

export interface Manifest {
  versao: 1
  pastas: Record<string, string>
  arquivos: Record<string, Entry>
  cache: Record<string, { size: number; mtimeMs: number; md5: string }>
  fila: QueueItem[]
  ultimoEnvio?: string
  ultimaVerificacao?: string
  ultimaPuxada?: string
}

export interface ConflitoInfo {
  arquivo: string
  copia: string
  em: string
}

export interface BookStatus {
  pendentes: number
  conflitos: ConflitoInfo[]
  ultimoEnvio: string | null
  ultimaVerificacao: string | null
  ultimaPuxada: string | null
  enviando: boolean
  offline: boolean
  erro: string | null
  proximaTentativa: string | null
}

export interface PushResult {
  enviados: number
  removidos: number
  conflitos: number
  pendentes: number
}

export interface PullResult {
  baixados: number
  conflitos: number
}

export interface EngineOptions {
  incluirArca?: boolean
  now?: () => number
  /** pasta-mãe no Drive (padrão "Folio") */
  rootName?: string
}

const SKIP_TOP = new Set(['.build', 'export', MANIFEST_DIR, '.git', 'node_modules'])
const SKIP_NAME = /(\.tmp-[\w-]*$|\.tmp$|~$|^\.DS_Store$|^Thumbs\.db$)/

export function md5(b: Buffer): string {
  return createHash('md5').update(b).digest('hex')
}

/** Espera até a próxima tentativa: 5 s, 10 s, 20 s… até 30 min, com até 20% de variação. */
export function backoffMs(tentativas: number, rand: () => number = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, tentativas - 1), 30 * 60_000)
  return Math.round(base * (1 + rand() * 0.2))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "manuscrito/001-x.md" → "manuscrito/001-x.conflito-2026-11-06-1530.md" */
export function conflictName(rel: string, at: Date, n = 1): string {
  const dir = dirname(rel)
  const base = basename(rel)
  const ext = extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  const name = `${stem}.conflito-${stamp}${n > 1 ? `-${n}` : ''}${ext}`
  return dir === '.' ? name : `${dir}/${name}`
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

function emptyManifest(): Manifest {
  return { versao: 1, pastas: {}, arquivos: {}, cache: {}, fila: [] }
}

export class BookSync {
  private m: Manifest | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private rootChecked = false
  enviando = false
  offline = false
  erro: string | null = null

  constructor(
    readonly dir: string,
    private readonly remote: Remote,
    private readonly opts: EngineOptions = {}
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  private iso(): string {
    return new Date(this.now()).toISOString()
  }

  /** Serializa operações no mesmo livro. */
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  // ---------------- manifesto ----------------

  private get path(): string {
    return join(this.dir, MANIFEST_DIR, 'manifest.json')
  }

  async manifest(): Promise<Manifest> {
    if (this.m) return this.m
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<Manifest>
      this.m = { ...emptyManifest(), ...raw, versao: 1 }
    } catch {
      this.m = emptyManifest()
    }
    return this.m
  }

  private async save(): Promise<void> {
    if (!this.m) return
    await mkdir(join(this.dir, MANIFEST_DIR), { recursive: true })
    await atomicWrite(this.path, JSON.stringify(this.m, null, 1))
  }

  // ---------------- varredura local ----------------

  excluded(rel: string): boolean {
    const parts = rel.split('/')
    const top = parts[0] ?? ''
    if (SKIP_TOP.has(top)) return true
    if (top === '.arca' && !this.opts.incluirArca) return true
    return parts.some((p) => SKIP_NAME.test(p))
  }

  /** rel → md5 de todos os arquivos sincronizáveis (usa cache por tamanho+mtime). */
  async scan(): Promise<Map<string, string>> {
    const m = await this.manifest()
    const out = new Map<string, string>()
    const nextCache: Manifest['cache'] = {}
    const walk = async (relDir: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(join(this.dir, relDir), { withFileTypes: true })
      } catch {
        return
      }
      for (const ent of entries) {
        const rel = relDir ? `${relDir}/${ent.name}` : ent.name
        if (this.excluded(rel)) continue
        if (ent.isDirectory()) await walk(rel)
        else if (ent.isFile()) {
          try {
            const st = await stat(join(this.dir, rel))
            const c = m.cache[rel]
            let h: string
            if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) h = c.md5
            else h = md5(await readFile(join(this.dir, rel)))
            nextCache[rel] = { size: st.size, mtimeMs: st.mtimeMs, md5: h }
            out.set(rel, h)
          } catch {
            /* sumiu durante a varredura */
          }
        }
      }
    }
    await walk('')
    m.cache = nextCache
    return out
  }

  // ---------------- pastas remotas ----------------

  private async ensureRoot(): Promise<string> {
    const m = await this.manifest()
    const cached = m.pastas['']
    if (cached && !this.rootChecked) {
      const r = await this.remote.get(cached)
      if (!r) m.pastas = {}
      this.rootChecked = true
    }
    if (m.pastas['']) return m.pastas['']
    const folio = await this.remote.ensureFolder('root', this.opts.rootName ?? 'Folio', { folio: 'raiz' })
    const id = await this.remote.ensureFolder(folio, basename(this.dir), { folio: 'livro' })
    m.pastas = { '': id }
    this.rootChecked = true
    return id
  }

  private async ensureDir(relDir: string): Promise<string> {
    const m = await this.manifest()
    let id = await this.ensureRoot()
    if (relDir === '.' || relDir === '') return id
    let acc = ''
    for (const part of relDir.split('/')) {
      acc = acc ? `${acc}/${part}` : part
      const known = m.pastas[acc]
      if (known) {
        id = known
        continue
      }
      id = await this.remote.ensureFolder(id, part)
      m.pastas[acc] = id
    }
    return id
  }

  // ---------------- conflito ----------------

  private async writeLocal(rel: string, bytes: Buffer): Promise<void> {
    const abs = join(this.dir, rel)
    await mkdir(dirname(abs), { recursive: true })
    await atomicWrite(abs, bytes)
  }

  /** Grava a versão remota como cópia de conflito. Devolve false se os conteúdos eram iguais. */
  private async conflict(rel: string, r: RemoteFile, localBytes: Buffer | null): Promise<boolean> {
    const m = await this.manifest()
    const remoteBytes = await this.remote.download(r.id)
    const prev = m.arquivos[rel]
    if (localBytes && md5(remoteBytes) === md5(localBytes)) {
      m.arquivos[rel] = { hash: md5(localBytes), remoteId: r.id, remoteMd5: r.md5 ?? md5(remoteBytes), remoteModified: r.modifiedTime }
      return false
    }
    const at = new Date(this.now())
    let n = 1
    let copia = conflictName(rel, at)
    while (await exists(join(this.dir, copia))) copia = conflictName(rel, at, ++n)
    await this.writeLocal(copia, remoteBytes)
    m.arquivos[rel] = {
      hash: prev?.hash ?? '',
      remoteId: r.id,
      remoteMd5: r.md5 ?? md5(remoteBytes),
      remoteModified: r.modifiedTime,
      conflito: copia,
      conflitoEm: at.toISOString()
    }
    m.fila = m.fila.filter((q) => q.rel !== rel)
    return true
  }

  // ---------------- envio ----------------

  private enqueue(rel: string, op: QueueItem['op']): void {
    const m = this.m
    if (!m) return
    const cur = m.fila.find((q) => q.rel === rel)
    if (cur) {
      if (cur.op !== op) {
        cur.op = op
        cur.tentativas = 0
        cur.proximaEm = 0
        delete cur.erro
      }
      return
    }
    m.fila.push({ rel, op, tentativas: 0, proximaEm: 0 })
  }

  /** 'feito' (tirar da fila) ou 'conflito'. */
  private async enviar(rel: string): Promise<'feito' | 'conflito'> {
    const m = await this.manifest()
    let bytes: Buffer
    try {
      bytes = await readFile(join(this.dir, rel))
    } catch {
      return 'feito'
    }
    const hash = md5(bytes)
    const e = m.arquivos[rel]
    if (e?.conflito) return 'feito'
    const parent = await this.ensureDir(dirname(rel))
    const name = basename(rel)
    let target: RemoteFile | null = null
    if (e?.remoteId) {
      target = await this.remote.get(e.remoteId)
      if (target && target.md5 !== e.remoteMd5) return (await this.conflict(rel, target, bytes)) ? 'conflito' : 'feito'
    } else {
      const found = await this.remote.findChild(parent, name)
      if (found) {
        if (found.md5 !== hash) return (await this.conflict(rel, found, bytes)) ? 'conflito' : 'feito'
        target = found
      }
    }
    if (target && target.md5 === hash) {
      m.arquivos[rel] = { hash, remoteId: target.id, remoteMd5: target.md5, remoteModified: target.modifiedTime }
      return 'feito'
    }
    const up = await this.remote.upload(parent, name, bytes, target?.id)
    m.arquivos[rel] = { hash, remoteId: up.id, remoteMd5: up.md5 ?? hash, remoteModified: up.modifiedTime }
    m.ultimoEnvio = this.iso()
    return 'feito'
  }

  private async remover(rel: string): Promise<void> {
    const m = await this.manifest()
    if (await exists(join(this.dir, rel))) return
    const e = m.arquivos[rel]
    if (!e) return
    if (e.remoteId) {
      const r = await this.remote.get(e.remoteId)
      // se o remoto mudou depois da última sincronização, não apaga: o próximo pull traz de volta
      if (r && r.md5 === e.remoteMd5) {
        await this.remote.trash(r.id)
        m.ultimoEnvio = this.iso()
      }
    }
    delete m.arquivos[rel]
  }

  push(): Promise<PushResult> {
    return this.lock(() => this.pushNow())
  }

  private async pushNow(): Promise<PushResult> {
    const m = await this.manifest()
    const local = await this.scan()
    const res: PushResult = { enviados: 0, removidos: 0, conflitos: 0, pendentes: 0 }

    // cópia de conflito apagada pelo autor = ficar com a versão local
    for (const e of Object.values(m.arquivos)) {
      if (e.conflito && !local.has(e.conflito) && !(await exists(join(this.dir, e.conflito)))) {
        delete e.conflito
        delete e.conflitoEm
        e.hash = ''
      }
    }

    for (const [rel, h] of local) {
      const e = m.arquivos[rel]
      if (e?.conflito) continue
      if (!e || e.hash !== h) this.enqueue(rel, 'enviar')
    }
    const gone = Object.keys(m.arquivos).filter((rel) => !local.has(rel) && !m.arquivos[rel]?.conflito)
    // trava de segurança: pasta vazia/desmontada não pode virar "apague tudo no Drive"
    const total = Object.keys(m.arquivos).length
    const massDelete = gone.length > 5 && gone.length > total / 2
    if (massDelete) {
      this.erro = `${gone.length} arquivos sumiram do livro de uma vez; o Drive não foi alterado. Confira a pasta e clique em Sincronizar agora.`
    }
    for (const rel of gone) {
      if (!m.arquivos[rel]?.remoteId) delete m.arquivos[rel]
      else if (!massDelete) this.enqueue(rel, 'remover')
    }

    this.enviando = m.fila.length > 0
    let hadError = false
    try {
      for (const item of [...m.fila]) {
        if (item.proximaEm > this.now()) continue
        try {
          if (item.op === 'enviar') {
            const r = await this.enviar(item.rel)
            if (r === 'conflito') res.conflitos++
            else res.enviados++
          } else {
            await this.remover(item.rel)
            res.removidos++
          }
          m.fila = m.fila.filter((q) => q !== item)
          this.offline = false
          await this.save()
        } catch (e) {
          hadError = true
          item.tentativas++
          const retryAfter = e instanceof HttpError ? e.retryAfterMs : undefined
          item.proximaEm = this.now() + Math.max(backoffMs(item.tentativas), retryAfter ?? 0)
          item.erro = e instanceof Error ? e.message : String(e)
          await this.save()
          if (e instanceof OfflineError) {
            this.offline = true
            break
          }
          if (e instanceof AuthError) {
            this.erro = e.message
            break
          }
          if (e instanceof HttpError && e.status === 429) break
          this.erro = `Falha ao enviar ${item.rel}: ${item.erro}`
        }
      }
    } finally {
      this.enviando = false
    }
    if (!hadError && !massDelete) {
      this.erro = null
      if (m.fila.length === 0) m.ultimaVerificacao = this.iso()
    }
    await this.save()
    res.pendentes = m.fila.length
    return res
  }

  // ---------------- puxar ----------------

  pull(): Promise<PullResult> {
    return this.lock(() => this.pullNow())
  }

  private async walkRemote(folderId: string, relDir: string, out: Map<string, RemoteFile>): Promise<void> {
    const m = await this.manifest()
    for (const f of await this.remote.listChildren(folderId)) {
      const rel = relDir ? `${relDir}/${f.name}` : f.name
      if (f.name.includes('/') || f.name === '..' || f.name === '.' || this.excluded(rel)) continue
      if (f.folder) {
        m.pastas[rel] = f.id
        await this.walkRemote(f.id, rel, out)
      } else if (f.md5) {
        const prev = out.get(rel)
        // nomes repetidos no Drive: fica o mais recente
        if (!prev || prev.modifiedTime < f.modifiedTime) out.set(rel, f)
      }
    }
  }

  private async pullNow(): Promise<PullResult> {
    const m = await this.manifest()
    const res: PullResult = { baixados: 0, conflitos: 0 }
    try {
      const root = await this.ensureRoot()
      const tree = new Map<string, RemoteFile>()
      await this.walkRemote(root, '', tree)
      const local = await this.scan()
      for (const [rel, r] of tree) {
        const e = m.arquivos[rel]
        if (e?.conflito) continue
        if (e && e.remoteId === r.id && r.md5 === e.remoteMd5) continue
        const lh = local.get(rel)
        if (lh !== undefined && lh === r.md5) {
          m.arquivos[rel] = { hash: lh, remoteId: r.id, remoteMd5: r.md5, remoteModified: r.modifiedTime }
          continue
        }
        if (e && e.remoteId !== r.id && r.md5 === e.remoteMd5) {
          e.remoteId = r.id
          continue
        }
        const localUnchanged = lh === undefined || (e !== undefined && lh === e.hash)
        if (localUnchanged) {
          const bytes = await this.remote.download(r.id)
          if (r.md5 && md5(bytes) !== r.md5) throw new Error(`Download corrompido de ${rel}`)
          await this.writeLocal(rel, bytes)
          m.arquivos[rel] = { hash: md5(bytes), remoteId: r.id, remoteMd5: r.md5, remoteModified: r.modifiedTime }
          m.fila = m.fila.filter((q) => q.rel !== rel)
          res.baixados++
        } else {
          const bytes = await readFile(join(this.dir, rel))
          if (await this.conflict(rel, r, bytes)) res.conflitos++
        }
      }
      m.ultimaPuxada = this.iso()
      this.offline = false
    } catch (e) {
      if (e instanceof OfflineError) this.offline = true
      throw e
    } finally {
      await this.save()
    }
    return res
  }

  // ---------------- resolver conflito ----------------

  /**
   * 'local': a versão deste computador vai para o Drive (o Drive guarda a
   * anterior no histórico de versões; a cópia de conflito continua no disco).
   * 'remoto': a versão do Drive passa a ser a principal e a local vai para a
   * cópia de conflito. Nos dois casos nenhuma versão é perdida.
   */
  resolver(rel: string, escolha: 'local' | 'remoto'): Promise<void> {
    return this.lock(async () => {
      const m = await this.manifest()
      const e = m.arquivos[rel]
      if (!e?.conflito) throw new Error('Não há conflito neste arquivo')
      const copiaAbs = join(this.dir, e.conflito)
      if (escolha === 'remoto') {
        const remoteBytes = await readFile(copiaAbs)
        let localBytes: Buffer | null = null
        try {
          localBytes = await readFile(join(this.dir, rel))
        } catch {
          localBytes = null
        }
        if (localBytes) await this.writeLocal(e.conflito, localBytes)
        await this.writeLocal(rel, remoteBytes)
        e.hash = md5(remoteBytes)
      } else {
        e.hash = ''
      }
      delete e.conflito
      delete e.conflitoEm
      await this.save()
    })
  }

  // ---------------- estado ----------------

  async status(): Promise<BookStatus> {
    const m = await this.manifest()
    const next = m.fila.reduce<number | null>((min, q) => (min === null || q.proximaEm < min ? q.proximaEm : min), null)
    return {
      pendentes: m.fila.length,
      conflitos: Object.entries(m.arquivos)
        .filter(([, e]) => e.conflito)
        .map(([arquivo, e]) => ({ arquivo, copia: e.conflito ?? '', em: e.conflitoEm ?? '' })),
      ultimoEnvio: m.ultimoEnvio ?? null,
      ultimaVerificacao: m.ultimaVerificacao ?? null,
      ultimaPuxada: m.ultimaPuxada ?? null,
      enviando: this.enviando,
      offline: this.offline,
      erro: this.erro,
      proximaTentativa: next && next > this.now() ? new Date(next).toISOString() : null
    }
  }
}
