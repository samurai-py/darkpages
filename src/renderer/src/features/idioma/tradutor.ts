import { termoPara } from './fonologia'
import type { Classe, Entrada, Lingua, Ordem } from './model'

export type TokenTipo = 'lexico' | 'novo' | 'nome' | 'omitido' | 'pontuacao'

export interface Token {
  /** palavra original em português */
  pt: string
  /** palavra na língua (ou a própria pontuação) */
  termo: string
  /** glosa: "sino", "calar-PASS", "cidade-PL" */
  glosa: string
  tipo: TokenTipo
  classe?: Classe
}

export interface Sugestao {
  pt: string
  termo: string
  classe: Classe
}

export interface Traducao {
  texto: string
  tokens: Token[]
  novas: Sugestao[]
}

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

interface Flexao {
  plural?: boolean
  passado?: boolean
  feminino?: boolean
}

interface Analise {
  entrada: Entrada
  flex: Flexao
}

const ARTIGOS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas'])

// [terminação, troca, flexão]; só aplicadas a verbos
const VERBO: Array<[string, string, Flexao]> = [
  ['aram', 'ar', { passado: true }], ['eram', 'er', { passado: true }], ['iram', 'ir', { passado: true }],
  ['avam', 'ar', { passado: true }], ['iam', 'er', { passado: true }], ['iam', 'ir', { passado: true }],
  ['aste', 'ar', { passado: true }], ['este', 'er', { passado: true }], ['iste', 'ir', { passado: true }],
  ['ava', 'ar', { passado: true }], ['ou', 'ar', { passado: true }], ['eu', 'er', { passado: true }], ['iu', 'ir', { passado: true }],
  ['ei', 'ar', { passado: true }], ['ia', 'er', { passado: true }], ['ia', 'ir', { passado: true }],
  ['i', 'er', { passado: true }], ['i', 'ir', { passado: true }], ['os', 'or', { passado: true }],
  ['ando', 'ar', {}], ['endo', 'er', {}], ['indo', 'ir', {}],
  ['am', 'ar', {}], ['em', 'er', {}], ['em', 'ir', {}],
  ['a', 'ar', {}], ['e', 'er', {}], ['e', 'ir', {}],
  ['o', 'ar', {}], ['o', 'er', {}], ['o', 'ir', {}]
]

// [terminação, troca] de plural para singular
const PLURAL: Array<[string, string]> = [
  ['oes', 'ao'], ['aes', 'ao'], ['aos', 'ao'], ['ais', 'al'], ['eis', 'el'], ['ois', 'ol'], ['is', 'il'],
  ['ns', 'm'], ['res', 'r'], ['zes', 'z'], ['ses', 's'], ['es', ''], ['s', '']
]

export function indice(lexico: Entrada[]): Map<string, Entrada> {
  const m = new Map<string, Entrada>()
  for (const e of lexico) {
    const k = normalizar(e.pt)
    if (k && !m.has(k)) m.set(k, e)
  }
  return m
}

function analisar(palavra: string, idx: Map<string, Entrada>): Analise | null {
  const w = normalizar(palavra)
  const exata = idx.get(w)
  if (exata) return { entrada: exata, flex: {} }
  for (const [fim, troca, flex] of VERBO) {
    if (w.length > fim.length + 1 && w.endsWith(fim)) {
      const e = idx.get(w.slice(0, -fim.length) + troca)
      if (e && e.classe === 'verbo') return { entrada: e, flex }
    }
  }
  for (const [fim, troca] of PLURAL) {
    if (w.length > fim.length + 1 && w.endsWith(fim)) {
      const base = w.slice(0, -fim.length) + troca
      const e = idx.get(base)
      if (e && e.classe !== 'verbo') return { entrada: e, flex: { plural: true } }
      // feminino plural: velhas → velho
      if (base.endsWith('a')) {
        const m = idx.get(base.slice(0, -1) + 'o')
        if (m && m.classe !== 'verbo') return { entrada: m, flex: { plural: true, feminino: true } }
      }
    }
  }
  if (w.endsWith('a') && w.length > 2) {
    const e = idx.get(w.slice(0, -1) + 'o')
    if (e && e.classe !== 'verbo') return { entrada: e, flex: { feminino: true } }
  }
  return null
}

/** Junta raiz e sufixo sem duplicar a letra de emenda ("vela" + "a" = "vela"). */
export function sufixar(raiz: string, sufixo: string): string {
  const s = sufixo.trim().replace(/^-/, '')
  if (!s) return raiz
  if (raiz.slice(-1).toLowerCase() === s[0]?.toLowerCase()) return raiz + s.slice(1)
  return raiz + s
}

