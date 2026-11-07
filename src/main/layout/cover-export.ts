import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { openProject, slugify } from '../project'
import type { CoverSettings } from '../../shared/types'
import { stageCapa } from './assets'
import { buildCoverTypst, type CoverGeometry } from './cover'
import { lastPageCount, prepareBook, rememberPageCount, writeBookSource } from './export'
import { bookMap } from './preview'
import { resolveLayout } from './settings'
import { compileTypst, findTypst, renderPng } from './typst'

export interface CoverResult {
  pdfPath: string
  paginas: number
  geometria: CoverGeometry
  /** prévia da capa aberta em PNG (data URL) */
  previa: string
  /** true quando usou assets/capa-frente.png */
  imagemFrente: boolean
  avisos: string[]
}

/** Páginas do miolo: última contagem conhecida ou compila para descobrir. */
export async function mioloPages(dir: string, resourcesDir: string, fresh = false): Promise<number> {
  if (!fresh) {
    const last = await lastPageCount(dir)
    if (last) return last
  }
  const b = await prepareBook(dir, resourcesDir)
  await writeBookSource(b, 'contagem.typ')
  const { total } = await bookMap(b, 'contagem.typ')
  await rememberPageCount(dir, total)
  return total
}

/** Gera <livro>/export/<slug>-capa.pdf. `opts` sobrepõe (sem salvar) as configurações de capa do projeto. */
export async function exportCover(dir: string, resourcesDir: string, opts: Partial<CoverSettings> & { paginas?: number } = {}): Promise<CoverResult> {
  const project = await openProject(dir)
  const l = resolveLayout(project.meta.layout)
  const { paginas: forced, ...coverPatch } = opts
  const meta = { ...project.meta, layout: { ...l, cover: { ...l.cover, ...coverPatch } } }
  const pages = forced && forced > 0 ? Math.round(forced) : await mioloPages(dir, resourcesDir)
  const buildDir = join(dir, '.build')
  const frontImage = await stageCapa(dir, buildDir)
  const { source, geo, avisos } = buildCoverTypst({ meta, pages, frontImage })
  const typst = await findTypst(resourcesDir)
  const fontDirs = [join(resourcesDir, 'fonts')]
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const pdfPath = join(outDir, `${slugify(project.meta.title)}-capa.pdf`)
  const { warnings } = await compileTypst({ typst, buildDir, source, outPdf: pdfPath, fontDirs, inputName: 'capa.typ' })
  if (warnings) avisos.push(warnings)

  const tmp = join(buildDir, `capa-${randomBytes(4).toString('hex')}`)
  await mkdir(tmp, { recursive: true })
  try {
    await renderPng({ typst, buildDir, inputName: 'capa.typ', fontDirs, outDir: tmp, pages: '1', ppi: 72 })
    const previa = `data:image/png;base64,${(await readFile(join(tmp, 'p-1.png'))).toString('base64')}`
    return { pdfPath, paginas: pages, geometria: geo, previa, imagemFrente: Boolean(frontImage), avisos }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
