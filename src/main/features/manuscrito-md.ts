/**
 * Leitura do Markdown dos capítulos no processo principal (sem DOM), usada na
 * exportação. Cobre o subconjunto que o editor grava: parágrafos, *itálico*,
 * **negrito**, quebra de cena (`***`), nota de rodapé inline `^[texto]`,
 * quebra de linha forçada e títulos internos.
 */

export interface Run {
  text: string
  italic: boolean
  bold: boolean
  /** quebra de linha forçada antes do texto */
  br?: boolean
  /** nota de rodapé: conteúdo bruto em Markdown */
  nota?: string
}

export type Block =
  | { kind: 'p'; runs: Run[] }
  | { kind: 'h'; runs: Run[] }
  | { kind: 'cena' }

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k in ENTITIES) return ENTITIES[k]!
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)))
    return m
  })
}

/** Encontra o `]` que fecha `^[` aberto em `start` (índice do `[`). -1 se não houver. */
export function closingBracket(s: string, start: number): number {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c)

export function parseInline(src: string): Run[] {
  const runs: Run[] = []
  let italic = false
  let bold = false
  let buf = ''
  let br = false
  const push = (): void => {
    if (buf || br) runs.push({ text: decodeEntities(buf), italic, bold, ...(br ? { br: true } : {}) })
    buf = ''
    br = false
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    const n = src[i + 1]
    if (c === '\\' && n === '\n') {
      push()
      br = true
      i++
      continue
    }
    if (c === '\\' && n !== undefined) {
      buf += n
      i++
      continue
    }
    if (c === '<' && /^<br\s*\/?>/i.test(src.slice(i, i + 6))) {
      push()
      br = true
      i = src.indexOf('>', i)
      continue
    }
    if (c === '^' && n === '[') {
      const end = closingBracket(src, i + 1)
      if (end > 0) {
        push()
        runs.push({ text: '', italic, bold, nota: src.slice(i + 2, end) })
        i = end
        continue
      }
    }
    if ((c === '*' || c === '_') && n === c) {
      if (c === '_' && isWordChar(src[i - 1]) && isWordChar(src[i + 2])) {
        buf += '__'
        i++
        continue
      }
      push()
      bold = !bold
      i++
      continue
    }
    if (c === '*' || c === '_') {
      if (c === '_' && isWordChar(src[i - 1]) && isWordChar(n)) {
        buf += c
        continue
      }
      push()
      italic = !italic
      continue
    }
    if (c === '\n') {
      // linha terminada com dois espaços = quebra; senão, espaço
      if (buf.endsWith('  ')) {
        buf = buf.replace(/ +$/, '')
        push()
        br = true
      } else buf += ' '
      continue
    }
    buf += c
  }
  push()
  return runs
}

const SCENE = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|⁂|\* \* \*)$/

export function parseBlocks(body: string): Block[] {
  const out: Block[] = []
  const blocks = body.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
  for (const raw of blocks) {
    const t = raw.trim()
    if (!t) continue
    if (SCENE.test(t)) {
      out.push({ kind: 'cena' })
      continue
    }
    const h = t.match(/^#{1,6}\s+(.*)$/s)
    if (h) {
      out.push({ kind: 'h', runs: parseInline(h[1]!.trim()) })
      continue
    }
    const text = t
      .split('\n')
      .map((l) => l.replace(/^>\s?/, '').replace(/^[-+*]\s+(?=\S)/, '• '))
      .join('\n')
    out.push({ kind: 'p', runs: parseInline(text) })
  }
  return out
}

/** Texto puro de uma lista de runs (notas viram marcadores numerados por `nota`). */
export function runsToPlain(runs: Run[], nota?: (texto: string) => string): string {
  return runs
    .map((r) => (r.nota !== undefined ? (nota ? nota(r.nota) : '') : `${r.br ? '\n' : ''}${r.text}`))
    .join('')
}

/** Markdown → texto puro (para contagens e notas). */
export function mdToPlain(md: string): string {
  return parseBlocks(md)
    .map((b) => (b.kind === 'cena' ? '* * *' : runsToPlain(b.runs)))
    .join('\n\n')
}