function adivinharClasse(pt: string): Classe {
  const w = normalizar(pt)
  if (w.endsWith('mente')) return 'advérbio'
  if (/(ar|er|ir|or|ou|eu|iu|aram|eram|iram|ando|endo|indo)$/.test(w)) return 'verbo'
  return 'substantivo'
}

function capitalizar(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

function reordenar(tokens: Token[], ordem: Ordem): Token[] {
  if (ordem === 'SVO') return tokens
  const v = tokens.findIndex((t) => t.classe === 'verbo')
  if (v < 0) return tokens
  const partes: Record<'S' | 'V' | 'O', Token[]> = { S: tokens.slice(0, v), V: [tokens[v] as Token], O: tokens.slice(v + 1) }
  return [...ordem].flatMap((c) => partes[c as 'S' | 'V' | 'O'])
}

/** Tradução por regra: palavra a palavra pelo léxico + morfologia + ordem das palavras. */
export function traduzir(l: Lingua, texto: string): Traducao {
  const idx = indice(l.lexico)
  const ocupados = new Set(l.lexico.map((e) => e.termo.toLowerCase()))
  const novasPorPt = new Map<string, Sugestao>()
  const brutos: Array<Token & { inicioFrase: boolean }> = []
  const re = /(\p{L}+(?:[-'’]\p{L}+)*)|([^\p{L}\s]+)/gu
  let inicioFrase = true
  for (const m of texto.matchAll(re)) {
    if (m[2]) {
      brutos.push({ pt: m[2], termo: m[2], glosa: m[2], tipo: 'pontuacao', inicioFrase: false })
      if (/[.!?…]/.test(m[2])) inicioFrase = true
      continue
    }
    const pt = m[1] as string
    const a = analisar(pt, idx)
    if (a) {
      let termo = a.entrada.termo
      const marcas: string[] = []
      if (a.flex.feminino) { termo = sufixar(termo, l.morfologia.feminino); marcas.push('FEM') }
      if (a.flex.plural) { termo = sufixar(termo, l.morfologia.plural); marcas.push('PL') }
      if (a.flex.passado) { termo = sufixar(termo, l.morfologia.passado); marcas.push('PASS') }
      brutos.push({ pt, termo, glosa: [a.entrada.pt, ...marcas].join('-'), tipo: 'lexico', classe: a.entrada.classe, inicioFrase })
    } else if (l.morfologia.omitirArtigos && ARTIGOS.has(normalizar(pt))) {
      brutos.push({ pt, termo: '', glosa: '∅', tipo: 'omitido', classe: 'artigo', inicioFrase })
    } else if (!inicioFrase && /^\p{Lu}/u.test(pt)) {
      brutos.push({ pt, termo: pt, glosa: pt, tipo: 'nome', classe: 'nome', inicioFrase })
    } else {
      const k = normalizar(pt)
      let s = novasPorPt.get(k)
      if (!s) {
        const termo = termoPara(l, k, ocupados)
        ocupados.add(termo.toLowerCase())
        s = { pt: pt.toLowerCase(), termo, classe: adivinharClasse(pt) }
        novasPorPt.set(k, s)
      }
      brutos.push({ pt, termo: s.termo, glosa: `${pt.toLowerCase()}?`, tipo: 'novo', classe: s.classe, inicioFrase })
    }
    inicioFrase = false
  }

  // ordem das palavras por oração (pontuação e conjunções separam orações)
  const saida: Token[] = []
  let oracao: Token[] = []
  const fecha = (): void => {
    saida.push(...reordenar(oracao, l.morfologia.ordem))
    oracao = []
  }
  for (const t of brutos) {
    const { inicioFrase: _i, ...tok } = t
    if (tok.tipo === 'omitido') continue
    if (tok.tipo === 'pontuacao' || tok.classe === 'conjunção') {
      fecha()
      saida.push(tok)
    } else oracao.push(tok)
  }
  fecha()

  // maiúscula no início de cada frase
  let partes = ''
  let frase = true
  for (const t of saida) {
    if (t.tipo === 'pontuacao') {
      partes += t.termo
      if (/[.!?…]/.test(t.termo)) frase = true
      continue
    }
    const w = frase ? capitalizar(t.termo) : t.tipo === 'nome' ? t.termo : t.termo.toLowerCase()
    if (frase) t.termo = w
    partes += (partes && !/[(“"'—-]$/.test(partes) ? ' ' : '') + w
    frase = false
  }
  return { texto: partes.trim(), tokens: saida, novas: [...novasPorPt.values()] }
}
