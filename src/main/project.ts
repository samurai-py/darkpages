import { mkdir, readdir, readFile, rename, writeFile, cp, stat } from 'node:fs/promises'
import type { CenaMeta } from '../shared/models'
import { join, basename, resolve, sep } from 'node:path'
import YAML from 'yaml'
import {
  DEFAULT_LAYOUT,
  countWords,
  type ChapterContent,
  type ChapterInfo,
  type ChapterKind,
  type LayoutSettings,
  type Project,
  type ProjectMeta,
  type SaveResult
} from '../shared/types'

/**
 * Formato do projeto (pasta legível, versionável fora do app):
 *
 *   MeuLivro.folio/
 *     projeto.yaml          metadados + diagramação
 *     manuscrito/NNN-slug.md  front-matter (titulo, tipo) + texto em Markdown
 *     .arca/<timestamp>/    snapshots do manuscrito
 *     .build/               arquivos temporários do Typst
 *     export/               PDFs e EPUBs gerados
 */

const META_FILE = 'projeto.yaml'
const MS_DIR = 'manuscrito'
const ARCA_DIR = '.arca'
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000
const CHAPTER_FILE = /^\d{3}-[a-z0-9-]+\.md$/
/** prefixo temporário usado ao reordenar (dois passos, recuperável) */
const REORDER_PREFIX = '__reord-'
const LIXEIRA_DIR = 'lixeira'

const lastSnapshot = new Map<string, number>()

/** Fila por arquivo: leituras-modificações-escritas do mesmo capítulo nunca se cruzam. */
const locks = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => undefined)
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'sem-titulo'
  )
}

/** Garante que `file` é um nome de capítulo válido e não escapa da pasta. */
function chapterPath(dir: string, file: string): string {
  if (!CHAPTER_FILE.test(file)) throw new Error(`Nome de capítulo inválido: ${file}`)
  const base = resolve(dir, MS_DIR)
  const full = resolve(base, file)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return full
}

async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, path)
}

/** Front-matter do capítulo. Campos desconhecidos são preservados ao regravar. */
interface FrontMatter {
  titulo?: string
  tipo?: ChapterKind
  cena?: CenaMeta
  ignorados?: string[]
  [k: string]: unknown
}

function parseChapter(raw: string): { fm: FrontMatter; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const parsed: unknown = YAML.parse(m[1] ?? '')
  const fm = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as FrontMatter
  return { fm, body: m[2] ?? '' }
}

/** Remove chaves vazias para não sujar o front-matter. */
function clean(fm: FrontMatter): FrontMatter {
  const out: FrontMatter = {}
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && x !== ''))
      if (Object.keys(inner).length === 0) continue
      out[k] = inner
      continue
    }
    out[k] = v
  }
  return out
}

function serializeChapter(fm: FrontMatter, body: string): string {
  const { titulo, tipo, ...rest } = fm
  const ordered = clean({ titulo, tipo: kindOf(tipo), ...rest })
  return `---\n${YAML.stringify(ordered).trimEnd()}\n---\n\n${body.replace(/^\n+/, '')}`
}

function kindOf(v: unknown): ChapterKind {
  return v === 'prologo' || v === 'epilogo' ? v : 'capitulo'
}

function metaFromYaml(raw: string): ProjectMeta {
  const y = (YAML.parse(raw) ?? {}) as Partial<ProjectMeta>
  const l = (y.layout ?? {}) as Partial<LayoutSettings>
  return {
    title: String(y.title ?? 'Sem título'),
    author: String(y.author ?? ''),
    layout: {
      ...DEFAULT_LAYOUT,
      ...l,
      trim: { ...DEFAULT_LAYOUT.trim, ...(l.trim ?? {}) },
      margins: { ...DEFAULT_LAYOUT.margins, ...(l.margins ?? {}) },
      paper: { ...DEFAULT_LAYOUT.paper, ...(l.paper ?? {}) }
    }
  }
}

