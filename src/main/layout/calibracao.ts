import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openProject } from '../project'
import { countWords } from '../../shared/types'
import { calibrarPalavrasPorPagina, impressaoLayout, type CalibracaoPaginas, type EstimativaCalibrada } from '../../shared/paginas'
import type { PreparedBook } from './export'
import { resolveLayout } from './settings'

/**
 * Calibração da estimativa de páginas: depois de cada diagramação real que
 * conta páginas (PDF da gráfica/KDP, prévia, contagem da capa, checagem),
 * guarda as palavras por página efetivas para aquele livro + layout em
 * `<livro>/.build/calibracao.json` ({ [impressãoDoLayout]: CalibracaoPaginas }).
 * A barra de status do Manuscrito usa esse número no lugar da fórmula.
 */

const ARQ = 'calibracao.json'
const MAX_LAYOUTS = 12

type Mapa = Record<string, CalibracaoPaginas>

async function ler(dir: string): Promise<Mapa> {
  try {
    const v = JSON.parse(await readFile(join(dir, '.build', ARQ), 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Mapa) : {}
  } catch {
    return {}
  }
}

function valida(c: unknown): c is CalibracaoPaginas {
  const o = c as Partial<CalibracaoPaginas> | null
  return !!o && typeof o.palavrasPorPagina === 'number' && o.palavrasPorPagina > 0 && typeof o.paginas === 'number' && typeof o.em === 'string'
}

/**
 * Registra a contagem real. `primeiraPaginaCapitulo` (do mapa do Typst) dá as
 * preliminares; sem ela (exportação do PDF), reaproveita as da última
 * calibração deste layout, ou 0.
 */
export async function calibrarPaginas(b: PreparedBook, paginas: number, primeiraPaginaCapitulo?: number): Promise<CalibracaoPaginas | null> {
  const l = resolveLayout(b.project.meta.layout)
  const chave = impressaoLayout(l)
  const mapa = await ler(b.project.dir)
  const anterior = valida(mapa[chave]) ? mapa[chave] : undefined
  const preliminares =
    primeiraPaginaCapitulo && primeiraPaginaCapitulo > 1 ? primeiraPaginaCapitulo - 1 : primeiraPaginaCapitulo === 1 ? 0 : (anterior?.preliminares ?? 0)
  const palavrasCaps = b.chapters.map((c) => countWords(c.body))
  const ppp = calibrarPalavrasPorPagina(palavrasCaps, paginas - preliminares)
  if (ppp === null) return null
  const c: CalibracaoPaginas = {
    palavrasPorPagina: ppp,
    paginas,
    preliminares,
    palavras: palavrasCaps.reduce((s, w) => s + w, 0),
    em: new Date().toISOString()
  }
  // guarda só os layouts mais recentes
  const novo: Mapa = Object.fromEntries(
    [[chave, c] as const, ...Object.entries(mapa).filter(([k, v]) => k !== chave && valida(v))]
      .sort((x, y) => y[1].em.localeCompare(x[1].em))
      .slice(0, MAX_LAYOUTS)
  )
  const pasta = join(b.project.dir, '.build')
  await mkdir(pasta, { recursive: true })
  const tmp = join(pasta, `${ARQ}.tmp`)
  await writeFile(tmp, JSON.stringify(novo, null, 1))
  await rename(tmp, join(pasta, ARQ))
  return c
}

/** Calibração do layout atual do livro + páginas da última diagramação (qualquer layout). */
export async function estimativaCalibrada(dir: string): Promise<EstimativaCalibrada> {
  const project = await openProject(dir)
  const chave = impressaoLayout(resolveLayout(project.meta.layout))
  const mapa = await ler(dir)
  const calibracao = valida(mapa[chave]) ? mapa[chave] : null
  let paginasReais: number | null = null
  let paginasReaisEm: string | null = null
  try {
    const v = JSON.parse(await readFile(join(dir, '.build', 'ultimo-miolo.json'), 'utf8')) as { pages?: unknown; em?: unknown }
    if (typeof v.pages === 'number' && v.pages > 0) {
      paginasReais = v.pages
      paginasReaisEm = typeof v.em === 'string' ? v.em : null
    }
  } catch {
    // nunca diagramado
  }
  return { calibracao, paginasReais, paginasReaisEm }
}
