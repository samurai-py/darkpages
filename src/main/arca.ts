import { createHash } from 'node:crypto'
import { copyFile, link, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import YAML from 'yaml'
import { MOTIVOS, type MotivoSnapshot } from '../shared/versoes'

/**
 * A Arca: snapshots do manuscrito em `.arca/<carimbo>/`.
 *
 *   .arca/2026-11-07T14-03-22-118Z/
 *     manuscrito/NNN-slug.md   cópia dos capítulos naquele momento
 *     meta.json                { motivo, rotulo?, criadoEm, hash }
 *   .arca/lixeira/             capítulos excluídos (a retenção nunca toca aqui)
 *
 * Espaço: arquivos que não mudaram desde o snapshot anterior viram hardlink
 * para o mesmo conteúdo (custo zero em disco). Se o sistema de arquivos não
 * aceita hardlink (FAT, alguns drives de rede, pastas do Drive montadas), cai
 * para cópia comum. Ninguém edita arquivos dentro da Arca, então compartilhar
 * o mesmo inode entre snapshots é seguro.
 *
 * O snapshot é montado numa pasta temporária (`.arca/.novo-*`) e renomeado no
 * fim: quem lista a Arca nunca vê um snapshot pela metade.
 *
 * Retenção (roda depois de cada snapshot): tudo das últimas 24 h; um por dia
 * até 30 dias; um por semana depois disso. Snapshots manuais ou com rótulo
 * nunca são apagados.
 */

export const ARCA_DIR = '.arca'
export const LIXEIRA_DIR = 'lixeira'
const MS_DIR = 'manuscrito'
const CHAPTER_FILE = /^\d{3}-[a-z0-9-]+\.md$/
/** carimbo ISO com ":" e "." trocados por "-", com sufixo opcional "-N" */
const SNAP_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d{1,3})?$/
const DEDUPE_MS = 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

export interface MetaSnapshot {
  motivo: MotivoSnapshot
  rotulo?: string
  criadoEm: string
  /** sha1 do conteúdo (nomes + textos dos capítulos) */
  hash?: string
}

export interface Snapshot extends MetaSnapshot {
  id: string
  dir: string
}

export function carimbo(t = Date.now()): string {
  return new Date(t).toISOString().replace(/[:.]/g, '-')
}

/** "2026-11-07T14-03-22-118Z" → Date */
export function dataDoCarimbo(id: string): Date | null {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/)
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Valida o id de um snapshot e devolve a pasta (sempre dentro de .arca/). */
export function pastaSnapshot(dir: string, id: string): string {
  if (typeof id !== 'string' || !SNAP_ID.test(id)) throw new Error('Versão inválida')
  const base = resolve(dir, ARCA_DIR)
  const full = resolve(base, id)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return full
}

/** Arquivo de capítulo dentro de um snapshot, validado. */
export function capituloNoSnapshot(dir: string, id: string, file: string): string {
  if (!CHAPTER_FILE.test(file)) throw new Error(`Nome de capítulo inválido: ${file}`)
  const base = join(pastaSnapshot(dir, id), MS_DIR)
  const full = resolve(base, file)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return full
}

async function capitulosEm(pasta: string): Promise<string[]> {
  try {
    return (await readdir(pasta)).filter((f) => CHAPTER_FILE.test(f)).sort()
  } catch {
    return []
  }
}

/** Arquivos de capítulo de um snapshot. */
export function arquivosDoSnapshot(s: Snapshot): Promise<string[]> {
  return capitulosEm(join(s.dir, MS_DIR))
}

function motivoValido(v: unknown): MotivoSnapshot {
  return MOTIVOS.includes(v as MotivoSnapshot) ? (v as MotivoSnapshot) : 'automático'
}

async function lerMeta(pasta: string, id: string): Promise<MetaSnapshot> {
  const quando = dataDoCarimbo(id)?.toISOString() ?? new Date(0).toISOString()
  try {
    const j = JSON.parse(await readFile(join(pasta, 'meta.json'), 'utf8')) as Partial<MetaSnapshot>
    return {
      motivo: motivoValido(j.motivo),
      ...(typeof j.rotulo === 'string' && j.rotulo.trim() ? { rotulo: j.rotulo.trim().slice(0, 120) } : {}),
      criadoEm: typeof j.criadoEm === 'string' ? j.criadoEm : quando,
      ...(typeof j.hash === 'string' ? { hash: j.hash } : {})
    }
  } catch {
    // snapshots antigos (antes do meta.json): tratados como automáticos
    return { motivo: 'automático', criadoEm: quando }
  }
}

