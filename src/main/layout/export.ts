import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openProject, readChapter, slugify } from '../project'
import { spineWidthMm, type ChapterContent, type ExportResult, type Project } from '../../shared/types'
import { stageAberturas } from './assets'
import { buildBookTypst } from './typst-source'
import { compileTypst, findTypst, writeSource } from './typst'

export interface PreparedBook {
  project: Project
  chapters: ChapterContent[]
  source: string
  typst: string
  buildDir: string
  fontDirs: string[]
}

/** Lê o livro, copia as artes para .build/ e gera o código Typst do miolo. */
export async function prepareBook(dir: string, resourcesDir: string): Promise<PreparedBook> {
  const project = await openProject(dir)
  const chapters = await Promise.all(project.chapters.map((c) => readChapter(dir, c.file)))
  const buildDir = join(dir, '.build')
  const aberturas = await stageAberturas(dir, buildDir, project.chapters)
  return {
    project,
    chapters,
    source: buildBookTypst(project.meta, chapters, { aberturas }),
    typst: await findTypst(resourcesDir),
    buildDir,
    fontDirs: [join(resourcesDir, 'fonts')]
  }
}

/** Grava o .typ do miolo em .build/ com o nome dado (prévia e checagem usam nomes próprios). */
export async function writeBookSource(b: PreparedBook, name: string): Promise<void> {
  await writeSource(b.buildDir, name, b.source)
}

const LAST = 'ultimo-miolo.json'

/** Páginas do último miolo gerado (PDF ou prévia), para a lombada da capa. */
export async function lastPageCount(dir: string): Promise<number | null> {
  try {
    const v = JSON.parse(await readFile(join(dir, '.build', LAST), 'utf8')) as { pages?: unknown }
    return typeof v.pages === 'number' && v.pages > 0 ? v.pages : null
  } catch {
    return null
  }
}

export async function rememberPageCount(dir: string, pages: number): Promise<void> {
  await mkdir(join(dir, '.build'), { recursive: true })
  await writeFile(join(dir, '.build', LAST), JSON.stringify({ pages, em: new Date().toISOString() }))
}

/** Exporta o miolo em PDF para gráfica (sangria + marcas de corte conforme o projeto). */
export async function exportPrintPdf(dir: string, resourcesDir: string): Promise<ExportResult & { warnings: string }> {
  const b = await prepareBook(dir, resourcesDir)
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const pdfPath = join(outDir, `${slugify(b.project.meta.title)}-miolo.pdf`)
  const { pages, warnings } = await compileTypst({
    typst: b.typst,
    buildDir: b.buildDir,
    source: b.source,
    outPdf: pdfPath,
    fontDirs: b.fontDirs
  })
  await rememberPageCount(dir, pages)
  return { pdfPath, pages, spineMm: spineWidthMm(pages, b.project.meta.layout.paper.caliperMm), warnings }
}
