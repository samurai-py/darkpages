import type { Ficha } from '../../../../shared/models'
import type { LayoutSettings } from '../../../../shared/types'

/** Minúsculas e sem acento, preservando o comprimento (1 caractere → 1 caractere). */
export function foldChar(c: string): string {
  const d = c.normalize('NFD')[0] ?? c
  const l = d.toLowerCase()
  return l.length === 1 ? l : c
}

export function fold(s: string): string {
  let out = ''
  for (const c of s) out += c.length === 1 ? foldChar(c) : c
  return out
}

/** Versão de `fold` que trata pares substitutos como 2 posições (mesmo índice de String). */
export function foldSameLength(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) out += foldChar(s[i]!)
  return out
}

export const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu

const STOP = new Set(
  (
    'a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra pro com sem sob sobre ' +
    'entre ate apos que se nao sim mas ou e ja mais menos muito muita muitos muitas pouco pouca tao tambem so ainda quando ' +
    'onde como porque pois entao isso isto aquilo esse essa esses essas este esta estes estas aquele aquela aqueles aquelas ' +
    'ele ela eles elas eu tu voce voces vos me te lhe lhes meu minha meus minhas seu sua seus suas teu tua teus tuas nosso nossa ' +
    'nossos nossas dele dela deles delas num numa ao aos foi foram era eram ser sido estar estava estavam tinha tinham ter tido ' +
    'havia ha tem sao estao qual quais quem cada todo toda todos todas outro outra outros outras mesmo mesma mesmos mesmas ' +
    'algum alguma alguns algumas nada tudo ali aqui la ca assim depois antes agora sempre nunca bem mal sera seria fosse ' +
    'pode podia vai ia vou fez faz sua seu talvez enquanto embora apenas entao inda nem lo la los las'
  ).split(' ')
)

const SUFIXOS = [
  'aríamos', 'eríamos', 'iríamos', 'ássemos', 'êssemos', 'íssemos', 'ariamos', 'eriamos', 'iriamos', 'assemos', 'essemos', 'issemos',
  'ávamos', 'avamos', 'íamos', 'iamos', 'aremos', 'eremos', 'iremos', 'aram', 'eram', 'iram', 'avam', 'iam', 'ando', 'endo', 'indo',
  'adas', 'ados', 'idas', 'idos', 'aria', 'eria', 'iria', 'asse', 'esse', 'isse', 'ará', 'erá', 'irá', 'ara', 'era', 'ira', 'ava',
  'ada', 'ado', 'ida', 'ido', 'mente', 'ões', 'oes', 'ães', 'aes', 'ais', 'eis', 'ou', 'eu', 'iu', 'ar', 'er', 'ir', 'am', 'em',
  'es', 'as', 'os', 'a', 'e', 'o', 's'
].map(fold)

/** Radical aproximado em PT: sem acento, minúsculo, sem terminações verbais/plurais comuns. */
export function radical(word: string): string {
  const w = fold(word).replace(/['’-]/g, '')
  if (w.length <= 4) return w
  for (const s of SUFIXOS) {
    if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length)
  }
  return w
}

export function isStopword(word: string): boolean {
  const f = fold(word)
  return f.length < 4 || STOP.has(f) || /^\d+$/.test(f)
}

export interface Repeticao {
  raiz: string
  total: number
  /** formas encontradas → contagem */
  formas: Record<string, number>
}

/** Conta radicais no texto e devolve os mais repetidos (≥ `minimo`, até `limite`). */
export function analisarRepeticoes(texto: string, limite = 12, minimo = 3): Repeticao[] {
  const mapa = new Map<string, Repeticao>()
  for (const m of texto.matchAll(WORD_RE)) {
    const w = m[0]
    if (isStopword(w)) continue
    const r = radical(w)
    let e = mapa.get(r)
    if (!e) {
      e = { raiz: r, total: 0, formas: {} }
      mapa.set(r, e)
    }
    e.total++
    const forma = w.toLowerCase()
    e.formas[forma] = (e.formas[forma] ?? 0) + 1
  }
  return [...mapa.values()]
    .filter((e) => e.total >= minimo)
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
}

/** Contagem do radical de uma palavra num texto (para o popup). */
export function contarRadical(texto: string, palavra: string): Repeticao {
  const raiz = radical(palavra)
  const e: Repeticao = { raiz, total: 0, formas: {} }
  for (const m of texto.matchAll(WORD_RE)) {
    if (radical(m[0]) !== raiz) continue
    e.total++
    const f = m[0].toLowerCase()
    e.formas[f] = (e.formas[f] ?? 0) + 1
  }
  return e
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Fichas cujo nome ou apelido aparece no texto (sem diferenciar acento/maiúsculas). */
export function fichasNoTexto(texto: string, fichas: Ficha[]): Array<{ ficha: Ficha; vezes: number }> {
  const t = fold(texto)
  const out: Array<{ ficha: Ficha; vezes: number }> = []
  for (const f of fichas) {
    const nomes = [f.nome, ...(f.apelidos ?? [])].map((n) => fold(n.trim())).filter((n) => n.length >= 2)
    if (nomes.length === 0) continue
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${nomes.map(escRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    const vezes = [...t.matchAll(re)].length
    if (vezes > 0) out.push({ ficha: f, vezes })
  }
  return out.sort((a, b) => b.vezes - a.vezes)
}

// ------------------------------------------------------------------ páginas

const PT_MM = 25.4 / 72

/** Palavras por página no formato/corpo/entrelinha da diagramação (estimativa). */
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

/** Páginas de um capítulo: abre em página nova e perde ~1/3 de página no rebaixo do título. */
export function paginasCapitulo(palavras: number, l: LayoutSettings): number {
  return Math.max(1, Math.ceil(palavras / palavrasPorPagina(l) + 0.35))
}

export function formatoCm(l: LayoutSettings): string {
  const cm = (mm: number): string => (Math.round(mm) % 10 === 0 ? String(mm / 10) : (mm / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }))
  return `${cm(l.trim.widthMm)}×${cm(l.trim.heightMm)}`
}

export function tempoLeitura(palavras: number): string {
  const min = Math.max(1, Math.round(palavras / 230))
  if (min < 60) return `${min} min de leitura`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h} h${m ? ` ${m} min` : ''} de leitura`
}

export function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Mantém a caixa da primeira letra da palavra original na substituta. */
export function manterCaixa(original: string, nova: string): string {
  if (!original || !nova) return nova
  const p = original[0]!
  if (p === p.toUpperCase() && p !== p.toLowerCase()) return nova[0]!.toUpperCase() + nova.slice(1)
  return nova
}

export function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
