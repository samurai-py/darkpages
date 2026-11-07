import type { ChapterContent, LayoutSettings, ProjectMeta } from '../../shared/types'

/**
 * Gera o código-fonte Typst do miolo do livro a partir do manuscrito.
 *
 * O texto do autor nunca entra como marcação Typst: cada trecho vira uma
 * string literal (`#"..."`), então caracteres como # * _ [ ] @ $ não
 * quebram a compilação nem viram comandos.
 */

/** Distância entre a sangria e a borda da folha, onde ficam as marcas de corte. */
const SLUG_MM = 8
/** As marcas de corte param antes da sangria, para não aparecerem no livro. */
const MARK_GAP_MM = 1

function str(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** Converte ênfases de Markdown (`**negrito**`, `*itálico*`, `_itálico_`) em chamadas Typst. */
export function inlineToTypst(text: string): string {
  const out: string[] = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push(`#${str(text.slice(last, i))}`)
    if (m[2] !== undefined) out.push(`#strong(${str(m[2])})`)
    else out.push(`#emph(${str(m[3] ?? m[4] ?? '')})`)
    last = i + m[0].length
  }
  if (last < text.length) out.push(`#${str(text.slice(last))}`)
  return out.join('')
}

const SCENE_BREAK = /^\s*(\*\s*\*\s*\*|⁂|#\s*#\s*#|-{3,})\s*$/

/** Corpo de um capítulo em Markdown simples → blocos Typst. */
export function bodyToTypst(body: string): string {
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks
    .map((b) => {
      if (SCENE_BREAK.test(b)) return '#scene-break()'
      const oneLine = b.replace(/\s*\n\s*/g, ' ')
      return inlineToTypst(oneLine)
    })
    .join('\n\n')
}

function mm(n: number): string {
  return `${Math.round(n * 100) / 100}mm`
}

function cropMarks(l: LayoutSettings, S: number): string {
  const W = l.trim.widthMm
  const H = l.trim.heightMm
  const reach = S - l.bleedMm - MARK_GAP_MM
  const x0 = S
  const x1 = S + W
  const y0 = S
  const y1 = S + H
  const pw = W + 2 * S
  const ph = H + 2 * S
  const ln = (ax: number, ay: number, bx: number, by: number): string =>
    `  place(top + left, line(start: (${mm(ax)}, ${mm(ay)}), end: (${mm(bx)}, ${mm(by)}), stroke: 0.25pt + black))`
  return [
    // horizontais (alinhadas às linhas de corte de cima e de baixo)
    ln(0, y0, reach, y0),
    ln(pw - reach, y0, pw, y0),
    ln(0, y1, reach, y1),
    ln(pw - reach, y1, pw, y1),
    // verticais (alinhadas às linhas de corte da esquerda e da direita)
    ln(x0, 0, x0, reach),
    ln(x1, 0, x1, reach),
    ln(x0, ph - reach, x0, ph),
    ln(x1, ph - reach, x1, ph)
  ].join('\n')
}

function chapterHeading(c: ChapterContent, n: number): string {
  const label =
    c.kind === 'prologo' ? 'Prólogo' : c.kind === 'epilogo' ? 'Epílogo' : `Capítulo ${n}`
  const showTitle = c.kind === 'capitulo' || c.title.trim().toLowerCase() !== label.toLowerCase()
  return [
    '#pagebreak(to: "odd", weak: true)',
    '#v(22%)',
    `#align(center, text(size: 0.8em, tracking: 0.3em, upper(${str(label)})))`,
    showTitle ? `#heading(level: 1, ${str(c.title)})` : `#heading(level: 1, outlined: true, ${str(label)})`,
    '#align(center, ornament())',
    '#v(2.2em)'
  ].join('\n')
}

export function buildBookTypst(meta: ProjectMeta, chapters: ChapterContent[]): string {
  const l = meta.layout
  const S = l.bleedMm + (l.cropMarks ? SLUG_MM : 0)
  const leadingEm = Math.max(0.3, l.lineHeight - 0.7)
  let n = 0
  const body = chapters
    .map((c) => {
      if (c.kind === 'capitulo') n += 1
      return `${chapterHeading(c, n)}\n\n${bodyToTypst(c.body)}`
    })
    .join('\n\n')

  return `// Gerado pelo Folio. Não edite: é refeito a cada exportação.
#set document(title: ${str(meta.title)}, author: ${str(meta.author || 'Autor')})
#set page(
  width: ${mm(l.trim.widthMm + 2 * S)},
  height: ${mm(l.trim.heightMm + 2 * S)},
  margin: (
    top: ${mm(l.margins.topMm + S)},
    bottom: ${mm(l.margins.bottomMm + S)},
    inside: ${mm(l.margins.insideMm + S)},
    outside: ${mm(l.margins.outsideMm + S)},
  ),
  numbering: "1",
  number-align: center + bottom,
  foreground: {
${l.cropMarks ? cropMarks(l, S) : '  none'}
  },
)
#set text(font: (${str(l.font)}, "Libertinus Serif"), size: ${l.bodyPt}pt, lang: "pt", region: "br", hyphenate: true)
#set par(justify: true, leading: ${leadingEm.toFixed(2)}em, spacing: ${leadingEm.toFixed(2)}em, first-line-indent: 1.4em)
#show heading.where(level: 1): it => align(center, block(above: 0.6em, below: 0.9em, text(size: 1.9em, weight: "regular", it.body)))

#let ornament() = box(width: 3.2em, height: 0.8em, {
  place(horizon + left, line(length: 1.1em, stroke: 0.4pt))
  place(horizon + right, line(length: 1.1em, stroke: 0.4pt))
  place(center + horizon, rotate(45deg, square(size: 0.32em, fill: black)))
})
#let scene-break() = align(center, block(above: 1.2em, below: 1.2em, text(tracking: 0.6em, "⁂")))

// Falso rosto
#page(numbering: none)[#v(30%)#align(center, text(size: 1.4em, ${str(meta.title)}))]
// Rosto
#page(numbering: none)[
  #v(22%)
  #align(center, text(size: 1em, tracking: 0.2em, upper(${str(meta.author || '')})))
  #v(1.5em)
  #align(center, text(size: 2.4em, ${str(meta.title)}))
]

${body}
`
}
