import mammoth from 'mammoth'
import { countWords, type ChapterKind } from '../../shared/types'
import { decodeEntities } from './manuscrito-md'

/**
 * Importação de .docx / .txt / .md → capítulos em Markdown.
 * Divisão: por Título 1 (Heading 1 / "# ") quando houver; senão por linhas do
 * tipo "Capítulo 3", "CAPÍTULO III", "Prólogo", "XII" ou "12".
 */

export interface CapImportado {
  title: string
  kind: ChapterKind
  body: string
}

export interface PreviaImport {
  id: string
  arquivo: string
  capitulos: Array<{ titulo: string; tipo: ChapterKind; palavras: number; inicio: string }>
  avisos: string[]
}

interface Bloco {
  /** h1 = título de capítulo explícito; h = outro título; p = parágrafo; cena = quebra */
  tipo: 'h1' | 'h' | 'p' | 'cena'
  /** Markdown inline */
  md: string
}

// ---------------------------------------------------------------- HTML (mammoth) → blocos

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

/** Escapa caracteres que o Markdown interpretaria. */
function escMd(s: string): string {
  return s.replace(/([\\*_`[\]^#])/g, '\\$1')
}

/** Converte HTML inline do mammoth para Markdown inline (itálico, negrito, quebras, notas). */
function inlineHtmlToMd(html: string, notas: Map<string, string>): string {
  let s = html
  // referências de nota: <sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup>
  s = s.replace(/<sup>\s*<a[^>]*href="#((?:foot|end)note-[^"]+)"[^>]*>[\s\S]*?<\/a>\s*<\/sup>/g, (_m, id: string) => {
    const t = notas.get(id)
    return t !== undefined ? `\u0000N${encodeURIComponent(t)}\u0000` : ''
  })
  s = s.replace(/<br\s*\/?>/gi, '\u0000R\u0000')
  s = s.replace(/<(\/?)(strong|b)(?:\s[^>]*)?>/gi, (_m, c: string) => `\u0000${c ? 'b' : 'B'}\u0000`)
  s = s.replace(/<(\/?)(em|i)(?:\s[^>]*)?>/gi, (_m, c: string) => `\u0000${c ? 'i' : 'I'}\u0000`)
  s = stripTags(s)

  // segmentos de texto com o estado de formatação
  type Seg = { t: string; i: boolean; b: boolean } | { raw: string }
  const segs: Seg[] = []
  let it = 0
  let bd = 0
  s.split('\u0000').forEach((part, idx) => {
    if (idx % 2 === 0) {
      if (!part) return
      const t = decodeEntities(part).replace(/\s+/g, ' ')
      const last = segs.at(-1)
      if (last && 't' in last && last.i === it > 0 && last.b === bd > 0) last.t += t
      else segs.push({ t, i: it > 0, b: bd > 0 })
      return
    }
    if (part === 'I') it++
    else if (part === 'i') it = Math.max(0, it - 1)
    else if (part === 'B') bd++
    else if (part === 'b') bd = Math.max(0, bd - 1)
    else if (part === 'R') segs.push({ raw: '\\\n' })
    else if (part.startsWith('N')) segs.push({ raw: `^[${decodeURIComponent(part.slice(1))}]` })
  })
  return segs
    .map((g) => {
      if ('raw' in g) return g.raw
      const m = g.t.match(/^(\s*)([\s\S]*?)(\s*)$/)!
      const core = escMd(m[2] ?? '')
      if (!core) return g.t
      const mk = (g.b ? '**' : '') + (g.i ? '*' : '')
      const close = (g.i ? '*' : '') + (g.b ? '**' : '')
      return `${m[1]}${mk}${core}${close}${m[3]}`
    })
    .join('')
    .trim()
}

function htmlParaBlocos(html: string): Bloco[] {
  // notas de rodapé e de fim: <li id="footnote-1"><p>texto <a href="#footnote-ref-1">↑</a></p></li>
  const notas = new Map<string, string>()
  const semNotas = html.replace(/<li id="((?:foot|end)note-[^"]+)">([\s\S]*?)<\/li>/g, (_m, id: string, inner: string) => {
    const limpo = inner.replace(/<a[^>]*href="#(?:foot|end)note-ref-[^"]*"[^>]*>[\s\S]*?<\/a>/g, '')
    notas.set(id, inlineHtmlToMd(limpo.replace(/<\/?p[^>]*>/g, ' '), new Map()).replace(/\]/g, '\\]'))
    return ''
  })
  const blocos: Bloco[] = []
  const re = /<(h[1-6]|p|li|td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(semNotas))) {
    const tag = m[1]!.toLowerCase()
    const md = inlineHtmlToMd(m[3] ?? '', notas)
    const plain = md.replace(/[\\*]/g, '').trim()
    if (!plain) continue
    if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^[⁂#~]+$|^\\?\*\s\\?\*\s\\?\*$/.test(plain) || /^(?:\* ?){3}$/.test(md.replace(/\\/g, ''))) {
      blocos.push({ tipo: 'cena', md: '' })
      continue
    }
    blocos.push({ tipo: tag === 'h1' ? 'h1' : tag.startsWith('h') ? 'h' : 'p', md })
  }
  return blocos
}

// ---------------------------------------------------------------- texto / markdown → blocos

function textoParaBlocos(texto: string, markdown: boolean): Bloco[] {
  const t = texto.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const linhas = t.split('\n')
  const vazias = linhas.filter((l) => !l.trim()).length
  // .txt de "uma linha por parágrafo" (quase sem linhas em branco)
  const porLinha = !markdown && vazias < linhas.length * 0.1
  const pedacos = porLinha ? linhas : t.split(/\n[ \t]*\n+/)
  const blocos: Bloco[] = []
  for (const raw of pedacos) {
    const p = raw.trim()
    if (!p) continue
    if (/^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|⁂|#|~+)$/.test(p)) {
      blocos.push({ tipo: 'cena', md: '' })
      continue
    }
    if (markdown) {
      const h = p.match(/^(#{1,6})\s+(.+)$/)
      if (h && !p.includes('\n')) {
        blocos.push({ tipo: h[1] === '#' ? 'h1' : 'h', md: h[2]!.trim() })
        continue
      }
      blocos.push({ tipo: 'p', md: p.replace(/\n/g, ' ') })
    } else {
      blocos.push({ tipo: 'p', md: escMd(p.replace(/\s*\n\s*/g, ' ')) })
    }
  }
  return blocos
}

// ---------------------------------------------------------------- divisão em capítulos

const PALAVRAS_NUM =
  'um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|primeiro|segundo|terceiro|quarto|quinto|sexto|s[eé]timo|oitavo|nono|d[eé]cimo'
const RE_CAPITULO = new RegExp(
  `^(?:cap[ií]tulo|cap\\.)\\s+(?:\\d{1,3}|[ivxlcdm]{1,7}|(?:${PALAVRAS_NUM})(?:[\\s-]+(?:e\\s+)?(?:${PALAVRAS_NUM}))*)\\b\\s*[.:—–-]?\\s*(.*)$`,
  'i'
)
const RE_NUMERAL = /^(?:\d{1,3}|[IVXLCDM]{1,7})\.?$/
const RE_PROLOGO = /^pr[óo]logo\b[.:—–-]?\s*(.*)$/i
const RE_EPILOGO = /^ep[íi]logo\b[.:—–-]?\s*(.*)$/i

function plano(md: string): string {
  return md.replace(/\\([\\*_`[\]^#])/g, '$1').replace(/[*_]/g, '').trim()
}

function ehTituloSolto(b: Bloco | undefined): boolean {
  if (!b || b.tipo === 'cena') return false
  const t = plano(b.md)
  return t.length > 0 && countWords(t) <= 10 && !/[.!?…:;,—–-]$/.test(t) && !/^[—–-]/.test(t)
}

function tipoDe(titulo: string): ChapterKind {
  if (RE_PROLOGO.test(titulo)) return 'prologo'
  if (RE_EPILOGO.test(titulo)) return 'epilogo'
  return 'capitulo'
}

/** Divide blocos em capítulos. `nomeBase` dá título quando não há divisão. */
export function dividir(blocos: Bloco[], nomeBase: string): CapImportado[] {
  const temH1 = blocos.some((b) => b.tipo === 'h1')
  const ehInicio = (b: Bloco): boolean => {
    if (b.tipo === 'cena') return false
    if (temH1) return b.tipo === 'h1'
    const t = plano(b.md)
    if (t.length > 80) return false
    return RE_CAPITULO.test(t) || RE_NUMERAL.test(t) || RE_PROLOGO.test(t) || RE_EPILOGO.test(t)
  }

  const caps: CapImportado[] = []
  let atual: { title: string; kind: ChapterKind; corpo: string[] } | null = null
  const fechar = (): void => {
    if (!atual) return
    const body = atual.corpo.join('\n\n').trim()
    if (body || atual.title) caps.push({ title: atual.title, kind: atual.kind, body: body ? `${body}\n` : '' })
    atual = null
  }

  // rótulo curto ("CAPÍTULO UM", "Prólogo", "XII") logo antes de um Título 1
  const ehRotulo = (b: Bloco, prox: Bloco | undefined): boolean => {
    if (!temH1 || b.tipo === 'h1' || b.tipo === 'cena' || prox?.tipo !== 'h1') return false
    const t = plano(b.md)
    return t.length <= 40 && (RE_CAPITULO.test(t) || RE_NUMERAL.test(t) || RE_PROLOGO.test(t) || RE_EPILOGO.test(t))
  }
  let rotulo: ChapterKind | null = null

  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i]!
    if (ehRotulo(b, blocos[i + 1])) {
      rotulo = tipoDe(plano(b.md))
      continue
    }
    if (ehInicio(b)) {
      fechar()
      let titulo = plano(b.md)
      const kind = rotulo && rotulo !== 'capitulo' ? rotulo : tipoDe(titulo)
      rotulo = null
      // "Capítulo 3" + subtítulo na linha seguinte → usa o subtítulo como título
      const resto = titulo.match(RE_CAPITULO)?.[1] ?? titulo.match(RE_PROLOGO)?.[1] ?? titulo.match(RE_EPILOGO)?.[1]
      const soNumero = RE_NUMERAL.test(titulo) || (resto !== undefined && resto.trim() === '')
      if (resto && resto.trim()) titulo = resto.trim()
      else if (soNumero && ehTituloSolto(blocos[i + 1]) && blocos[i + 1]!.tipo !== 'h1' && !ehInicio(blocos[i + 1]!)) {
        titulo = plano(blocos[i + 1]!.md)
        i++
      }
      atual = { title: titulo || 'Sem título', kind, corpo: [] }
      continue
    }
    if (!atual) {
      // texto antes do primeiro capítulo
      atual = { title: caps.length === 0 && blocos.some(ehInicio) ? 'Abertura' : nomeBase, kind: 'capitulo', corpo: [] }
    }
    if (b.tipo === 'cena') {
      if (atual.corpo.length && atual.corpo.at(-1) !== '***') atual.corpo.push('***')
    } else if (b.tipo === 'h' || b.tipo === 'h1') atual.corpo.push(`## ${b.md}`)
    else atual.corpo.push(b.md)
  }
  fechar()
  // remove quebra de cena solta no fim de cada capítulo
  return caps
    .map((c) => ({ ...c, body: c.body.replace(/(?:\n\n)?\*\*\*\n?$/, '\n').replace(/^\n+$/, '') }))
    .filter((c) => c.body.trim() || c.title !== 'Abertura')
}

// ---------------------------------------------------------------- entrada

function decodeDataUrl(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:[^;,]*(?:;[^;,]*)*;base64,(.*)$/s)
  if (!m || m[1] === undefined) throw new Error('Arquivo inválido (esperado data URL em base64)')
  return Buffer.from(m[1], 'base64')
}

