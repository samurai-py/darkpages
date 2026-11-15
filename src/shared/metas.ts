import type { ChapterKind } from './types'

/**
 * Metas de palavras por capítulo com remanejamento.
 *
 * Cada capítulo tem uma meta planejada: a que você definiu para ele ou, sem
 * isso, a meta padrão por capítulo. Quando você marca um capítulo como "pronto",
 * a diferença entre a meta planejada e o que foi escrito (faltou ou passou) é
 * repartida entre os capítulos seguintes que ainda não estão prontos, em
 * proporção à meta planejada deles. A soma das metas do livro se mantém.
 * Capítulos anteriores ao pronto não mudam. Partes não têm meta.
 */

export interface MetaCap {
  /** meta própria deste capítulo (ausente = a padrão) */
  meta?: number
  /** "ficou bom assim": a meta passa a ser o que foi escrito, e o saldo vai para os próximos */
  pronto?: boolean
}

export type MetasCap = Record<string, MetaCap>

export interface MetaEfetiva {
  /** meta antes do remanejamento */
  planejada: number
  /** meta depois do remanejamento (a que vale para a barra) */
  efetiva: number
  pronto: boolean
  /** palavras somadas (ou tiradas) da meta por causa de capítulos anteriores prontos */
  ajuste: number
}

const passo = (n: number): number => Math.round(n / 10) * 10

export function metasEfetivas(
  caps: Array<{ id: string; kind: ChapterKind; words: number }>,
  padrao: number,
  porCap: MetasCap = {}
): Map<string, MetaEfetiva> {
  const itens = caps
    .filter((c) => c.kind !== 'parte')
    .map((c) => ({ c, planejada: Math.max(0, porCap[c.id]?.meta ?? padrao), pronto: !!porCap[c.id]?.pronto, ajuste: 0 }))
  itens.forEach((k, i) => {
    if (!k.pronto || k.planejada <= 0) return
    const delta = k.planejada - k.c.words
    const abertos = itens.slice(i + 1).filter((x) => !x.pronto && x.planejada > 0)
    const soma = abertos.reduce((s, x) => s + x.planejada, 0)
    if (!abertos.length || soma <= 0) return // sem capítulos depois: o saldo não vai a lugar nenhum
    for (const x of abertos) x.ajuste += (delta * x.planejada) / soma
  })
  const out = new Map<string, MetaEfetiva>()
  for (const x of itens) {
    out.set(x.c.id, {
      planejada: x.planejada,
      efetiva: x.pronto ? x.planejada : Math.max(0, passo(x.planejada + x.ajuste)),
      pronto: x.pronto,
      ajuste: passo(x.ajuste)
    })
  }
  return out
}

/** Soma das metas planejadas de todos os capítulos (para comparar com a meta do livro). */
export function somaPlanejada(caps: Array<{ id: string; kind: ChapterKind }>, padrao: number, porCap: MetasCap = {}): number {
  return caps.filter((c) => c.kind !== 'parte').reduce((s, c) => s + Math.max(0, porCap[c.id]?.meta ?? padrao), 0)
}