async function gravarMeta(pasta: string, meta: MetaSnapshot): Promise<void> {
  const tmp = join(pasta, `meta.json.tmp-${process.pid}`)
  await writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8')
  await rename(tmp, join(pasta, 'meta.json'))
}

/** Snapshots do livro, do mais novo para o mais antigo. */
export async function listarSnapshots(dir: string): Promise<Snapshot[]> {
  let nomes: string[]
  try {
    nomes = await readdir(join(dir, ARCA_DIR))
  } catch {
    return []
  }
  const out: Snapshot[] = []
  for (const id of nomes) {
    if (!SNAP_ID.test(id)) continue
    const pasta = join(dir, ARCA_DIR, id)
    try {
      if (!(await stat(pasta)).isDirectory()) continue
    } catch {
      continue
    }
    out.push({ id, dir: pasta, ...(await lerMeta(pasta, id)) })
  }
  return out.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : a.id < b.id ? 1 : -1))
}

async function hashPasta(pasta: string): Promise<string> {
  const h = createHash('sha1')
  for (const f of await capitulosEm(pasta)) {
    h.update(f)
    h.update('\0')
    h.update(await readFile(join(pasta, f)))
    h.update('\0')
  }
  return h.digest('hex')
}

/** Hash do snapshot (calcula e grava no meta.json se faltava). */
async function hashDo(s: Snapshot): Promise<string> {
  if (s.hash) return s.hash
  const h = await hashPasta(join(s.dir, MS_DIR))
  s.hash = h
  await gravarMeta(s.dir, { motivo: s.motivo, ...(s.rotulo ? { rotulo: s.rotulo } : {}), criadoEm: s.criadoEm, hash: h }).catch(() => undefined)
  return h
}

/** Hardlink quando o conteúdo é idêntico ao snapshot anterior; senão, cópia. */
async function guardar(origem: string, destino: string, anterior: string | null): Promise<void> {
  if (anterior) {
    try {
      const [a, b] = await Promise.all([stat(origem), stat(anterior)])
      if (a.size === b.size) {
        const [x, y] = await Promise.all([readFile(origem), readFile(anterior)])
        if (x.equals(y)) {
          await link(anterior, destino)
          return
        }
      }
    } catch {
      /* sem hardlink (ou o anterior sumiu): copia */
    }
  }
  await copyFile(origem, destino)
}

/** Fila por livro: snapshots e podas do mesmo livro nunca se cruzam. */
const filas = new Map<string, Promise<unknown>>()
function emFila<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = filas.get(dir) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => undefined)
  filas.set(dir, tail)
  void tail.then(() => {
    if (filas.get(dir) === tail) filas.delete(dir)
  })
  return run
}

/**
 * Tira um snapshot do manuscrito agora. Se o conteúdo é idêntico a um snapshot
 * do último minuto (ou, no automático, ao último snapshot), não duplica:
 * devolve o existente. Um snapshot manual sobre um idêntico recente promove o
 * existente a manual (com o rótulo), para que a retenção não o apague.
 */
