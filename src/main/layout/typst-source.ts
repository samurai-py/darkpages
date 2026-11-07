import type { ChapterContent, ProjectMeta } from '../../shared/types'
import { parseBody, type Block, type Inline } from './markdown'
import { chapterLabelText, numberChapters, showsTitle } from './labels'
import { chapterDropCap, chapterOpening, resolveLayout, type FullLayout } from './settings'

/**
 * Gera o código-fonte Typst do miolo do livro a partir do manuscrito.
 *
 * O texto do autor nunca entra como marcação Typst: cada trecho vira uma
 * string literal (`#"..."`), então caracteres como # * _ [ ] @ $ não
 * quebram a compilação nem viram comandos.
 *
 * Marcadores `<folio-marca>` (metadata) indicam onde começa e termina cada
 * capítulo e quais páginas são preliminares ou de arte. O cabeçalho e o rodapé
 * consultam esses marcadores para se esconder em aberturas, páginas em branco
 * e páginas iniciais. O marcador final `<folio-mapa>` lista a página de cada
 * capítulo e o total, lido pela prévia com `typst query`.
 */

/** Distância entre a sangria e a borda da folha, onde ficam as marcas de corte. */
export const SLUG_MM = 8
/** As marcas de corte param antes da sangria, para não aparecerem no livro. */
const MARK_GAP_MM = 1

export interface BookAssets {
  /** arquivo do capítulo → caminho da arte de abertura relativo à pasta .build (raiz do Typst) */
  aberturas: Map<string, string>
}

export function str(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ') +
    '"'
  )
}

export function mm(n: number): string {
  return `${Math.round(n * 100) / 100}mm`
}

/** Sequência inline → marcação Typst (dentro de um bloco de conteúdo `[...]`). */
export function inlineTypst(c: Inline[]): string {
  return c
    .map((n) => {
      switch (n.t) {
        case 'text':
          return `#${str(n.v)}`
        case 'em':
          return `#emph[${inlineTypst(n.c)}]`
        case 'strong':
          return `#strong[${inlineTypst(n.c)}]`
        case 'note':
          return `#footnote[${inlineTypst(n.c)}]`
        case 'br':
          return '#linebreak()'
      }
    })
    .join('')
}

/** Compatibilidade: ênfases de Markdown em uma linha → Typst. */
export function inlineToTypst(text: string): string {
  return inlineTypst(parseBody(text).blocks.flatMap((b) => (b.t === 'scene' ? [] : b.c)))
}

type Wrap = 'em' | 'strong'

/** Divide o parágrafo em palavras (cada uma com seus estilos e notas), para a capitular descida. */
function words(c: Inline[]): string[] {
  const out: string[] = []
  let cur = ''
  const emit = (): void => {
    if (cur) out.push(`[${cur}]`)
    cur = ''
  }
  const wrap = (s: string, stack: Wrap[]): string =>
    stack.reduceRight((acc, w) => (w === 'em' ? `#emph[${acc}]` : `#strong[${acc}]`), s)
  const walk = (nodes: Inline[], stack: Wrap[]): void => {
    for (const n of nodes) {
      if (n.t === 'text') {
        const parts = n.v.split(/\s+/)
        parts.forEach((p, i) => {
          if (i > 0) emit()
          if (p) cur += wrap(`#${str(p)}`, stack)
        })
      } else if (n.t === 'br') {
        emit()
      } else if (n.t === 'note') {
        cur += `#footnote[${inlineTypst(n.c)}]`
      } else {
        walk(n.c, [...stack, n.t])
      }
    }
  }
  walk(c, [])
  emit()
  return out
}

