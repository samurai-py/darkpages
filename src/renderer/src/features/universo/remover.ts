import { call } from '../../api'
import type { EnredoBoard } from '../../../../shared/models'

/**
 * Tira uma ficha excluída dos cartões do enredo (mesmo dono: Universo/Enredo)
 * e das ligações dos mapas (símbolo ou rótulo ligado à ficha).
 */
export async function desligarDoEnredo(dir: string, fichaId: string): Promise<void> {
  await call('mapas.desligar', dir, { fichas: [fichaId] })
  const board = await call<EnredoBoard>('enredo.board', dir)
  if (!board.cartoes.some((c) => c.fichas.includes(fichaId))) return
  await call('enredo.salvar', dir, {
    ...board,
    cartoes: board.cartoes.map((c) => ({ ...c, fichas: c.fichas.filter((f) => f !== fichaId) }))
  })
}