export async function openProject(dir: string): Promise<Project> {
  await recoverReorder(dir)
  const meta = metaFromYaml(await readFile(join(dir, META_FILE), 'utf8'))
  const files = (await readdir(join(dir, MS_DIR))).filter((f) => CHAPTER_FILE.test(f)).sort()
  const chapters: ChapterInfo[] = []
  for (const file of files) {
    const { fm, body } = parseChapter(await readFile(join(dir, MS_DIR, file), 'utf8'))
    chapters.push({
      file,
      title: fm.titulo ?? basename(file, '.md'),
      kind: kindOf(fm.tipo),
      words: countWords(body)
    })
  }
  return { dir, meta, chapters }
}

export async function createProject(parent: string, title: string, author: string): Promise<Project> {
  const dir = join(parent, `${slugify(title)}.folio`)
  try {
    await stat(dir)
    throw new Error(`Já existe uma pasta ${dir}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await mkdir(join(dir, MS_DIR), { recursive: true })
  const meta: ProjectMeta = { title, author, layout: DEFAULT_LAYOUT }
  await atomicWrite(join(dir, META_FILE), YAML.stringify(meta))
  await atomicWrite(
    join(dir, MS_DIR, '001-capitulo-um.md'),
    serializeChapter({ titulo: 'Capítulo um', tipo: 'capitulo' }, 'Comece a escrever aqui.\n')
  )
  return openProject(dir)
}

export async function readChapter(dir: string, file: string): Promise<ChapterContent> {
  const { fm, body } = parseChapter(await readFile(chapterPath(dir, file), 'utf8'))
  return {
    file,
    title: fm.titulo ?? basename(file, '.md'),
    kind: kindOf(fm.tipo),
    body,
    cena: fm.cena && typeof fm.cena === 'object' ? fm.cena : {},
    ignorados: Array.isArray(fm.ignorados) ? fm.ignorados.map(String) : []
  }
}

async function snapshotIfDue(dir: string): Promise<boolean> {
  const now = Date.now()
  if (now - (lastSnapshot.get(dir) ?? 0) < SNAPSHOT_EVERY_MS) return false
  lastSnapshot.set(dir, now)
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
  await cp(join(dir, MS_DIR), join(dir, ARCA_DIR, stamp, MS_DIR), { recursive: true })
  return true
}

export async function saveChapter(dir: string, file: string, title: string, body: string): Promise<SaveResult> {
  const path = chapterPath(dir, file)
  await withLock(path, async () => {
    const { fm } = parseChapter(await readFile(path, 'utf8'))
    await atomicWrite(path, serializeChapter({ ...fm, titulo: title }, body))
  })
  const snapshot = await snapshotIfDue(dir)
  return { savedAt: new Date().toISOString(), words: countWords(body), snapshot }
}

export async function addChapter(dir: string, title: string): Promise<Project> {
  const files = (await readdir(join(dir, MS_DIR))).filter((f) => CHAPTER_FILE.test(f)).sort()
  const last = files.at(-1)
  const next = last ? Number(last.slice(0, 3)) + 1 : 1
  const file = `${String(next).padStart(3, '0')}-${slugify(title)}.md`
  await atomicWrite(join(dir, MS_DIR, file), serializeChapter({ titulo: title, tipo: 'capitulo' }, ''))
  return openProject(dir)
}

export async function saveLayout(dir: string, layout: LayoutSettings): Promise<Project> {
  const p = await openProject(dir)
  await atomicWrite(join(dir, META_FILE), YAML.stringify({ ...p.meta, layout }))
  return openProject(dir)
}

// ---------------------------------------------------------------------------
// Operações de estrutura do manuscrito (feature Manuscrito)
// ---------------------------------------------------------------------------

async function chapterFiles(dir: string): Promise<string[]> {
  return (await readdir(join(dir, MS_DIR))).filter((f) => CHAPTER_FILE.test(f)).sort()
}

/** Atualiza campos do front-matter sem tocar no texto. `undefined` mantém; `null` remove. */
export async function updateChapterMeta(
  dir: string,
  file: string,
  patch: { titulo?: string; tipo?: ChapterKind; cena?: CenaMeta | null; ignorados?: string[] | null }
): Promise<ChapterContent> {
  const path = chapterPath(dir, file)
  await withLock(path, async () => {
    const { fm, body } = parseChapter(await readFile(path, 'utf8'))
    const next: FrontMatter = { ...fm }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      if (v === null) delete next[k]
      else next[k] = v
    }
    await atomicWrite(path, serializeChapter(next, body))
  })
  return readChapter(dir, file)
}

/**
 * Se um reordenamento foi interrompido, termina de renomear os arquivos
 * temporários ("__reord-NNN-slug.md" → "NNN-slug.md").
 */
async function recoverReorder(dir: string): Promise<void> {
  let all: string[]
  try {
    all = await readdir(join(dir, MS_DIR))
  } catch {
    return
  }
  const stuck = all.filter((f) => f.startsWith(REORDER_PREFIX))
  for (const tmp of stuck) {
    const final = tmp.slice(REORDER_PREFIX.length)
    if (!CHAPTER_FILE.test(final)) continue
    if (all.includes(final)) continue
    await rename(join(dir, MS_DIR, tmp), join(dir, MS_DIR, final))
  }
}

/**
 * Reordena: `order` lista TODOS os capítulos atuais na nova ordem. Os prefixos
 * NNN são renumerados (001, 002…) mantendo o slug. Renomeia em dois passos
 * (para nomes temporários e depois para os finais) para nunca sobrescrever um
 * arquivo; se o processo cair no meio, `openProject` conclui a operação.
 * Devolve o mapa nome antigo → nome novo (só os que mudaram).
 */
export async function reorderChapters(dir: string, order: string[]): Promise<Record<string, string>> {
  const current = await chapterFiles(dir)
  const same = order.length === current.length && new Set(order).size === order.length && order.every((f) => current.includes(f))
  if (!same) throw new Error('A lista de capítulos mudou; recarregue e tente de novo')
  const renamed: Record<string, string> = {}
  order.forEach((file, i) => {
    const target = `${String(i + 1).padStart(3, '0')}${file.slice(3)}`
    if (target !== file) renamed[file] = target
  })
  const moves = Object.entries(renamed)
  if (moves.length === 0) return renamed
  await snapshotNow(dir)
  for (const [from, to] of moves) {
    await rename(chapterPath(dir, from), join(dir, MS_DIR, REORDER_PREFIX + to))
  }
  for (const [, to] of moves) {
    await rename(join(dir, MS_DIR, REORDER_PREFIX + to), chapterPath(dir, to))
  }
  return renamed
}

/** Tira um capítulo do livro movendo-o para .arca/lixeira/ (recuperável à mão). */
export async function deleteChapter(dir: string, file: string): Promise<string> {
  const path = chapterPath(dir, file)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bin = join(dir, ARCA_DIR, LIXEIRA_DIR)
  await mkdir(bin, { recursive: true })
  const dest = join(bin, `${stamp}-${file}`)
  await rename(path, dest)
  return dest
}

/** Acrescenta vários capítulos ao fim do livro (importação). Devolve os nomes criados. */
export async function appendChapters(
  dir: string,
  items: Array<{ title: string; kind: ChapterKind; body: string }>
): Promise<string[]> {
  const files = await chapterFiles(dir)
  let next = files.length ? Number(files.at(-1)!.slice(0, 3)) + 1 : 1
  if (next + items.length > 999) throw new Error('Limite de 999 capítulos atingido')
  const created: string[] = []
  for (const it of items) {
    const file = `${String(next).padStart(3, '0')}-${slugify(it.title)}.md`
    await atomicWrite(join(dir, MS_DIR, file), serializeChapter({ titulo: it.title, tipo: it.kind }, it.body))
    created.push(file)
    next++
  }
  return created
}

/** Snapshot imediato do manuscrito (antes de operações estruturais). */
export async function snapshotNow(dir: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await cp(join(dir, MS_DIR), join(dir, ARCA_DIR, stamp, MS_DIR), { recursive: true })
  lastSnapshot.set(dir, Date.now())
}
