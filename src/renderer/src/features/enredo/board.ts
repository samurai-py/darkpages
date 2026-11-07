import type { Cartao, CartaoTipo, EnredoBoard, Ligacao } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'

export const CARTAO_TIPOS: CartaoTipo[] = ['cena', 'virada', 'personagem', 'ideia', 'local', 'fato']

export const CARTAO_ROTULO: Record<CartaoTipo, { um: string; varios: string; novo: string }> = {
  cena: { um: 'Cena', varios: 'Cenas', novo: 'Nova cena' },
  virada: { um: 'Virada', varios: 'Viradas', novo: 'Nova virada' },
  personagem: { um: 'Personagem', varios: 'Personagens', novo: 'Personagem' },
  ideia: { um: 'Ideia', varios: 'Ideias', novo: 'Nova ideia' },
  local: { um: 'Local', varios: 'Locais', novo: 'Novo local' },
  fato: { um: 'Fato', varios: 'Fatos', novo: 'Novo fato' }
}

export const LIGACAO_ROTULO: Record<Ligacao['tipo'], string> = {
  relacao: 'Relação (linha contínua)',
  causa: 'Causa (tracejada, com seta)'
}

export const BOARD_VAZIO: EnredoBoard = { cartoes: [], ligacoes: [] }

export function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function novoCartao(tipo: CartaoTipo, x: number, y: number, extra: Partial<Cartao> = {}): Cartao {
  return {
    id: novoId('cartao'),
    tipo,
    titulo: tipo === 'personagem' ? '' : CARTAO_ROTULO[tipo].novo,
    texto: '',
    fichas: [],
    x: Math.round(x),
    y: Math.round(y),
    origem: 'autor',
    estado: 'canonico',
    criadoEm: new Date().toISOString(),
    ...extra
  }
}

/** "cap. 3", "Prólogo", "Epílogo" a partir da lista de capítulos do projeto. */
export function rotuloCapitulo(chapters: ChapterInfo[], file: string | undefined): string {
  if (!file) return ''
  let n = 0
  for (const c of chapters) {
    if (c.kind === 'capitulo') n++
    if (c.file === file) {
      if (c.kind === 'prologo') return 'Prólogo'
      if (c.kind === 'epilogo') return 'Epílogo'
      if (c.kind === 'parte') return 'Parte'
      return `cap. ${n}`
    }
  }
  return 'capítulo removido'
}

/** Rótulo do capítulo pelo id estável ("cap. 3 — Título"); '' sem id. */
export function rotuloPorId(chapters: ChapterInfo[], id: string | undefined, comTitulo = true): string {
  if (!id) return ''
  const ch = chapters.find((c) => c.id === id)
  if (!ch) return 'capítulo removido'
  const r = rotuloCapitulo(chapters, ch.file)
  return comTitulo ? `${r} — ${ch.title}` : r
}

function porOrdem(a: Cartao, b: Cartao): number {
  return (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.criadoEm.localeCompare(b.criadoEm)
}

/** Cartões de um capítulo ('' = sem capítulo) na ordem do roteiro. */
export function doCapitulo(cartoes: Cartao[], capitulo: string, tipos?: CartaoTipo[]): Cartao[] {
  return cartoes
    .filter((c) => (c.capitulo ?? '') === capitulo && (!tipos || tipos.includes(c.tipo)))
    .sort(porOrdem)
}

/**
 * Move um cartão para `capitulo` ('' = sem capítulo), antes de `antesDe`
 * (ou no fim). Renumera a ordem dos capítulos de origem e destino.
 */
export function mover(cartoes: Cartao[], id: string, capitulo: string, antesDe: string | null): Cartao[] {
  const alvo = cartoes.find((c) => c.id === id)
  if (!alvo || antesDe === id) return cartoes
  const origem = alvo.capitulo ?? ''
  const destino = doCapitulo(
    cartoes.filter((c) => c.id !== id),
    capitulo
  )
  const idx = antesDe ? destino.findIndex((c) => c.id === antesDe) : -1
  const movido: Cartao = { ...alvo }
  if (capitulo) movido.capitulo = capitulo
  else delete movido.capitulo
  destino.splice(idx < 0 ? destino.length : idx, 0, movido)
  const novaOrdem = new Map<string, Cartao>()
  destino.forEach((c, i) => novaOrdem.set(c.id, { ...c, ordem: i }))
  if (origem !== capitulo) {
    doCapitulo(
      cartoes.filter((c) => c.id !== id),
      origem
    ).forEach((c, i) => novaOrdem.set(c.id, { ...c, ordem: i }))
  }
  return cartoes.map((c) => novaOrdem.get(c.id) ?? c)
}

/** Próxima posição de ordem num capítulo. */
export function proximaOrdem(cartoes: Cartao[], capitulo: string): number {
  const l = doCapitulo(cartoes, capitulo)
  return l.length ? Math.max(...l.map((c, i) => c.ordem ?? i)) + 1 : 0
}

/**
 * Sobe/desce um cartão entre os do mesmo filtro de tipos (o roteiro mostra só
 * cenas): devolve o `antesDe` a usar em mover(), ou undefined se já está na ponta.
 */
export function vizinho(cartoes: Cartao[], id: string, dir: -1 | 1, tipos?: CartaoTipo[]): string | null | undefined {
  const c = cartoes.find((x) => x.id === id)
  if (!c) return undefined
  const cap = c.capitulo ?? ''
  const visiveis = doCapitulo(cartoes, cap, tipos)
  const i = visiveis.findIndex((x) => x.id === id)
  const outro = visiveis[i + dir]
  if (!outro) return undefined
  if (dir === -1) return outro.id
  const todos = doCapitulo(
    cartoes.filter((x) => x.id !== id),
    cap
  )
  const j = todos.findIndex((x) => x.id === outro.id)
  return todos[j + 1]?.id ?? null
}

/** Remove cartões e as ligações que tocam neles. */
export function removerCartoes(board: EnredoBoard, ids: string[]): EnredoBoard {
  const fora = new Set(ids)
  return {
    cartoes: board.cartoes.filter((c) => !fora.has(c.id)),
    ligacoes: board.ligacoes.filter((l) => !fora.has(l.de) && !fora.has(l.para))
  }
}
