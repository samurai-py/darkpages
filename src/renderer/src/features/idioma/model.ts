/**
 * Modelo do idioma próprio (conlang) de um livro.
 * Coleção "idioma", um documento por língua. DONO: feature Idioma.
 * O processo principal importa só os tipos daqui (import type).
 */

/** Ponto do glifo na grade 0..24: [x, y] ou [x, y, 1] quando é ponto de controle de curva quadrática. */
export type PontoGlifo = [number, number] | [number, number, 1]

export interface Glifo {
  /** cada traço é uma sequência de pontos; um ponto de controle entre dois pontos vira curva */
  tracos: PontoGlifo[][]
  /** espessura do traço em unidades da grade (0.6..4) */
  espessura: number
}

export type Posicao = 'inicio' | 'fim' | 'qualquer'

export interface Proibicao {
  fonema: string
  posicao: Posicao
}

export interface Regras {
  /** ex.: { fonema: "k", posicao: "fim" } = "sem k no fim" */
  proibicoes: Proibicao[]
  /** encontros consonantais permitidos quando o padrão tem CC (vazio = qualquer encontro) */
  clusters: string[]
  /** peso de sorteio por fonema (padrão 1) */
  pesos: Record<string, number>
}

export type Classe = 'substantivo' | 'verbo' | 'adjetivo' | 'advérbio' | 'pronome' | 'conjunção' | 'preposição' | 'artigo' | 'nome' | 'outro'

export const CLASSES: Classe[] = ['substantivo', 'verbo', 'adjetivo', 'advérbio', 'pronome', 'conjunção', 'preposição', 'artigo', 'nome', 'outro']

export interface Entrada {
  id: string
  /** palavra em português (verbos no infinitivo, nomes no singular masculino) */
  pt: string
  /** palavra na língua, na romanização */
  termo: string
  classe: Classe
  nota: string
}

export type Ordem = 'SVO' | 'SOV' | 'VSO' | 'VOS' | 'OVS' | 'OSV'
export const ORDENS: Ordem[] = ['SVO', 'SOV', 'VSO', 'VOS', 'OVS', 'OSV']

export interface Morfologia {
  plural: string
  passado: string
  feminino: string
  ordem: Ordem
  /** artigos do português sem entrada no léxico são omitidos na tradução */
  omitirArtigos: boolean
}

export interface Gerador {
  semente: number
  quantidade: number
  silabasMin: number
  silabasMax: number
}

export interface Lingua {
  id: string
  nome: string
  descricao: string
  consoantes: string[]
  vogais: string[]
  /** ex.: "(C)V(C)", "CV", "(C)(C)V(C)" */
  padraoSilaba: string
  regras: Regras
  lexico: Entrada[]
  morfologia: Morfologia
  /** chave = letra ou dígrafo da romanização ("a", "th", "sh") */
  glifos: Record<string, Glifo>
  /** fonema → grafia latina (vazio = o próprio fonema) */
  romanizacao: Record<string, string>
  gerador: Gerador
  criadoEm: string
  atualizadoEm: string
}

export const GRADE = 24

export function linguaVazia(nome: string): Omit<Lingua, 'id'> {
  const agora = new Date().toISOString()
  return {
    nome,
    descricao: '',
    consoantes: ['p', 't', 'k', 'm', 'n', 's', 'l', 'r'],
    vogais: ['a', 'e', 'i', 'o', 'u'],
    padraoSilaba: '(C)V(C)',
    regras: { proibicoes: [], clusters: [], pesos: {} },
    lexico: [],
    morfologia: { plural: 'i', passado: 'en', feminino: 'a', ordem: 'SVO', omitirArtigos: true },
    glifos: {},
    romanizacao: {},
    gerador: { semente: 1, quantidade: 12, silabasMin: 1, silabasMax: 3 },
    criadoEm: agora,
    atualizadoEm: agora
  }
}

/** Completa campos ausentes (documentos antigos ou editados à mão). */
export function completar(l: Partial<Lingua> & { id: string }): Lingua {
  const base = linguaVazia(l.nome ?? 'Sem nome')
  return {
    ...base,
    ...l,
    regras: { ...base.regras, ...(l.regras ?? {}) },
    morfologia: { ...base.morfologia, ...(l.morfologia ?? {}) },
    gerador: { ...base.gerador, ...(l.gerador ?? {}) },
    glifos: l.glifos ?? {},
    romanizacao: l.romanizacao ?? {},
    lexico: l.lexico ?? [],
    consoantes: l.consoantes ?? base.consoantes,
    vogais: l.vogais ?? base.vogais
  } as Lingua
}

export function novoIdEntrada(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Grafia latina de um fonema. */
export function grafia(l: Lingua, fonema: string): string {
  const g = l.romanizacao[fonema]
  return g && g.trim() ? g.trim() : fonema
}

/** Grafemas da romanização (para os quais faz sentido existir glifo). */
export function grafemas(l: Lingua): string[] {
  const s = new Set<string>()
  for (const f of [...l.vogais, ...l.consoantes]) s.add(grafia(l, f).toLowerCase())
  return [...s]
}

/** Resultado de 'idioma.gerarFonte'. */
export interface FonteGerada {
  arquivo: string
  dataUrl: string
  glifos: number
  bytes: number
  /** grafemas de mais de um caractere viram ligaduras (liga) e também ficam na área de uso privado */
  ligaduras: string[]
  /** grafema → ponto de código na área de uso privado (U+E000…) */
  pua: Record<string, number>
}

/** Resultado de 'idioma.traduzirIA'. */
export interface TraducaoIA {
  traducao: string
  glosa: Array<{ pt: string; termo: string }>
  novas: Array<{ pt: string; termo: string; classe: Classe }>
  nota: string
}
