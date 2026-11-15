import type { ProjectMeta } from '../../shared/types'
import { spineWidthMm } from '../../shared/types'
import { resolveLayout, type FullLayout } from './settings'
import { SLUG_MM, mm, str } from './typst-source'

/**
 * Capa aberta para gráfica (D10): contracapa + lombada + frente numa folha só,
 * com sangria, marcas de corte nos cantos e marcas de dobra da lombada.
 */

export interface CoverGeometry {
  /** largura e altura da folha inteira (com área de marcas) */
  pageWmm: number
  pageHmm: number
  /** largura aberta sem sangria: 2 × formato + lombada */
  openWmm: number
  spineMm: number
  bleedMm: number
  /** distância da borda da folha até o corte */
  slugMm: number
}

export function coverGeometry(l: FullLayout, pages: number): CoverGeometry {
  const spine = spineWidthMm(pages, l.paper.caliperMm)
  const S = l.bleedMm + (l.cropMarks ? SLUG_MM : 0)
  const openW = 2 * l.trim.widthMm + spine
  return { pageWmm: openW + 2 * S, pageHmm: l.trim.heightMm + 2 * S, openWmm: openW, spineMm: spine, bleedMm: l.bleedMm, slugMm: S }
}

// ---------- código de barras EAN-13 do ISBN ----------

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

