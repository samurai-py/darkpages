import { readdir, readFile, realpath, rename, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { bookDir, str, type Ctx, type Handlers } from '../api/context'
import { openProject, readChapter, saveChapter, slugify } from '../project'
import {
  ARCA_DIR,
  LIXEIRA_DIR,
  arquivosDoSnapshot,
  capituloNoSnapshot,
  dataDoCarimbo,
  lerCapituloBruto,
  listarSnapshots,
  pastaSnapshot,
  rotularSnapshot,
  snapshotAgora,
  type Snapshot
} from '../arca'
import { diffPalavras } from '../diff'
import { countWords, type ChapterContent, type Project } from '../../shared/types'
import type { DiffConflito, DiffVersao, ItemLixeira, SnapshotInfo, VersaoCapitulo } from '../../shared/versoes'

/**
 * Métodos da feature Versões (prefixo "versoes."): lista os snapshots da Arca,
 * compara um capítulo com uma versão (diff por palavra), restaura, recupera
 * capítulos da lixeira e mostra o diff de um conflito com o Drive.
 *
 * Todo caminho vindo da interface é validado: ids de snapshot só pelo formato
 * do carimbo, capítulos só pelo padrão NNN-slug.md, e arquivos de conflito
 * precisam resolver (inclusive por symlink) para dentro da pasta do livro.
 */

const MS_DIR = 'manuscrito'
const CHAPTER_FILE = /^\d{3}-[a-z0-9-]+\.md$/
const LIXO = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(\d{3}-[a-z0-9-]+\.md)$/
const MAX_TEXTO = 8 * 1024 * 1024

function capFile(v: unknown): string {
  const f = str(v, 200)
  if (!CHAPTER_FILE.test(f)) throw new Error('Capítulo inválido')
  return f
}

const semQuebrasIniciais = (s: string): string => s.replace(/^\n+/, '')

async function lerSeExiste(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

/** Capítulo atual: texto, título e id estável do front-matter (se houver). */
async function atual(dir: string, file: string): Promise<{ cap: ChapterContent; id?: string }> {
  const cap = await readChapter(dir, file)
  const raw = await readFile(join(dir, MS_DIR, file), 'utf8')
  const { id } = lerCapituloBruto(raw, file)
  return { cap, ...(id ? { id } : {}) }
}

/**
 * Acha o mesmo capítulo dentro de um snapshot: pelo id estável do
 * front-matter, depois pelo nome do arquivo, depois pelo slug (o prefixo NNN
 * muda quando o livro é reordenado).
 */
async function acharNoSnapshot(s: Snapshot, file: string, id: string | undefined): Promise<string | null> {
  const arquivos = await arquivosDoSnapshot(s)
  if (id) {
    for (const f of arquivos) {
      const raw = await lerSeExiste(join(s.dir, MS_DIR, f))
      if (raw && lerCapituloBruto(raw, f).id === id) return f
    }
  }
  if (arquivos.includes(file)) return file
  const slug = file.slice(4)
  const mesmos = arquivos.filter((f) => f.slice(4) === slug)
  return mesmos.length === 1 ? mesmos[0]! : null
}

async function snapshotPorId(dir: string, id: unknown): Promise<Snapshot> {
  const sid = str(id, 100)
  pastaSnapshot(dir, sid)
  const s = (await listarSnapshots(dir)).find((x) => x.id === sid)
  if (!s) throw new Error('Essa versão não existe mais')
  return s
}

function info(s: Snapshot): Pick<SnapshotInfo, 'id' | 'motivo' | 'rotulo' | 'criadoEm'> {
  return { id: s.id, motivo: s.motivo, ...(s.rotulo ? { rotulo: s.rotulo } : {}), criadoEm: s.criadoEm }
}

async function listar(dir: string): Promise<SnapshotInfo[]> {
  const ms = join(dir, MS_DIR)
  const atuais = (await readdir(ms)).filter((f) => CHAPTER_FILE.test(f)).sort()
  const textos = new Map<string, string>()
  for (const f of atuais) textos.set(f, (await lerSeExiste(join(ms, f))) ?? '')
  const out: SnapshotInfo[] = []
  for (const s of await listarSnapshots(dir)) {
    const arquivos = await arquivosDoSnapshot(s)
    const diferentes: string[] = []
    for (const f of atuais) {
      const antigo = arquivos.includes(f) ? await lerSeExiste(join(s.dir, MS_DIR, f)) : null
      if (antigo !== textos.get(f)) diferentes.push(f)
    }
    for (const f of arquivos) if (!textos.has(f)) diferentes.push(f)
    out.push({ ...info(s), arquivos, diferentes })
  }
  return out
}

async function doCapitulo(dir: string, file: string): Promise<VersaoCapitulo[]> {
  const { cap, id } = await atual(dir, file)
  const corpo = semQuebrasIniciais(cap.body)
  const out: VersaoCapitulo[] = []
  for (const s of await listarSnapshots(dir)) {
    const f = await acharNoSnapshot(s, file, id)
    if (!f) continue
    const raw = await lerSeExiste(capituloNoSnapshot(dir, s.id, f))
    if (raw === null) continue
    const v = lerCapituloBruto(raw, f)
    out.push({ ...info(s), arquivo: f, titulo: v.titulo, palavras: countWords(v.body), igual: v.body === corpo && v.titulo === cap.title })
  }
  return out
}

async function lerVersao(dir: string, sid: unknown, file: string): Promise<{ titulo: string; body: string; arquivo: string; atual: ChapterContent }> {
  const s = await snapshotPorId(dir, sid)
  const { cap, id } = await atual(dir, file)
  const f = await acharNoSnapshot(s, file, id)
  if (!f) throw new Error('Este capítulo não existia nessa versão')
  const raw = await readFile(capituloNoSnapshot(dir, s.id, f), 'utf8')
  const v = lerCapituloBruto(raw, f)
  return { titulo: v.titulo, body: v.body, arquivo: f, atual: cap }
}

/** Arquivo relativo do livro, resolvido e conferido (inclusive por symlink). */
async function dentroDoLivro(dir: string, rel: unknown): Promise<string> {
  const r = str(rel, 1000)
  if (!r || r.includes('\0')) throw new Error('Caminho inválido')
  const base = await realpath(resolve(dir))
  const full = resolve(base, r)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  const real = await realpath(full)
  if (!real.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return real
}

async function lerTexto(p: string): Promise<string | null> {
  const st = await stat(p)
  if (!st.isFile() || st.size > MAX_TEXTO) return null
  const buf = await readFile(p)
  if (buf.includes(0)) return null
  return buf.toString('utf8')
}

async function reabrir(ctx: Ctx, dir: string): Promise<Project> {
  return ctx.remember(await openProject(dir))
}

export const handlers: Handlers = {
  /** Snapshots do livro, do mais novo ao mais antigo, com os capítulos que diferem do atual. → SnapshotInfo[] */
  'versoes.listar': async (ctx, dir) => listar(await bookDir(ctx, dir)),

  /** Versões de um capítulo (só snapshots onde ele existe). → VersaoCapitulo[] */
  'versoes.capitulo': async (ctx, dir, file) => doCapitulo(await bookDir(ctx, dir), capFile(file)),

  /** Texto do capítulo numa versão. → { titulo, body, arquivo } */
  'versoes.ler': async (ctx, dir, id, file) => {
    const v = await lerVersao(await bookDir(ctx, dir), id, capFile(file))
    return { titulo: v.titulo, body: v.body, arquivo: v.arquivo }
  },

  /** Diff por palavra: da versão (antes) para o texto atual (depois). → DiffVersao */
  'versoes.diff': async (ctx, dir, id, file): Promise<DiffVersao> => {
    const v = await lerVersao(await bookDir(ctx, dir), id, capFile(file))
    return { ...diffPalavras(v.body, semQuebrasIniciais(v.atual.body)), tituloVersao: v.titulo, tituloAtual: v.atual.title }
  },

  /**
   * Volta o capítulo ao texto (e título) da versão. Antes, guarda o estado
   * atual num snapshot "antes de restaurar": restaurar nunca perde nada.
   * O front-matter atual (cena, ignorados, id) é mantido. → { project, capitulo }
   */
  'versoes.restaurar': async (ctx, dir, id, file) => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const v = await lerVersao(d, id, f)
    await snapshotAgora(d, 'antes de restaurar')
    await saveChapter(d, f, v.titulo, v.body)
    return { project: await reabrir(ctx, d), capitulo: await readChapter(d, f) }
  },

  /** "Salvar versão agora", com rótulo opcional. Nunca é apagada pela retenção. → SnapshotInfo */
  'versoes.salvar': async (ctx, dir, rotulo) => {
    const d = await bookDir(ctx, dir)
    const r = rotulo === undefined || rotulo === null ? '' : str(rotulo, 120)
    const s = await snapshotAgora(d, 'manual', r)
    return { ...info(s), arquivos: await arquivosDoSnapshot(s), diferentes: [] } satisfies SnapshotInfo
  },

  /** Dá (ou tira) o rótulo de uma versão existente; com rótulo ela fica protegida. → SnapshotInfo */
  'versoes.rotular': async (ctx, dir, id, rotulo) => {
    const d = await bookDir(ctx, dir)
    const s = await rotularSnapshot(d, str(id, 100), str(rotulo, 120))
    return { ...info(s), arquivos: await arquivosDoSnapshot(s), diferentes: [] } satisfies SnapshotInfo
  },

  /** Capítulos excluídos (em .arca/lixeira/), do mais recente ao mais antigo. → ItemLixeira[] */
  'versoes.lixeira': async (ctx, dir): Promise<ItemLixeira[]> => {
    const d = await bookDir(ctx, dir)
    const pasta = join(d, ARCA_DIR, LIXEIRA_DIR)
    let nomes: string[]
    try {
      nomes = await readdir(pasta)
    } catch {
      return []
    }
    const out: ItemLixeira[] = []
    for (const nome of nomes) {
      const m = nome.match(LIXO)
      if (!m) continue
      const raw = await lerSeExiste(join(pasta, nome))
      if (raw === null) continue
      const c = lerCapituloBruto(raw, m[2]!)
      out.push({
        nome,
        arquivo: m[2]!,
        titulo: c.titulo,
        palavras: countWords(c.body),
        excluidoEm: dataDoCarimbo(m[1]!)?.toISOString() ?? ''
      })
    }
    return out.sort((a, b) => (a.excluidoEm < b.excluidoEm ? 1 : -1))
  },

  /** Devolve um capítulo da lixeira ao fim do livro (nome novo, sem sobrescrever). → { project, arquivo } */
  'versoes.recuperar': async (ctx, dir, nome) => {
    const d = await bookDir(ctx, dir)
    const n = str(nome, 300)
    const m = n.match(LIXO)
    if (!m) throw new Error('Item da lixeira inválido')
    const pasta = resolve(d, ARCA_DIR, LIXEIRA_DIR)
    const origem = resolve(pasta, n)
    if (!origem.startsWith(pasta + sep)) throw new Error('Caminho fora do projeto')
    const ms = join(d, MS_DIR)
    const atuais = (await readdir(ms)).filter((f) => CHAPTER_FILE.test(f)).sort()
    const prox = atuais.length ? Number(atuais.at(-1)!.slice(0, 3)) + 1 : 1
    if (prox > 999) throw new Error('Limite de 999 capítulos atingido')
    const slug = slugify(m[2]!.slice(4, -3))
    let arquivo = `${String(prox).padStart(3, '0')}-${slug}.md`
    for (let i = 2; atuais.includes(arquivo); i++) arquivo = `${String(prox).padStart(3, '0')}-${slug}-${i}.md`
    if (!CHAPTER_FILE.test(arquivo)) throw new Error('Nome de capítulo inválido')
    try {
      await stat(join(ms, arquivo))
      throw new Error('Já existe um capítulo com esse nome; tente de novo')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    await rename(origem, join(ms, arquivo))
    return { project: await reabrir(ctx, d), arquivo }
  },

  /**
   * Conflito do Drive: diff da versão deste computador (antes) para a cópia
   * ".conflito-*" vinda do Drive (depois). Os dois caminhos são relativos ao
   * livro e precisam ficar dentro dele. → DiffConflito
   */
  'versoes.conflito': async (ctx, dir, arquivo, copia): Promise<DiffConflito> => {
    const d = await bookDir(ctx, dir)
    const a = str(arquivo, 1000)
    const c = str(copia, 1000)
    if (!/\.conflito-[^/\\]+$/.test(c)) throw new Error('Cópia de conflito inválida')
    const [pa, pc] = await Promise.all([dentroDoLivro(d, a), dentroDoLivro(d, c)])
    const [ta, tc] = await Promise.all([lerTexto(pa), lerTexto(pc)])
    if (ta === null || tc === null) return { arquivo: a, copia: c, texto: false, ops: [], adicionadas: 0, removidas: 0, porPalavra: false }
    return { arquivo: a, copia: c, texto: true, ...diffPalavras(ta, tc) }
  }
}