const OPEN_PUNCT = /^[“"«‘'(\[¿¡]+/

/** Separa a primeira letra do parágrafo (com aspas de abertura). Diálogo com travessão não ganha capitular. */
function splitInitial(c: Inline[]): { initial: string; rest: Inline[] } | null {
  const first = c[0]
  if (!first || first.t !== 'text') return null
  const v = first.v.replace(/^\s+/, '')
  const punct = v.match(OPEN_PUNCT)?.[0] ?? ''
  const after = v.slice(punct.length)
  const letter = after.match(/^\p{L}|^\p{N}/u)?.[0]
  if (!letter) return null
  const restText = after.slice(letter.length)
  const rest: Inline[] = restText ? [{ t: 'text', v: restText }, ...c.slice(1)] : c.slice(1)
  return { initial: punct + letter, rest }
}

function paragraphTypst(b: Block): string {
  switch (b.t) {
    case 'scene':
      return '#quebra-cena()'
    case 'quote':
      return `#citacao[${inlineTypst(b.c)}]`
    case 'sub':
      return `#heading(level: 2, outlined: false)[${inlineTypst(b.c)}]`
    case 'p':
      return inlineTypst(b.c)
  }
}

function firstParagraph(b: Block & { t: 'p' }, style: string, l: FullLayout): string {
  const plain = `#sem-recuo[${inlineTypst(b.c)}]`
  if (style === 'nenhuma') return plain
  const split = splitInitial(b.c)
  if (!split) return plain
  const cor = `rgb(${str(l.dropCapColor)})`
  if (style === 'elevada') {
    return `#sem-recuo[#capitular-elevada(${str(split.initial)}, ${cor})${inlineTypst(split.rest)}]`
  }
  // "Era uma" → letra "E" e palavras ("ra", "uma"); "A torre" → letra "A" e palavras ("torre")
  const ws = words(split.rest)
  return `#capitular(${l.dropCapLines}, ${str(split.initial)}, (${ws.join(', ')}${ws.length === 1 ? ',' : ''}), ${cor})`
}

interface ChapterCtx {
  l: FullLayout
  assets: BookAssets
}

function chapterTypst(c: ChapterContent, n: number, ctx: ChapterCtx): string {
  const { l } = ctx
  const label = chapterLabelText(c.kind, n, l.rotulo)
  const title = showsTitle(c, label) ? c.title.trim() : (label ?? c.title.trim())
  const rotulo = label && showsTitle(c, label) ? str(label) : 'none'
  let style = chapterOpening(l, c.file)
  const art = ctx.assets.aberturas.get(c.file)
  if (style === 'arte' && !art) style = 'ornamentada'
  const args = `${rotulo}, ${str(title)}, ${str(c.file)}`
  const opening =
    style === 'arte'
      ? `#abertura-arte(${args}, ${str(art ?? '')}, ${str(l.openingArtPage)})`
      : style === 'ornamentada'
        ? `#abertura-ornamentada(${args})`
        : style === 'simples'
          ? `#abertura-simples(${args})`
          : `#abertura-classica(${args})`

  const { blocks } = parseBody(c.body)
  const drop = chapterDropCap(l, c.file)
  let firstDone = false
  let prev: Block['t'] | 'abertura' = 'abertura'
  const body = blocks.map((b) => {
    const before = prev
    prev = b.t
    if (!firstDone && b.t === 'p') {
      firstDone = true
      return firstParagraph(b, drop, l)
    }
    if (b.t !== 'scene') firstDone = true
    // depois de abertura, quebra de cena ou intertítulo o parágrafo começa sem recuo
    if (b.t === 'p' && (before === 'scene' || before === 'sub' || before === 'abertura')) {
      return `#sem-recuo[${inlineTypst(b.c)}]`
    }
    return paragraphTypst(b)
  })
  return `${opening}\n\n${body.join('\n\n')}\n\n#marca("fim")`
}

function cropMarks(l: FullLayout, S: number): string {
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
    ln(0, y0, reach, y0),
    ln(pw - reach, y0, pw, y0),
    ln(0, y1, reach, y1),
    ln(pw - reach, y1, pw, y1),
    ln(x0, 0, x0, reach),
    ln(x1, 0, x1, reach),
    ln(x0, ph - reach, x0, ph),
    ln(x1, ph - reach, x1, ph)
  ].join('\n')
}