/** UTF-8 quando válido; senão Windows-1252 (arquivos antigos do Word/Bloco de Notas). */
function decodeTexto(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export async function lerArquivo(nome: string, dataUrl: string): Promise<{ caps: CapImportado[]; avisos: string[] }> {
  const ext = (nome.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  const base = nome.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Importado'
  const buf = decodeDataUrl(dataUrl)
  const avisos: string[] = []
  let blocos: Bloco[]
  if (ext === 'docx') {
    const r = await mammoth.convertToHtml({ buffer: buf })
    for (const m of r.messages) if (m.type === 'error') avisos.push(m.message)
    blocos = htmlParaBlocos(r.value)
  } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    blocos = textoParaBlocos(decodeTexto(buf), ext !== 'txt')
  } else {
    throw new Error('Formato não suportado: use .docx, .txt ou .md')
  }
  const caps = dividir(blocos, base)
  if (caps.length === 0) throw new Error('Nenhum texto encontrado no arquivo')
  if (caps.length === 1) avisos.push('Nenhuma divisão de capítulo encontrada: o texto vira um capítulo só.')
  return { caps, avisos }
}

export function previa(id: string, arquivo: string, caps: CapImportado[], avisos: string[]): PreviaImport {
  return {
    id,
    arquivo,
    avisos,
    capitulos: caps.map((c) => ({
      titulo: c.title,
      tipo: c.kind,
      palavras: countWords(c.body.replace(/\^\[[^\]]*\]/g, '')),
      inicio: plano(c.body.split('\n\n')[0] ?? '').slice(0, 140)
    }))
  }
}
