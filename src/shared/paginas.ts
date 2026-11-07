import type { LayoutSettings } from './types'

/**
 * Estimativa de páginas do livro (barra de status do Manuscrito) e a
 * calibração dela pela última diagramação real (Typst). Puro: usado pela
 * interface e pelo processo principal (layout/calibracao.ts).
 *
 * Modelo: cada item do sumário abre em página nova e perde ~1/3 de página no
 * rebaixo do título → páginas = max(1, ⌈palavras / ppp + 0,35⌉). A fórmula
 * dá o `ppp` (palavras por página) a partir do formato, corpo e entrelinha;
 * a calibração acha o `ppp` que faz o mesmo modelo bater com as páginas que o
 * Typst realmente gerou.
 */

const PT_MM = 25.4 / 72
const PERDA_TITULO = 0.35

/** Palavras por página no formato/corpo/entrelinha da diagramação (estimativa pela fórmula). */
export function palavrasPorPagina(l: LayoutSettings): number {
  const largura = l.trim.widthMm - l.margins.insideMm - l.margins.outsideMm
  const altura = l.trim.heightMm - l.margins.topMm - l.margins.bottomMm
  const linhaMm = l.bodyPt * l.lineHeight * PT_MM
  const linhas = Math.max(1, Math.floor(altura / linhaMm))
  // largura média de caractere numa serifada de livro ≈ 0,46 em
  const charsPorLinha = largura / (l.bodyPt * PT_MM * 0.46)
  // palavra média em PT ≈ 4,9 letras + espaço; ~8% de perda em fins de parágrafo
  return Math.max(50, linhas * (charsPorLinha / 5.9) * 0.92)
}

/** Páginas de um capítulo. `ppp` calibrado, se houver; senão a fórmula do layout. */
export function paginasCapitulo(palavras: number, l: LayoutSettings, ppp?: number | null): number {
  const p = ppp && ppp > 0 ? ppp : palavrasPorPagina(l)
  return Math.max(1, Math.ceil(palavras / p + PERDA_TITULO))
}

/** Soma do modelo para uma lista de capítulos com um `ppp` dado. */
export function paginasModelo(palavrasCaps: number[], ppp: number): number {
  return palavrasCaps.reduce((s, w) => s + Math.max(1, Math.ceil(w / ppp + PERDA_TITULO)), 0)
}

const PPP_MIN = 20
const PPP_MAX = 5000

/**
 * O `ppp` que faz o modelo dar `paginasTexto` páginas para estes capítulos
 * (as páginas reais menos as preliminares). Busca binária: o modelo só cai
 * quando o `ppp` sobe. Devolve o menor `ppp` que não passa do real, com uma
 * casa decimal, ou null quando nenhum `ppp` razoável explica o resultado
 * (ex.: menos páginas do que capítulos, ou livro sem texto).
 */
export function calibrarPalavrasPorPagina(palavrasCaps: number[], paginasTexto: number): number | null {
  const total = palavrasCaps.reduce((s, w) => s + w, 0)
  if (!palavrasCaps.length || total <= 0 || !(paginasTexto > 0)) return null
  if (paginasModelo(palavrasCaps, PPP_MAX) > paginasTexto) return null
  if (paginasModelo(palavrasCaps, PPP_MIN) < paginasTexto) return null
  let lo = PPP_MIN
  let hi = PPP_MAX
  for (let i = 0; i < 60 && hi - lo > 0.05; i++) {
    const meio = (lo + hi) / 2
    if (paginasModelo(palavrasCaps, meio) > paginasTexto) lo = meio
    else hi = meio
  }
  return Math.round(hi * 10) / 10
}

/**
 * Impressão digital do que muda a paginação (formato, margens, corpo,
 * entrelinha, fontes e o resto do layout). Hash FNV-1a de 32 bits do JSON com
 * chaves ordenadas — estável entre processo principal e interface.
 */
export function impressaoLayout(l: LayoutSettings): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, ordenar((v as Record<string, unknown>)[k])])
      )
    }
    return v
  }
  const s = JSON.stringify(ordenar(l))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Calibração guardada por livro + layout (`.build/calibracao.json`). */
export interface CalibracaoPaginas {
  /** palavras por página efetivas da última diagramação neste layout */
  palavrasPorPagina: number
  /** páginas reais do miolo nessa diagramação */
  paginas: number
  /** páginas antes do primeiro capítulo (folha de rosto, sumário…) */
  preliminares: number
  /** palavras do livro naquele momento */
  palavras: number
  /** ISO 8601 */
  em: string
}

/** 'diagramacao.calibracao'(dir) → o que a barra de status usa. */
export interface EstimativaCalibrada {
  /** calibração do layout atual (null: nunca diagramado neste layout) */
  calibracao: CalibracaoPaginas | null
  /** páginas da última diagramação de qualquer layout (ultimo-miolo.json) */
  paginasReais: number | null
  paginasReaisEm: string | null
}
