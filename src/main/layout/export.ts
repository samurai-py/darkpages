import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { openProject, readChapter, slugify } from '../project'
import { spineWidthMm, type ExportResult } from '../../shared/types'
import { buildBookTypst } from './typst-source'
import { compileTypst, findTypst } from './typst'

/** Exporta o miolo em PDF para gráfica (sangria + marcas de corte conforme o projeto). */
export async function exportPrintPdf(dir: string, resourcesDir: string): Promise<ExportResult> {
  const project = await openProject(dir)
  const chapters = await Promise.all(project.chapters.map((c) => readChapter(dir, c.file)))
  const source = buildBookTypst(project.meta, chapters)
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const pdfPath = join(outDir, `${slugify(project.meta.title)}-miolo.pdf`)
  const { pages } = await compileTypst({
    typst: await findTypst(resourcesDir),
    buildDir: join(dir, '.build'),
    source,
    outPdf: pdfPath,
    fontDirs: [join(resourcesDir, 'fonts')]
  })
  return { pdfPath, pages, spineMm: spineWidthMm(pages, project.meta.layout.paper.caliperMm) }
}