function ean13Check(d12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(d12[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

/** Normaliza ISBN-10/13 para os 13 dígitos do EAN, ou null se for inválido. */
export function isbnToEan(isbn: string): string | null {
  const raw = isbn.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (raw.length === 13 && /^\d{13}$/.test(raw)) {
    return ean13Check(raw.slice(0, 12)) === Number(raw[12]) ? raw : null
  }
  if (raw.length === 10 && /^\d{9}[\dX]$/.test(raw)) {
    let sum = 0
    for (let i = 0; i < 10; i += 1) sum += (raw[i] === 'X' ? 10 : Number(raw[i])) * (10 - i)
    if (sum % 11 !== 0) return null
    const d12 = `978${raw.slice(0, 9)}`
    return d12 + String(ean13Check(d12))
  }
  return null
}

/** Sequência de módulos (1 = barra) do EAN-13: 95 módulos. */
export function eanModules(ean: string): string {
  const first = Number(ean[0])
  const parity = PARITY[first] ?? 'LLLLLL'
  let bits = '101'
  for (let i = 1; i <= 6; i += 1) {
    const d = Number(ean[i])
    bits += (parity[i - 1] === 'G' ? G : L)[d] ?? ''
  }
  bits += '01010'
  for (let i = 7; i <= 12; i += 1) bits += R[Number(ean[i])] ?? ''
  return bits + '101'
}

/** Código de barras desenhado com retângulos, sobre fundo branco (zona de silêncio incluída). */
function barcodeTypst(ean: string, isbnLabel: string): string {
  const mod = 0.33
  const barH = 20
  const quiet = 11 * mod
  const bits = eanModules(ean)
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94])
  const rects: string[] = []
  let i = 0
  while (i < bits.length) {
    if (bits[i] !== '1') {
      i += 1
      continue
    }
    let j = i
    while (bits[j] === '1') j += 1
    const h = guard.has(i) ? barH + 2.2 : barH
    rects.push(`place(top + left, dx: ${mm(quiet + i * mod)}, dy: ${mm(4)}, rect(width: ${mm((j - i) * mod)}, height: ${mm(h)}, fill: black))`)
    i = j
  }
  const w = 95 * mod + 2 * quiet
  const num = (txt: string, x: number, w: number): string =>
    `place(top + left, dx: ${mm(x)}, dy: ${mm(4 + barH + 0.4)}, box(width: ${mm(w)}, align(center, text(size: 8pt, fill: black, font: "DejaVu Sans Mono", tracking: 1.2pt, ${str(txt)}))))`
  return `box(width: ${mm(w)}, height: ${mm(barH + 8.5)}, fill: white, {
  place(top + center, dy: ${mm(0.6)}, text(size: 6.5pt, fill: black, font: "Libertinus Serif", ${str(isbnLabel)}))
  ${rects.join('\n  ')}
  ${num(ean.slice(0, 1), 0, quiet)}
  ${num(ean.slice(1, 7), quiet + 3 * mod, 42 * mod)}
  ${num(ean.slice(7), quiet + 50 * mod, 42 * mod)}
})`
}

// ---------- fonte Typst da capa ----------

export interface CoverInput {
  meta: ProjectMeta
  pages: number
  /** caminho da imagem da frente relativo a --root, ou null para capa tipográfica */
  frontImage: string | null
}

export function buildCoverTypst(input: CoverInput): { source: string; geo: CoverGeometry; avisos: string[] } {
  const l = resolveLayout(input.meta.layout)
  const c = l.cover
  const g = coverGeometry(l, input.pages)
  const W = l.trim.widthMm
  const H = l.trim.heightMm
  const S = g.slugMm
  const B = g.bleedMm
  const spine = g.spineMm
  const xSpine = S + W
  const xFront = S + W + spine
  const avisos: string[] = []
  const title = input.meta.title
  const author = input.meta.author || ''

  const marks: string[] = []
  const ln = (ax: number, ay: number, bx: number, by: number): void => {
    marks.push(`place(top + left, line(start: (${mm(ax)}, ${mm(ay)}), end: (${mm(bx)}, ${mm(by)}), stroke: 0.25pt + black))`)
  }
  if (l.cropMarks) {
    const reach = S - B - 1
    const pw = g.pageWmm
    const ph = g.pageHmm
    // cantos (corte)
    for (const y of [S, S + H]) {
      ln(0, y, reach, y)
      ln(pw - reach, y, pw, y)
    }
    for (const x of [S, pw - S]) {
      ln(x, 0, x, reach)
      ln(x, ph - reach, x, ph)
    }
    // dobras da lombada (tracejadas, só na área de marcas)
    for (const x of [xSpine, xFront]) {
      marks.push(`place(top + left, line(start: (${mm(x)}, 0mm), end: (${mm(x)}, ${mm(reach)}), stroke: (thickness: 0.25pt, paint: black, dash: "dashed")))`)
      marks.push(`place(top + left, line(start: (${mm(x)}, ${mm(ph - reach)}), end: (${mm(x)}, ${mm(ph)}), stroke: (thickness: 0.25pt, paint: black, dash: "dashed")))`)
    }
  } else {
    avisos.push('Marcas de corte desligadas: a capa sai sem marcas de corte e de dobra.')
  }

  const fundo = `rgb(${str(c.fundo)})`
  const tinta = `rgb(${str(c.texto)})`
  const destaque = `rgb(${str(c.destaque)})`
  const safe = 14 // margem de segurança do texto em relação ao corte (mm)

  // frente
  const front = input.frontImage
    ? `place(top + left, dx: ${mm(xFront)}, dy: ${mm(S - B)}, image(${str(input.frontImage)}, width: ${mm(W + B)}, height: ${mm(H + 2 * B)}, fit: "cover"))`
    : `place(top + left, dx: ${mm(xFront + safe)}, dy: ${mm(S + safe)}, box(width: ${mm(W - 2 * safe)}, height: ${mm(H - 2 * safe)}, {
    set align(center)
    v(16%)
    text(size: 9pt, tracking: 0.32em, fill: ${tinta}, upper(${str(author)}))
    v(10mm)
    line(length: 30%, stroke: 0.6pt + ${destaque})
    v(6mm)
    par(justify: false, leading: 0.3em, text(size: 30pt, fill: ${tinta}, ${str(title)}))
    v(6mm)
    line(length: 30%, stroke: 0.6pt + ${destaque})
    ${l.front.subtitulo.trim() ? `v(5mm)\n    text(size: 11pt, style: "italic", fill: ${tinta}, ${str(l.front.subtitulo.trim())})` : ''}
    v(1fr)
    ${l.front.editora.trim() ? `text(size: 8pt, tracking: 0.2em, fill: ${tinta}, upper(${str(l.front.editora.trim())}))` : ''}
  }))`

  // lombada
  let spineText = ''
  if (spine >= 6) {
    const size = Math.min(13, spine * 2.835 * 0.42)
    spineText = `place(top + left, dx: ${mm(xSpine)}, dy: ${mm(S)}, box(width: ${mm(spine)}, height: ${mm(H)}, align(center + horizon,
    rotate(90deg, reflow: true, box(width: ${mm(H - 40)}, {
      set text(fill: ${tinta}, size: ${size.toFixed(1)}pt)
      grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
        text(${str(title)}), text(size: 0.8em, tracking: 0.12em, upper(${str(author)})))
    })))))`
  } else if (spine >= 3) {
    const size = Math.min(8, spine * 2.835 * 0.5)
    spineText = `place(top + left, dx: ${mm(xSpine)}, dy: ${mm(S)}, box(width: ${mm(spine)}, height: ${mm(H)}, align(center + horizon,
    rotate(90deg, reflow: true, text(fill: ${tinta}, size: ${size.toFixed(1)}pt, ${str(title)})))))`
    avisos.push(`Lombada fina (${String(spine).replace('.', ',')} mm): só o título cabe nela.`)
  } else {
    avisos.push(`Lombada de ${String(spine).replace('.', ',')} mm é fina demais para texto; ficará lisa.`)
  }

  // contracapa
  const ean = l.front.isbn.trim() ? isbnToEan(l.front.isbn) : null
  if (l.front.isbn.trim() && !ean) avisos.push(`ISBN "${l.front.isbn}" inválido: código de barras não gerado.`)
  const barcode = c.codigoBarras && ean
    ? `place(top + left, dx: ${mm(S + W - safe - (95 * 0.33 + 22 * 0.33))}, dy: ${mm(S + H - safe - 29.5)}, ${barcodeTypst(ean, `ISBN ${l.front.isbn.trim()}`)})`
    : ''
  const sinopse = c.sinopse.trim()
  if (!sinopse) avisos.push('Sem texto de quarta capa (sinopse).')
  const paras = sinopse.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  const back = `place(top + left, dx: ${mm(S + safe)}, dy: ${mm(S + safe + 8)}, box(width: ${mm(W - 2 * safe)}, {
    set text(fill: ${tinta}, size: 10.5pt)
    set par(justify: true, leading: 0.62em, spacing: 0.9em, first-line-indent: 0pt)
    ${paras.map((p) => `par(${str(p)})`).join('\n    ')}
    v(8mm)
    align(center, line(length: 20%, stroke: 0.5pt + ${destaque}))
  }))`

  const source = `// Capa gerada pelo Darkpages. Não edite.
#set document(title: ${str(`${title} — capa`)}, author: ${str(author || 'Autor')})
#set page(width: ${mm(g.pageWmm)}, height: ${mm(g.pageHmm)}, margin: 0pt, fill: white)
#set text(font: (${str(l.font)}, "Libertinus Serif"), lang: "pt", region: "br")

// fundo até a sangria
#place(top + left, dx: ${mm(S - B)}, dy: ${mm(S - B)}, rect(width: ${mm(g.openWmm + 2 * B)}, height: ${mm(H + 2 * B)}, fill: ${fundo}))
// filetes de destaque no alto e no pé da lombada
#place(top + left, dx: ${mm(xSpine)}, dy: ${mm(S + 12)}, rect(width: ${mm(spine)}, height: 0.8mm, fill: ${destaque}))
#place(top + left, dx: ${mm(xSpine)}, dy: ${mm(S + H - 12.8)}, rect(width: ${mm(spine)}, height: 0.8mm, fill: ${destaque}))
#${front}
#${spineText || 'none'}
#${back}
#${barcode || 'none'}
${marks.map((m) => `#${m}`).join('\n')}
`
  return { source, geo: g, avisos }
}
