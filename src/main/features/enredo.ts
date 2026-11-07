import { bookDir, type Handlers } from '../api/context'
import { getDoc, putDoc } from '../store/docs'
import type { Cartao, CartaoTipo, EnredoBoard, Ligacao } from '../../shared/models'

/**
 * Enredo (E1–E5): quadro único na coleção "enredo", documento "board".
 * A interface lê e grava por aqui para o documento sair sempre saneado
 * (tipos válidos, ligações sem pontas soltas, textos com limite).
 */

const COLECAO = 'enredo'
const DOC = 'board'
const TIPOS: CartaoTipo[] = ['cena', 'virada', 'personagem', 'ideia', 'local']
const CAPITULO = /^\d{3}-[a-z0-9-]+\.md$/
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/
const MAX_CARTOES = 5000

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function numero(v: unknown, padrao = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : padrao
}

function cartao(v: unknown): Cartao | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  const id = texto(c.id, 100)
  if (!ID.test(id)) return null
  const tipo = TIPOS.includes(c.tipo as CartaoTipo) ? (c.tipo as CartaoTipo) : 'ideia'
  const out: Cartao = {
    id,
    tipo,
    titulo: texto(c.titulo, 300),
    texto: texto(c.texto, 20_000),
    fichas: Array.isArray(c.fichas)
      ? [...new Set(c.fichas.filter((f): f is string => typeof f === 'string' && ID.test(f)))].slice(0, 100)
      : [],
    x: numero(c.x),
    y: numero(c.y),
    criadoEm: texto(c.criadoEm, 40) || new Date().toISOString()
  }
  const cap = texto(c.capitulo, 200)
  if (CAPITULO.test(cap)) out.capitulo = cap
  if (typeof c.ordem === 'number' && Number.isFinite(c.ordem)) out.ordem = numero(c.ordem)
  return out
}

/** Saneia um quadro vindo da interface ou do disco. */
export function sanearBoard(v: unknown): EnredoBoard {
  const raw = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof EnredoBoard, unknown>>
  const cartoes: Cartao[] = []
  const vistos = new Set<string>()
  for (const item of Array.isArray(raw.cartoes) ? raw.cartoes.slice(0, MAX_CARTOES) : []) {
    const c = cartao(item)
    if (c && !vistos.has(c.id)) {
      vistos.add(c.id)
      cartoes.push(c)
    }
  }
  const ligacoes: Ligacao[] = []
  const pares = new Set<string>()
  for (const item of Array.isArray(raw.ligacoes) ? raw.ligacoes.slice(0, MAX_CARTOES * 4) : []) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    const id = texto(l.id, 100)
    const de = texto(l.de, 100)
    const para = texto(l.para, 100)
    if (!ID.test(id) || !vistos.has(de) || !vistos.has(para) || de === para || pares.has(id)) continue
    pares.add(id)
    ligacoes.push({ id, de, para, rotulo: texto(l.rotulo, 120), tipo: l.tipo === 'causa' ? 'causa' : 'relacao' })
  }
  return { cartoes, ligacoes }
}

export const handlers: Handlers = {
  /** 'enredo.board'(dir) → EnredoBoard (vazio se ainda não existe). */
  'enredo.board': async (ctx, dir): Promise<EnredoBoard> => {
    const d = await bookDir(ctx, dir)
    return sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
  },

  /** 'enredo.salvar'(dir, board) → EnredoBoard saneado e gravado. */
  'enredo.salvar': async (ctx, dir, board): Promise<EnredoBoard> => {
    const d = await bookDir(ctx, dir)
    if (!board || typeof board !== 'object') throw new Error('Quadro inválido')
    const limpo = sanearBoard(board)
    await putDoc(d, COLECAO, DOC, limpo)
    return limpo
  },

  /** 'enredo.doCapitulo'(dir, chapterFile) → Cartao[] do capítulo em ordem de roteiro (útil para IA/Manuscrito). */
  'enredo.doCapitulo': async (ctx, dir, file): Promise<Cartao[]> => {
    const d = await bookDir(ctx, dir)
    const f = texto(file, 200)
    const { cartoes } = sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
    return cartoes
      .filter((c) => c.capitulo === f)
      .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.criadoEm.localeCompare(b.criadoEm))
  }
}