function lines(text: string): string {
  const ls = text
    .replace(/\r/g, '')
    .split('\n')
    .map((s) => s.trimEnd())
  while (ls.length && !ls.at(-1)) ls.pop()
  return `(${ls.map(str).join(', ')}${ls.length === 1 ? ',' : ''}).join(linebreak())`
}

function frontMatter(meta: ProjectMeta, l: FullLayout): string {
  const f = l.front
  const out: string[] = []
  const title = str(meta.title)
  const author = str(meta.author || '')
  if (f.falsoRosto) {
    out.push(`// Falso rosto
#pagebreak(to: "odd", weak: true)
#marca("pre")
#v(28%)
#align(center, text(size: 1.35em, tracking: 0.06em, ${title}))`)
  }
  if (f.rosto) {
    const sub = f.subtitulo.trim() ? `#v(0.8em)\n#align(center, text(size: 1.1em, style: "italic", ${str(f.subtitulo.trim())}))` : ''
    const edit = [f.editora.trim(), [f.cidade.trim(), f.ano.trim()].filter(Boolean).join(' · ')].filter(Boolean)
    out.push(`// Rosto
#pagebreak(to: "odd", weak: true)
#marca("pre")
#v(18%)
#align(center, text(size: 0.95em, tracking: 0.24em, upper(${author})))
#v(1.6em)
#align(center, text(size: 2.5em, ${title}))
${sub}
#v(1fr)
${edit.length ? `#align(center, ornamento())\n#v(0.6em)\n#align(center, text(size: 0.85em, tracking: 0.12em, ${lines(edit.join('\n'))}))` : ''}`)
  }
  if (f.creditos) {
    const year = f.ano.trim() || String(new Date().getFullYear())
    const copy = `© ${year} ${meta.author || ''}`.trim()
    const extra = f.creditosTexto.trim()
    const ficha = f.ficha.trim()
    const isbn = f.isbn.trim()
    const pub = [f.editora.trim(), f.cidade.trim()].filter(Boolean).join(' · ')
    out.push(`// Créditos e ficha catalográfica
#pagebreak(to: "even", weak: true)
#marca("pre")
#set par(first-line-indent: 0pt, justify: false)
#set text(size: 0.78em)
#v(1fr)
#${str(copy)} \\
#${str('Todos os direitos reservados. Nenhuma parte desta obra pode ser reproduzida sem autorização por escrito.')}
${f.edicao.trim() ? `\n\n#${str(f.edicao.trim())}` : ''}
${extra ? `\n\n#${lines(extra)}` : ''}
${
  ficha
    ? `\n\n#block(width: 100%, stroke: 0.4pt, inset: 0.9em, radius: 0pt)[#align(center, text(tracking: 0.08em, ${str('Dados Internacionais de Catalogação na Publicação (CIP)')}))\n#v(0.4em)\n#set text(size: 0.95em)\n#${lines(ficha)}]`
    : ''
}
${isbn ? `\n\n#${str(`ISBN ${isbn}`)}` : ''}
${pub ? `\n\n#${str(pub)}` : ''}`)
  }
  if (f.dedicatoria && f.dedicatoriaTexto.trim()) {
    out.push(`// Dedicatória
#pagebreak(to: "odd", weak: true)
#marca("pre")
#v(30%)
#align(right, block(width: 60%, align(right, text(style: "italic", ${lines(f.dedicatoriaTexto.trim())}))))`)
  }
  if (f.epigrafe && f.epigrafeTexto.trim()) {
    const who = f.epigrafeAutor.trim() ? `\n#v(0.6em)\n#align(right, text(size: 0.9em, ${str('— ' + f.epigrafeAutor.trim())}))` : ''
    out.push(`// Epígrafe
#pagebreak(to: "odd", weak: true)
#marca("pre")
#v(30%)
#align(right, block(width: 66%, {
  set par(justify: false, first-line-indent: 0pt)
  align(left, text(style: "italic", ${lines(f.epigrafeTexto.trim())}))${who.replace(/\n#/g, '\n  ')}
}))`)
  }
  if (f.sumario) {
    out.push(`// Sumário
#pagebreak(to: "odd", weak: true)
#marca("pre")
#v(12%)
#align(center, text(size: 1.5em, ${str('Sumário')}))
#v(2.2em)
#outline(title: none, target: heading.where(level: 1))`)
  }
  return out.map((s) => `#{\n${indentBlock(s)}\n}`).join('\n\n')
}

/** Isola cada página inicial num bloco de código para os `#set` não vazarem. */
function indentBlock(markup: string): string {
  return `[\n${markup}\n]`
}

function colophon(meta: ProjectMeta, l: FullLayout): string {
  if (!l.front.colofao) return ''
  const text =
    l.front.colofaoTexto.trim() ||
    `Este livro foi composto em ${l.font}, corpo ${String(l.bodyPt).replace('.', ',')}, e diagramado no Folio.`
  return `// Colofão
#pagebreak(to: "even", weak: true)
#{[
#marca("pre")
#v(1fr)
#align(center, ornamento())
#v(0.8em)
#align(center, block(width: 70%, {
  set par(justify: false, first-line-indent: 0pt)
  align(center, text(size: 0.85em, style: "italic", ${lines(text)}))
}))
#v(12%)
]}`
}

const ORNAMENTS: Record<string, string> = {
  asterismo: 'text(size: 1.1em, "⁂")',
  asteriscos: 'text(tracking: 0.9em, "***")',
  losango: 'ornamento()',
  vinheta: 'vinheta(largura: 5.5em)',
  linha: 'line(length: 3em, stroke: 0.4pt)',
  espaco: 'none'
}

export function buildBookTypst(meta: ProjectMeta, chapters: ChapterContent[], assets: BookAssets = { aberturas: new Map() }): string {
  const l = resolveLayout(meta.layout)
  const S = l.bleedMm + (l.cropMarks ? SLUG_MM : 0)
  const B = l.bleedMm
  const leadingEm = Math.max(0.3, l.lineHeight - 0.7)
  const textWidthMm = l.trim.widthMm - l.margins.insideMm - l.margins.outsideMm
  const nums = numberChapters(chapters)
  const ctx: ChapterCtx = { l, assets }
  const body = chapters.map((c, i) => chapterTypst(c, nums[i] ?? 0, ctx)).join('\n\n')
  const orn = ORNAMENTS[l.sceneOrnament] ?? ORNAMENTS['asterismo']
  const headerAscent = Math.max(4, l.margins.topMm * 0.45)
  const footerDescent = Math.max(4, l.margins.bottomMm * 0.4)

  return `// Gerado pelo Folio. Não edite: é refeito a cada exportação.
#set document(title: ${str(meta.title)}, author: ${str(meta.author || 'Autor')})

#let livro-titulo = ${str(meta.title)}
#let corrente-ligado = ${l.runningHead}
#let rotulo-caixa = ${str(l.rotulo.caixa)}
#let caixa-rotulo(r) = if rotulo-caixa == "versalete" { smallcaps(r) } else { r }
#let folio-pos = ${str(l.folio)}
#let largura-texto = ${mm(textWidthMm)}

// ---------- marcadores ----------
#let marca(tipo, ..dados) = [#metadata((tipo: tipo, ..dados.named()))<folio-marca>]

/// Informação da página atual para cabeçalho/rodapé, ou none quando a página
/// não leva cabeçalho nem número (aberturas, páginas iniciais, arte, em branco).
#let info-pagina() = {
  let p = here().page()
  let marcas = query(<folio-marca>)
  let aqui = marcas.filter(m => m.location().page() == p)
  let antes = marcas.filter(m => m.location().page() < p)
  if aqui.any(m => m.value.tipo in ("inicio", "pre", "arte")) or antes.len() == 0 { none } else {
    let ult = antes.last()
    // depois de um "fim" (ou de página inicial/arte) sem novo "inicio": página em branco
    if ult.value.tipo == "inicio" { ult.value } else { none }
  }
}

// ---------- página ----------
#set page(
  width: ${mm(l.trim.widthMm + 2 * S)},
  height: ${mm(l.trim.heightMm + 2 * S)},
  margin: (
    top: ${mm(l.margins.topMm + S)},
    bottom: ${mm(l.margins.bottomMm + S)},
    inside: ${mm(l.margins.insideMm + S)},
    outside: ${mm(l.margins.outsideMm + S)},
  ),
  header-ascent: ${mm(headerAscent)},
  footer-descent: ${mm(footerDescent)},
  header: context {
    let info = info-pagina()
    if info != none {
      let p = here().page()
      let par-pag = calc.even(p)
      let corrente = if corrente-ligado {
        text(size: 0.74em, tracking: 0.18em, upper(if par-pag { livro-titulo } else { info.at("titulo", default: "") }))
      } else { none }
      let num = text(size: 0.85em, counter(page).display())
      if folio-pos == "cabecalho-externo" {
        if par-pag { grid(columns: (1fr, auto, 1fr), align(left, num), corrente, []) }
        else { grid(columns: (1fr, auto, 1fr), [], corrente, align(right, num)) }
      } else if corrente != none { align(center, corrente) }
    }
  },
  footer: context {
    let info = info-pagina()
    if info != none and folio-pos != "cabecalho-externo" {
      let num = text(size: 0.85em, counter(page).display())
      if folio-pos == "rodape-externo" {
        align(if calc.even(here().page()) { left } else { right }, num)
      } else { align(center, num) }
    }
  },
  foreground: {
${l.cropMarks ? cropMarks(l, S) : '  none'}
  },
)

// ---------- texto ----------
#set text(font: (${str(l.font)}, "Libertinus Serif"), size: ${l.bodyPt}pt, lang: "pt", region: "br", hyphenate: true, costs: (widow: ${l.avoidWidows ? '100%' : '0%'}, orphan: ${l.avoidWidows ? '100%' : '0%'}))
#set par(justify: true, leading: ${leadingEm.toFixed(2)}em, spacing: ${leadingEm.toFixed(2)}em, first-line-indent: (amount: 1.4em, all: true))
#let sem-recuo(corpo) = par(first-line-indent: 0pt, corpo)
#set footnote.entry(separator: line(length: 22%, stroke: 0.4pt), indent: 0em, gap: 0.35em, clearance: 1.1em)
#show footnote.entry: set text(size: 0.8em)
#show footnote.entry: set par(first-line-indent: 0pt, leading: 0.45em)
#show heading.where(level: 1): it => align(center, block(above: 0.6em, below: 0.9em, text(size: 1.9em, weight: "regular", it.body)))
#show heading.where(level: 2): it => align(center, block(above: 1.4em, below: 1em, sticky: true, text(size: 1.05em, style: "italic", weight: "regular", it.body)))
#show outline.entry: set block(above: 0.85em)
#set outline.entry(fill: box(width: 1fr, repeat(gap: 0.35em)[.]))
#show outline.entry.where(level: 1): it => {
  let s = it.element.supplement
  if type(s) != content { it } else {
    link(it.element.location(), it.indented(none, [#text(size: 0.82em, tracking: 0.12em, caixa-rotulo(s)) #h(0.6em) #it.inner()]))
  }
}

// ---------- ornamentos ----------
#let ornamento() = box(width: 3.2em, height: 0.8em, {
  place(horizon + left, line(length: 1.1em, stroke: 0.4pt))
  place(horizon + right, line(length: 1.1em, stroke: 0.4pt))
  place(center + horizon, rotate(45deg, square(size: 0.32em, fill: black)))
})

/// Vinheta simétrica desenhada (sem depender de fonte de ornamentos).
#let vinheta(largura: 9em) = box(width: largura, height: largura * 0.22, {
  let w = largura
  let h = largura * 0.22
  let meio = w / 2
  let traco = 0.45pt
  place(top + left, curve(
    stroke: traco,
    curve.move((meio, h * 0.5)),
    curve.cubic((meio - w * 0.08, h * 0.05), (meio - w * 0.2, h * 0.05), (meio - w * 0.26, h * 0.45)),
    curve.cubic((meio - w * 0.3, h * 0.75), (meio - w * 0.4, h * 0.7), (meio - w * 0.36, h * 0.45)),
  ))
  place(top + left, curve(
    stroke: traco,
    curve.move((meio, h * 0.5)),
    curve.cubic((meio + w * 0.08, h * 0.05), (meio + w * 0.2, h * 0.05), (meio + w * 0.26, h * 0.45)),
    curve.cubic((meio + w * 0.3, h * 0.75), (meio + w * 0.4, h * 0.7), (meio + w * 0.36, h * 0.45)),
  ))
  place(top + left, line(start: (0pt, h * 0.5), end: (meio - w * 0.3, h * 0.5), stroke: traco))
  place(top + left, line(start: (meio + w * 0.3, h * 0.5), end: (w, h * 0.5), stroke: traco))
  place(top + left, dx: meio - h * 0.2, dy: h * 0.3, rotate(45deg, square(size: h * 0.4, fill: black)))
  place(top + left, dx: meio - w * 0.3 - h * 0.08, dy: h * 0.42, circle(radius: h * 0.08, fill: black))
  place(top + left, dx: meio + w * 0.3 - h * 0.08, dy: h * 0.42, circle(radius: h * 0.08, fill: black))
})

#let quebra-cena() = block(width: 100%, above: 1.15em, below: 1.15em, align(center, ${orn === 'none' ? 'v(0.2em)' : orn}))
#let citacao(corpo) = block(above: 1em, below: 1em, inset: (left: 1.6em, right: 1.6em), {
  set par(first-line-indent: 0pt)
  set text(size: 0.94em)
  corpo
})

// ---------- capitulares ----------
/// Capitular descida: a letra ocupa \`linhas\` linhas; as primeiras palavras
/// ocupam a coluna ao lado e o resto do parágrafo continua por baixo.
#let capitular(linhas, letra, palavras, cor) = context {
  let lead = par.leading.to-absolute()
  let alt = measure(text(top-edge: "cap-height", bottom-edge: "baseline")[H]).height
  let alvo = (linhas - 1) * (alt + lead) + alt
  let base = measure(text(top-edge: "cap-height", bottom-edge: "baseline", letra)).height
  let cap = text(size: text.size * (alvo / base), fill: cor, top-edge: "cap-height", bottom-edge: "baseline", letra)
  let larg-cap = measure(cap).width
  let gap = 0.18em.to-absolute()
  let larg = largura-texto - larg-cap - gap
  let junta(ps) = if ps.len() == 0 { [] } else { ps.join([ ]) }
  let limite = linhas * alt + (linhas - 1) * lead + lead * 0.5
  let cabe(k) = measure(block(width: larg, par(justify: true, first-line-indent: 0pt, junta(palavras.slice(0, k))))).height <= limite
  let lo = 0
  let hi = palavras.len()
  while lo < hi {
    let mid = calc.div-euclid(lo + hi + 1, 2)
    if cabe(mid) { lo = mid } else { hi = mid - 1 }
  }
  let resto = palavras.slice(lo)
  block(above: lead, below: lead, grid(
    columns: (larg-cap, larg),
    column-gutter: gap,
    cap,
    par(justify: true, first-line-indent: 0pt, junta(palavras.slice(0, lo)) + if resto.len() > 0 { linebreak(justify: true) }),
  ))
  if resto.len() > 0 { par(first-line-indent: 0pt, junta(resto)) }
}

#let capitular-elevada(letra, cor) = text(size: 2.6em, fill: cor, top-edge: "cap-height", letra)

// ---------- aberturas de capítulo ----------
#let rotulo-cap(r) = if r != none { align(center, text(size: 0.78em, tracking: 0.32em, caixa-rotulo(r))) }
#let titulo-cap(rotulo, titulo) = heading(level: 1, supplement: if rotulo == none { none } else { [#rotulo] }, titulo)

#let comeco(arquivo, titulo, rotulo) = {
  marca("inicio", arquivo: arquivo, titulo: if rotulo == none { titulo } else { rotulo + " · " + titulo })
  counter(footnote).update(0)
}

#let abertura-classica(rotulo, titulo, arquivo) = {
  pagebreak(to: "odd", weak: true)
  comeco(arquivo, titulo, rotulo)
  v(20%)
  rotulo-cap(rotulo)
  titulo-cap(rotulo, titulo)
  align(center, ornamento())
  v(2.2em)
}

#let abertura-ornamentada(rotulo, titulo, arquivo) = {
  pagebreak(to: "odd", weak: true)
  comeco(arquivo, titulo, rotulo)
  v(14%)
  align(center, vinheta(largura: largura-texto * 0.55))
  v(1.2em)
  if rotulo != none { align(center, text(size: 0.74em, tracking: 0.38em, if rotulo-caixa == "maiusculas" { smallcaps(all: true, rotulo) } else { caixa-rotulo(rotulo) })) }
  v(0.2em)
  {
    show heading.where(level: 1): it => align(center, block(above: 0.4em, below: 0.6em, text(size: 1.6em, tracking: 0.14em, weight: "regular", upper(it.body))))
    titulo-cap(rotulo, titulo)
  }
  align(center, line(length: 18%, stroke: 0.4pt))
  v(2.4em)
}

#let abertura-simples(rotulo, titulo, arquivo) = {
  pagebreak(weak: true)
  comeco(arquivo, titulo, rotulo)
  v(8%)
  rotulo-cap(rotulo)
  titulo-cap(rotulo, titulo)
  v(1.6em)
}

/// Arte de abertura sangrada numa página inteira. \`pagina\`: "impar" (a arte
/// abre o capítulo e o texto começa no verso) ou "par" (frontispício diante da abertura).
#let abertura-arte(rotulo, titulo, arquivo, imagem, pagina) = {
  pagebreak(to: if pagina == "par" { "even" } else { "odd" }, weak: true)
  page(margin: 0pt, header: none, footer: none, {
    marca("arte", arquivo: arquivo)
    place(top + left, dx: ${mm(S - B)}, dy: ${mm(S - B)},
      image(imagem, width: ${mm(l.trim.widthMm + 2 * B)}, height: ${mm(l.trim.heightMm + 2 * B)}, fit: "cover"))
  })
  if pagina == "par" { pagebreak(to: "odd", weak: true) }
  comeco(arquivo, titulo, rotulo)
  v(12%)
  rotulo-cap(rotulo)
  titulo-cap(rotulo, titulo)
  align(center, ornamento())
  v(2em)
}

${frontMatter(meta, l)}

${body}

${colophon(meta, l)}

// Mapa para a prévia: página de cada capítulo e total.
#context [#metadata((
  total: counter(page).final().first(),
  capitulos: query(<folio-marca>).filter(m => m.value.tipo == "inicio").map(m => (arquivo: m.value.arquivo, pagina: m.location().page())),
))<folio-mapa>]
`
}
