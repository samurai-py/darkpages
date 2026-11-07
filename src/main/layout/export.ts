import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openProject, readChapter, slugify } from '../project'
import { spineWidthMm, type ChapterContent, type ExportResult, type PerfilPdf, type Project } from '../../shared/types'
import { stageAberturas, stageImagens } from './assets'
import { bookImageNames, buildBookTypst, type BookAssets } from './typst-source'
import { compileTypst, findTypst, writeSource } from './typst'
import { calibrarPaginas } from './calibracao'

export interface PreparedBook {
  project: Project
  chapters: ChapterContent[]
  source: string
  typst: string
  buildDir: string
  fontDirs: string[]
  /** artes e imagens já copiadas para .build/ (para gerar o .typ de outro perfil) */
  assets: BookAssets
  /** impressão digital do miolo (perfil gráfica): muda quando texto ou diagramação mudam */
  fingerprint: string
}

/** Lê o livro, copia as artes para .build/ e gera o código Typst do miolo. */
export async function prepareBook(dir: string, resourcesDir: string): Promise<PreparedBook> {
  const project = await openProject(dir)
  const chapters = await Promise.all(project.chapters.map((c) => readChapter(dir, c.file)))
  const buildDir = join(dir, '.build')
  const aberturas = await stageAberturas(dir, buildDir, project.chapters)
  const imagens = await stageImagens(dir, buildDir, bookImageNames(project.meta, chapters))
  const assets: BookAssets = { aberturas, imagens }
  const source = buildBookTypst(project.meta, chapters, assets)
  return {
    project,
    chapters,
    source,
    typst: await findTypst(resourcesDir),
    buildDir,
    fontDirs: [join(resourcesDir, 'fonts')],
    assets,
    fingerprint: createHash('sha1').update(source).digest('hex')
  }
}

/** Grava o .typ do miolo em .build/ com o nome dado (prévia e checagem usam nomes próprios). */
export async function writeBookSource(b: PreparedBook, name: string): Promise<void> {
  await writeSource(b.buildDir, name, b.source)
}

const LAST = 'ultimo-miolo.json'

/**
 * Páginas do último miolo gerado (PDF, prévia ou checagem), para a lombada da
 * capa. Com `fingerprint`, só vale se o miolo não mudou desde a contagem.
 */
export async function lastPageCount(dir: string, fingerprint?: string): Promise<number | null> {
  try {
    const v = JSON.parse(await readFile(join(dir, '.build', LAST), 'utf8')) as { pages?: unknown; miolo?: unknown }
    if (fingerprint !== undefined && v.miolo !== fingerprint) return null
    return typeof v.pages === 'number' && v.pages > 0 ? v.pages : null
  } catch {
    return null
  }
}

export async function rememberPageCount(dir: string, pages: number, fingerprint?: string): Promise<void> {
  await mkdir(join(dir, '.build'), { recursive: true })
  await writeFile(join(dir, '.build', LAST), JSON.stringify({ pages, miolo: fingerprint ?? null, em: new Date().toISOString() }))
}

const SUFIXO: Record<PerfilPdf, string> = { grafica: 'miolo', kdp: 'miolo-kdp', tela: 'tela' }
export const PERFIS: PerfilPdf[] = ['grafica', 'kdp', 'tela']

/**
 * Exporta o miolo em PDF conforme o perfil:
 * - gráfica: sangria nos 4 lados e marcas de corte conforme o projeto;
 * - kdp: sangria de 0,125 pol só em cima, embaixo e na borda externa, sem marcas (especificação do KDP);
 * - tela: formato final sem sangria nem marcas, sem páginas em branco forçadas, sumário com links.
 */
export async function exportPrintPdf(dir: string, resourcesDir: string, perfil: PerfilPdf = 'grafica'): Promise<ExportResult & { warnings: string; perfil: PerfilPdf }> {
  const b = await prepareBook(dir, resourcesDir)
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const pdfPath = join(outDir, `${slugify(b.project.meta.title)}-${SUFIXO[perfil]}.pdf`)
  const source = perfil === 'grafica' ? b.source : buildBookTypst(b.project.meta, b.chapters, b.assets, perfil)
  const { pages, warnings } = await compileTypst({
    typst: b.typst,
    buildDir: b.buildDir,
    source,
    outPdf: pdfPath,
    fontDirs: b.fontDirs,
    inputName: perfil === 'grafica' ? 'livro.typ' : `livro-${perfil}.typ`
  })
  // a paginação da gráfica e do KDP é a mesma (mesmo formato e margens); a da tela não serve para a lombada
  if (perfil !== 'tela') {
    await rememberPageCount(dir, pages, b.fingerprint)
    // calibra a estimativa de páginas do Manuscrito (falha aqui não estraga a exportação)
    await calibrarPaginas(b, pages).catch(() => null)
  }
  return { pdfPath, pages, spineMm: spineWidthMm(pages, b.project.meta.layout.paper.caliperMm), warnings, perfil }
}
