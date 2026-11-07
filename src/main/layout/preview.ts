import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spineWidthMm } from '../../shared/types'
import { prepareBook, rememberPageCount, writeBookSource, type PreparedBook } from './export'
import { resolveLayout } from './settings'
import { SLUG_MM } from './typst-source'
import { queryTypst, renderPng } from './typst'

export interface BookMap {
  total: number
  capitulos: Array<{ arquivo: string; pagina: number }>
}

export interface PageGeometry {
  /** folha inteira do PDF (formato + sangria + área de marcas) */
  pageWmm: number
  pageHmm: number
  trimWmm: number
  trimHmm: number
  bleedMm: number
  /** distância da borda da folha até o corte */
  slugMm: number
  margins: { topMm: number; bottomMm: number; insideMm: number; outsideMm: number }
}

export interface PreviewResult {
  paginas: Array<{ numero: number; png: string }>
  total: number
  capitulos: Array<{ arquivo: string; titulo: string; pagina: number }>
  geometria: PageGeometry
  lombadaMm: number
  ppi: number
  avisos: string
}

const PREVIEW_NAME = 'previa.typ'
const MAX_PAGES = 8

/** Mapa do livro (total de páginas e página de cada capítulo) de um .typ já escrito. */
export async function bookMap(b: PreparedBook, inputName: string): Promise<BookMap> {
  return queryTypst<BookMap>({ typst: b.typst, buildDir: b.buildDir, inputName, fontDirs: b.fontDirs, label: 'folio-mapa' })
}

/**
 * Compila o miolo e devolve as páginas [inicio, inicio + quantidade) como PNG
 * em data URL (baixa resolução), mais o mapa de capítulos para navegação.
 */
export async function previewPages(dir: string, resourcesDir: string, inicio: number, quantidade: number, ppi = 96): Promise<PreviewResult> {
  const b = await prepareBook(dir, resourcesDir)
  await writeBookSource(b, PREVIEW_NAME)
  const first = Math.max(1, Math.floor(inicio))
  const count = Math.min(MAX_PAGES, Math.max(1, Math.floor(quantidade)))
  const res = Math.min(200, Math.max(36, Math.round(ppi)))
  const out = join(b.buildDir, `previa-${randomBytes(4).toString('hex')}`)
  await mkdir(out, { recursive: true })
  try {
    const [map, avisos] = await Promise.all([
      bookMap(b, PREVIEW_NAME),
      renderPng({
        typst: b.typst,
        buildDir: b.buildDir,
        inputName: PREVIEW_NAME,
        fontDirs: b.fontDirs,
        outDir: out,
        pages: `${first}-${first + count - 1}`,
        ppi: res
      })
    ])
    const files = (await readdir(out)).filter((f) => /^p-\d+\.png$/.test(f))
    const paginas = await Promise.all(
      files.map(async (f) => ({
        numero: Number(f.slice(2, -4)),
        png: `data:image/png;base64,${(await readFile(join(out, f))).toString('base64')}`
      }))
    )
    paginas.sort((a, c) => a.numero - c.numero)
    await rememberPageCount(dir, map.total)
    const l = resolveLayout(b.project.meta.layout)
    const S = l.bleedMm + (l.cropMarks ? SLUG_MM : 0)
    const titles = new Map(b.chapters.map((c) => [c.file, c.title]))
    return {
      paginas,
      total: map.total,
      capitulos: map.capitulos.map((c) => ({ ...c, titulo: titles.get(c.arquivo) ?? c.arquivo })),
      geometria: {
        pageWmm: l.trim.widthMm + 2 * S,
        pageHmm: l.trim.heightMm + 2 * S,
        trimWmm: l.trim.widthMm,
        trimHmm: l.trim.heightMm,
        bleedMm: l.bleedMm,
        slugMm: S,
        margins: l.margins
      },
      lombadaMm: spineWidthMm(map.total, l.paper.caliperMm),
      ppi: res,
      avisos
    }
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}
