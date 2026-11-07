/**
 * Leitor ÚNICO do Markdown que o editor grava, compartilhado por todas as
 * saídas: miolo (Typst), EPUB, DOCX e TXT. Entende: parágrafos, itálico
 * (asterisco ou sublinhado), negrito, notas de rodapé inline `^[texto]`,
 * quebra de cena (`***`, `* * *`, `⁂`, `---`, `###`), quebra de página
 * (`\pagebreak` sozinho na linha), citação (`> `, com vários parágrafos),
 * intertítulo (`## `), figura (`![legenda](assets/arquivo.png)` sozinha na
 * linha), quebra de linha forçada (barra ou dois espaços no fim da linha) e
 * escapes com barra invertida.
 *
 * O que o editor não grava mas pode vir de textos antigos ou importados nunca
 * some em silêncio: tachado `~~x~~` vira o texto sem os tis, link vira o texto
 * do link, código vira texto, item de lista vira parágrafo com travessão
 * (mesma leitura do editor, que trata "- fala" como diálogo).
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'em'; c: Inline[] }
  | { t: 'strong'; c: Inline[] }
  | { t: 'note'; c: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'p'; c: Inline[] }
  /** citação: um ou mais parágrafos */
  | { t: 'quote'; c: Inline[][] }
  | { t: 'sub'; c: Inline[] }
  | { t: 'scene' }
  | { t: 'pagebreak' }
  /** figura: `src` é o nome do arquivo em <livro>/assets/ (já validado) ou null se o caminho for inválido */
  | { t: 'figure'; src: string | null; raw: string; caption: Inline[] }

export interface ParsedBody {
  blocks: Block[]
  /** problemas encontrados (ex.: nota sem fechar) */
  problems: string[]
}

const SCENE_BREAK = /^\s*(\*\s*\*\s*\*[\s*]*|⁂|#\s*#\s*#\s*|-{3,}|_{3,})\s*$/
const BR_MARK = '\u0000BR\u0000'

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }

/** Decodifica entidades HTML que o editor (tiptap-markdown) grava: &lt; &gt; &amp; &#39; &#x2014; … numa passada só. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? m
  })
}

/** Remove escapes `\x` de Markdown, preservando o caractere, e decodifica entidades HTML. */
function unescape(s: string): string {
  return decodeEntities(s.replace(/\\([\\`*_{}[\]()#+\-.!>^~|&<])/g, '$1'))
}

function pushText(out: Inline[], v: string): void {
  if (!v) return
  const parts = v.split(BR_MARK)
  parts.forEach((part, i) => {
    if (i > 0) out.push({ t: 'br' })
    if (!part) return
    const last = out.at(-1)
    if (last && last.t === 'text') last.v += part
    else out.push({ t: 'text', v: part })
  })
}

/** Procura o `]` que fecha a nota que começa em `start` (logo depois de `^[`), respeitando colchetes aninhados e escapes. */
function closeBracket(s: string, start: number): number {
  let depth = 1
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function findClosing(s: string, from: number, marker: string): number {
  for (let i = from; i < s.length; i += 1) {
    if (s[i] === '\\') {
      i += 1
      continue
    }
    if (s.startsWith(marker, i)) {
      // `*` simples não pode fechar no começo de um `**`
      if (marker === '*' && s[i + 1] === '*') {
        const end = findClosing(s, i + 2, '**')
        if (end < 0) return -1
        i = end + 1
        continue
      }
      return i
    }
  }
  return -1
}

export function parseInline(s: string, problems: string[], inNote = false): Inline[] {
  const out: Inline[] = []
  let buf = ''
  let i = 0
  const flush = (): void => {
    pushText(out, unescape(buf))
    buf = ''
  }
  while (i < s.length) {
    const ch = s[i] ?? ''
    if (ch === '\\' && i + 1 < s.length) {
      buf += s.slice(i, i + 2)
      i += 2
      continue
    }
    if (ch === '^' && s[i + 1] === '[') {
      const end = closeBracket(s, i + 2)
      if (end < 0) {
        problems.push(`Nota de rodapé sem "]" de fechamento: "${s.slice(i, i + 40)}…"`)
        buf += ch
        i += 1
        continue
      }
      const inner = s.slice(i + 2, end)
      if (inNote) problems.push(`Nota dentro de nota: "${inner.slice(0, 40)}"`)
      if (!inner.trim()) {
        problems.push('Nota de rodapé vazia: "^[]"')
        i = end + 1
        continue
      }
      flush()
      out.push({ t: 'note', c: parseInline(inner, problems, true) })
      i = end + 1
      continue
    }
    // tachado legado: o texto fica, os tis somem (o editor não grava mais tachado)
    if (ch === '~' && s[i + 1] === '~') {
      const end = findClosing(s, i + 2, '~~')
      if (end > i + 2) {
        flush()
        for (const n of parseInline(s.slice(i + 2, end), problems, inNote)) {
          if (n.t === 'text') pushText(out, n.v)
          else out.push(n)
        }
        i = end + 2
        continue
      }
    }
    // código inline legado: vira texto
    if (ch === '`') {
      const end = s.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        pushText(out, s.slice(i + 1, end))
        i = end + 1
        continue
      }
    }
    // link [texto](url) e imagem no meio do parágrafo ![legenda](arquivo): fica o texto
    if ((ch === '[' || (ch === '!' && s[i + 1] === '[')) && s[i - 1] !== '^') {
      const open = ch === '!' ? i + 1 : i
      const close = closeBracket(s, open + 1)
      const m = close > 0 ? s.slice(close + 1).match(/^\(\s*<?([^()\s>]*)>?(?:\s+"[^"]*")?\s*\)/) : null
      if (m) {
        flush()
        const inner = parseInline(s.slice(open + 1, close), problems, inNote)
        if (ch === '!') problems.push(`Imagem no meio do parágrafo ("${s.slice(open + 1, close).slice(0, 40)}"): ponha a imagem sozinha numa linha para ela entrar como figura`)
        for (const n of inner) {
          if (n.t === 'text') pushText(out, n.v)
          else out.push(n)
        }
        i = close + 1 + m[0].length
        continue
      }
    }
    if (ch === '*' && s[i + 1] === '*') {
      const end = findClosing(s, i + 2, '**')
      if (end > i + 2) {
        flush()
        out.push({ t: 'strong', c: parseInline(s.slice(i + 2, end), problems, inNote) })
        i = end + 2
        continue
      }
    } else if (ch === '*' && s[i + 1] !== ' ') {
      const end = findClosing(s, i + 1, '*')
      if (end > i + 1) {
        flush()
        out.push({ t: 'em', c: parseInline(s.slice(i + 1, end), problems, inNote) })
        i = end + 1
        continue
      }
    } else if (ch === '_' && !/[\p{L}\p{N}]/u.test(s[i - 1] ?? '') && s[i + 1] !== ' ') {
      // `_` só abre itálico no começo de palavra (não quebra nomes_com_sublinhado)
      let end = findClosing(s, i + 1, '_')
      while (end > 0 && /[\p{L}\p{N}]/u.test(s[end + 1] ?? '')) end = findClosing(s, end + 1, '_')
      if (end > i + 1) {
        flush()
        out.push({ t: 'em', c: parseInline(s.slice(i + 1, end), problems, inNote) })
        i = end + 1
        continue
      }
    }
    buf += ch
    i += 1
  }
  flush()
  return out
}

/** Junta as linhas de um bloco num parágrafo, respeitando quebras forçadas. */
function joinLines(lines: string[]): string {
  return lines
    .map((line, idx) => {
      const last = idx === lines.length - 1
      if (!last && /(\\| {2,})$/.test(line)) return line.replace(/(\\| {2,})$/, '') + BR_MARK
      return last ? line.trim() : line.trim() + ' '
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

const PAGE_BREAK = /^\s*\\(?:pagebreak|newpage)\s*$/
const FIGURE = /^\s*!\[((?:\\.|[^\]\\])*)\]\(\s*<?([^()\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*$/
const LIST_ITEM = /^\s*[-–*+]\s+(?=\S)/
const FENCE = /^\s*(```|~~~)/
/** Nome aceito em <livro>/assets/ (mesma regra de store/docs.ts). */
export const ASSET_FILE = /^[a-z0-9][a-z0-9-]{0,80}\.(png|jpe?g|webp|svg)$/

/** `assets/foto.png` (ou só `foto.png`) → `foto.png`; null se não for um arquivo de assets/ válido. */
export function assetName(src: string): string | null {
  const name = src.replace(/^\.?\/?assets\//, '')
  return ASSET_FILE.test(name) ? name : null
}

function parseQuote(lines: string[], problems: string[]): Block {
  // tira um nível de ">" e relê o conteúdo: parágrafos separados por linha ">" vazia
  const inner = lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n')
  const paras: Inline[][] = []
  for (const b of parseBody(inner, problems).blocks) {
    if (b.t === 'quote') paras.push(...b.c)
    else if (b.t === 'p' || b.t === 'sub') paras.push(b.c)
    else if (b.t === 'figure') paras.push(b.caption)
  }
  return { t: 'quote', c: paras }
}

export function parseBody(body: string, sharedProblems?: string[]): ParsedBody {
  const problems: string[] = sharedProblems ?? []
  const blocks: Block[] = []
  // cercas de código legadas (```) viram texto: a cerca some, o conteúdo fica
  const src = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !FENCE.test(l))
    .join('\n')
  const chunks = src.split(/\n[ \t]*\n/)
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    if (SCENE_BREAK.test(chunk)) {
      // duas quebras de cena seguidas viram uma só
      if (blocks.at(-1)?.t !== 'scene') blocks.push({ t: 'scene' })
      continue
    }
    const lines = chunk.split('\n').filter((l) => l.trim())
    const first = lines[0] ?? ''
    if (lines.every((l) => /^\s*>/.test(l))) {
      blocks.push(parseQuote(lines, problems))
      continue
    }
    // quebra de página e figura podem vir coladas a outras linhas: cada linha delas vira bloco próprio
    if (lines.some((l) => PAGE_BREAK.test(l) || FIGURE.test(l)) && lines.length > 1) {
      let acc: string[] = []
      const emit = (): void => {
        if (acc.length) blocks.push(...parseBody(acc.join('\n'), problems).blocks)
        acc = []
      }
      for (const l of lines) {
        if (PAGE_BREAK.test(l) || FIGURE.test(l)) {
          emit()
          blocks.push(...parseBody(l, problems).blocks)
        } else acc.push(l)
      }
      emit()
      continue
    }
    if (PAGE_BREAK.test(first)) {
      if (blocks.at(-1)?.t !== 'pagebreak') blocks.push({ t: 'pagebreak' })
      continue
    }
    const fig = first.match(FIGURE)
    if (fig) {
      const raw = fig[2] ?? ''
      const name = assetName(raw)
      if (!name) problems.push(`Imagem "${raw}" fora da pasta assets/ do livro: só a legenda entra`)
      blocks.push({ t: 'figure', src: name, raw, caption: parseInline((fig[1] ?? '').trim(), problems) })
      continue
    }
    const h = first.match(/^\s*#{1,6}\s+(.*)$/)
    if (h && lines.length === 1) {
      blocks.push({ t: 'sub', c: parseInline((h[1] ?? '').trim(), problems) })
      continue
    }
    if (LIST_ITEM.test(first)) {
      // lista legada: cada item vira um parágrafo de fala (o editor lê "- fala" como diálogo)
      const items: string[][] = []
      for (const l of lines) {
        if (LIST_ITEM.test(l)) items.push([l.replace(LIST_ITEM, '— ')])
        else items.at(-1)?.push(l)
      }
      for (const it of items) blocks.push({ t: 'p', c: parseInline(joinLines(it), problems) })
      continue
    }
    blocks.push({ t: 'p', c: parseInline(joinLines(lines), problems) })
  }
  // quebra de cena ou de página no começo ou no fim do capítulo não faz sentido na página
  while (blocks[0]?.t === 'scene' || blocks[0]?.t === 'pagebreak') blocks.shift()
  while (blocks.at(-1)?.t === 'scene' || blocks.at(-1)?.t === 'pagebreak') blocks.pop()
  return { blocks, problems }
}

/** Texto puro de um bloco (notas de fora), para contagens e textos de apoio. */
export function blockText(b: Block): string {
  switch (b.t) {
    case 'scene':
    case 'pagebreak':
      return ''
    case 'quote':
      return b.c.map(plainText).join('\n\n')
    case 'figure':
      return plainText(b.caption)
    default:
      return plainText(b.c)
  }
}

/** Texto puro de uma sequência inline (sem notas). */
export function plainText(c: Inline[]): string {
  return c
    .map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : n.t === 'note' ? '' : plainText(n.c)))
    .join('')
}