export function snapshotAgora(dir: string, motivo: MotivoSnapshot, rotulo?: string): Promise<Snapshot> {
  return emFila(dir, async () => {
    const ms = join(dir, MS_DIR)
    const hash = await hashPasta(ms)
    const agora = Date.now()
    const todos = await listarSnapshots(dir)
    const rot = rotulo?.trim().slice(0, 120) || undefined

    for (const s of todos) {
      const recente = agora - new Date(s.criadoEm).getTime() < DEDUPE_MS
      if (!recente && !(motivo === 'automático' && s === todos[0])) break
      if ((await hashDo(s)) !== hash) continue
      if (motivo === 'manual' && (s.motivo !== 'manual' || rot)) {
        s.motivo = 'manual'
        if (rot) s.rotulo = rot
        await gravarMeta(s.dir, { motivo: s.motivo, ...(s.rotulo ? { rotulo: s.rotulo } : {}), criadoEm: s.criadoEm, hash })
      }
      return s
    }

    let id = carimbo(agora)
    for (let n = 2; todos.some((s) => s.id === id); n++) id = `${carimbo(agora)}-${n}`
    const tmp = join(dir, ARCA_DIR, `.novo-${id}`)
    const anterior = todos[0] ? join(todos[0].dir, MS_DIR) : null
    await mkdir(join(tmp, MS_DIR), { recursive: true })
    try {
      for (const f of await capitulosEm(ms)) await guardar(join(ms, f), join(tmp, MS_DIR, f), anterior ? join(anterior, f) : null)
      const meta: MetaSnapshot = { motivo, ...(rot ? { rotulo: rot } : {}), criadoEm: new Date(agora).toISOString(), hash }
      await gravarMeta(tmp, meta)
      await rename(tmp, join(dir, ARCA_DIR, id))
      await podar(dir, agora).catch(() => undefined)
      return { id, dir: join(dir, ARCA_DIR, id), ...meta }
    } catch (e) {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      throw e
    }
  })
}

/** Muda motivo/rótulo de um snapshot existente (o "manual" o protege da poda). */
export function rotularSnapshot(dir: string, id: string, rotulo: string): Promise<Snapshot> {
  return emFila(dir, async () => {
    const pasta = pastaSnapshot(dir, id)
    const meta = await lerMeta(pasta, id)
    const r = rotulo.trim().slice(0, 120)
    const novo: MetaSnapshot = { ...meta, motivo: r ? 'manual' : meta.motivo }
    if (r) novo.rotulo = r
    else delete novo.rotulo
    await gravarMeta(pasta, novo)
    return { id, dir: pasta, ...novo }
  })
}

function protegido(s: Snapshot): boolean {
  return s.motivo === 'manual' || !!s.rotulo
}

/** Chave do dia local (AAAA-MM-DD). */
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Chave da semana ISO (ano-semana). */
function chaveSemana(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dia = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dia)
  const ano = t.getUTCFullYear()
  const semana = Math.ceil(((t.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS + 1) / 7)
  return `${ano}-S${semana}`
}

/**
 * Decide quais snapshots apagar. Puro (testável): recebe a lista e o "agora".
 * Em cada dia (24 h–30 dias) ou semana (mais de 30 dias) fica o mais novo.
 */
export function aPodar(snaps: Array<Pick<Snapshot, 'id' | 'criadoEm' | 'motivo' | 'rotulo'>>, agora: number): string[] {
  const vistos = new Set<string>()
  const apagar: string[] = []
  const ordenados = [...snaps].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
  for (const s of ordenados) {
    const t = new Date(s.criadoEm)
    const idade = agora - t.getTime()
    if (idade < DIA_MS || protegido(s as Snapshot)) continue
    const chave = idade < 30 * DIA_MS ? `d:${chaveDia(t)}` : `s:${chaveSemana(t)}`
    if (vistos.has(chave)) apagar.push(s.id)
    else vistos.add(chave)
  }
  return apagar
}

/** Aplica a retenção. Nunca toca na lixeira nem em pastas que não são snapshots. */
export async function podar(dir: string, agora = Date.now()): Promise<string[]> {
  const snaps = await listarSnapshots(dir)
  const ids = aPodar(snaps, agora)
  for (const id of ids) await rm(pastaSnapshot(dir, id), { recursive: true, force: true })
  return ids
}

// ---------------------------------------------------------------------------
// leitura de capítulo (front-matter mínimo, igual ao formato de project.ts)
// ---------------------------------------------------------------------------

export interface CapituloBruto {
  titulo: string
  body: string
  id?: string
}

export function lerCapituloBruto(raw: string, file: string): CapituloBruto {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { titulo: file.replace(/\.md$/, ''), body: raw }
  let fm: Record<string, unknown> = {}
  try {
    const p: unknown = YAML.parse(m[1] ?? '')
    if (p && typeof p === 'object' && !Array.isArray(p)) fm = p as Record<string, unknown>
  } catch {
    /* front-matter quebrado: só o texto */
  }
  return {
    titulo: typeof fm.titulo === 'string' ? fm.titulo : file.replace(/\.md$/, ''),
    body: (m[2] ?? '').replace(/^\n+/, ''),
    ...(typeof fm.id === 'string' ? { id: fm.id } : {})
  }
}
