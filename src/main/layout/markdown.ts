/**
 * Leitor do Markdown simples que o editor grava, compartilhado entre o miolo
 * (Typst) e o EPUB. Entende: parágrafos, itálico (asterisco ou sublinhado),
 * notas de rodapé inline `^[texto]`, quebra de cena (`***`, `* * *`, `⁂`,
 * `---`, `###`), citação (`> `), intertítulo (`## `), quebra de linha forçada
 * (barra ou dois espaços no fim da linha) e escapes com barra invertida.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'em'; c: Inline[] }
  | { t: 'strong'; c: Inline[] }
  | { t: 'note'; c: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'sub'; c: Inline[] }
  | { t: 'scene' }

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

export function parseBody(body: string): ParsedBody {
  const problems: string[] = []
  const blocks: Block[] = []
  const chunks = body.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)
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
      const text = joinLines(lines.map((l) => l.replace(/^\s*>\s?/, '')))
      blocks.push({ t: 'quote', c: parseInline(text, problems) })
      continue
    }
    const h = first.match(/^\s*#{1,6}\s+(.*)$/)
    if (h && lines.length === 1) {
      blocks.push({ t: 'sub', c: parseInline((h[1] ?? '').trim(), problems) })
      continue
    }
    blocks.push({ t: 'p', c: parseInline(joinLines(lines), problems) })
  }
  // quebra de cena no começo ou no fim do capítulo não faz sentido na página
  while (blocks[0]?.t === 'scene') blocks.shift()
  while (blocks.at(-1)?.t === 'scene') blocks.pop()
  return { blocks, problems }
}

/** Texto puro de uma sequência inline (sem notas). */
export function plainText(c: Inline[]): string {
  return c
    .map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : n.t === 'note' ? '' : plainText(n.c)))
    .join('')
}
