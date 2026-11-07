import { mkdir, readdir, readFile, rename, writeFile, cp, stat } from 'node:fs/promises'
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

const lastSnapshot = new Map<string, number>()

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

interface FrontMatter {
  titulo?: string
  tipo?: ChapterKind
}

function parseChapter(raw: string): { fm: FrontMatter; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm = (YAML.parse(m[1] ?? '') ?? {}) as FrontMatter
  return { fm, body: m[2] ?? '' }
}

function serializeChapter(title: string, kind: ChapterKind, body: string): string {
  return `---\n${YAML.stringify({ titulo: title, tipo: kind }).trimEnd()}\n---\n\n${body.replace(/^\n+/, '')}`
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
    serializeChapter('Capítulo um', 'capitulo', 'Comece a escrever aqui.\n')
  )
  return openProject(dir)
}

export async function readChapter(dir: string, file: string): Promise<ChapterContent> {
  const { fm, body } = parseChapter(await readFile(chapterPath(dir, file), 'utf8'))
  return { file, title: fm.titulo ?? basename(file, '.md'), kind: kindOf(fm.tipo), body }
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
  const { fm } = parseChapter(await readFile(path, 'utf8'))
  await atomicWrite(path, serializeChapter(title, kindOf(fm.tipo), body))
  const snapshot = await snapshotIfDue(dir)
  return { savedAt: new Date().toISOString(), words: countWords(body), snapshot }
}

export async function addChapter(dir: string, title: string): Promise<Project> {
  const files = (await readdir(join(dir, MS_DIR))).filter((f) => CHAPTER_FILE.test(f)).sort()
  const last = files.at(-1)
  const next = last ? Number(last.slice(0, 3)) + 1 : 1
  const file = `${String(next).padStart(3, '0')}-${slugify(title)}.md`
  await atomicWrite(join(dir, MS_DIR, file), serializeChapter(title, 'capitulo', ''))
  return openProject(dir)
}

export async function saveLayout(dir: string, layout: LayoutSettings): Promise<Project> {
  const p = await openProject(dir)
  await atomicWrite(join(dir, META_FILE), YAML.stringify({ ...p.meta, layout }))
  return openProject(dir)
}
