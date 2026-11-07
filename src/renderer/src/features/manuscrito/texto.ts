import type { Ficha } from '../../../../shared/models'
import type { LayoutSettings } from '../../../../shared/types'
import { familias, radical } from '../../../../shared/stemmer-pt'

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

/** Radical para agrupar repetições: Snowball PT + ajustes (ver shared/stemmer-pt.ts). */
export { radical }

export function isStopword(word: string): boolean {
  const f = fold(word)
  return f.length < 4 || STOP.has(f) || /^\d+$/.test(f)
}

export interface Repeticao {
  /** chave da família (radical) */
  raiz: string
  /** radicais que caem nesta família (ex.: "sombr" e "sombri"); o realce do editor compara com eles */
  radicais: string[]
  total: number
  /** formas encontradas → contagem */
  formas: Record<string, number>
}

/** Palavras do texto (fora as comuns) com a chave de família de cada uma. */
function palavrasComFamilia(texto: string): Array<{ w: string; r: string; k: string }> {
  const ps = [...texto.matchAll(WORD_RE)].map((m) => m[0]).filter((w) => !isStopword(w))
  const rs = ps.map(radical)
  const f = familias(rs)
  return ps.map((w, i) => ({ w, r: rs[i]!, k: f.get(rs[i]!) ?? rs[i]! }))
}

/** Conta famílias de palavras no texto e devolve as mais repetidas (≥ `minimo`, até `limite`). */
export function analisarRepeticoes(texto: string, limite = 12, minimo = 3): Repeticao[] {
  const mapa = new Map<string, Repeticao>()
  for (const { w, r, k } of palavrasComFamilia(texto)) {
    let e = mapa.get(k)
    if (!e) {
      e = { raiz: k, radicais: [], total: 0, formas: {} }
      mapa.set(k, e)
    }
    if (!e.radicais.includes(r)) e.radicais.push(r)
    e.total++
    const forma = w.toLowerCase()
    e.formas[forma] = (e.formas[forma] ?? 0) + 1
  }
  return [...mapa.values()]
    .filter((e) => e.total >= minimo)
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
}

/** Contagem da família de uma palavra num texto (para o popup). */
export function contarRadical(texto: string, palavra: string): Repeticao {
  const ps = [...texto.matchAll(WORD_RE)].map((m) => m[0])
  const rs = ps.map(radical)
  const rAlvo = radical(palavra)
  const f = familias([...rs, rAlvo])
  const raiz = f.get(rAlvo) ?? rAlvo
  const e: Repeticao = { raiz, radicais: [], total: 0, formas: {} }
  ps.forEach((w, i) => {
    const r = rs[i]!
    if ((f.get(r) ?? r) !== raiz) return
    if (!e.radicais.includes(r)) e.radicais.push(r)
    e.total++
    const fw = w.toLowerCase()
    e.formas[fw] = (e.formas[fw] ?? 0) + 1
  })
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

// estimativa e calibração ficam em shared/paginas.ts (o processo principal calibra após diagramar)
export { palavrasPorPagina, paginasCapitulo } from '../../../../shared/paginas'

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

/** "7 de nov. de 2026" a partir de ISO 8601 (vazio se inválida). */
export function dataCurta(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
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
