import type { ReactElement } from 'react'
import type { Cartao, CartaoEstado } from '../../../../shared/models'
import { Mini } from '../universo/icons'

/**
 * Selo de origem/estado do cartão. Cartão canônico do autor não leva selo
 * (é o normal); os outros mostram de onde vieram e quanto valem.
 */

export const ESTADO_ROTULO: Record<CartaoEstado, string> = {
  canonico: 'Canônico',
  provisorio: 'Provisório',
  descartado: 'Descartado'
}

/** Filtro de estado das visões do Enredo. "vivos" = canônicos + provisórios (padrão). */
export type FiltroEstado = 'vivos' | 'provisorios' | 'descartados' | 'todos'

export const FILTROS_ESTADO: Array<{ id: FiltroEstado; nome: string }> = [
  { id: 'vivos', nome: 'Em uso' },
  { id: 'provisorios', nome: 'Provisórios' },
  { id: 'descartados', nome: 'Descartados' },
  { id: 'todos', nome: 'Todos' }
]

export function passaFiltro(c: Cartao, f: FiltroEstado): boolean {
  if (f === 'todos') return true
  if (f === 'descartados') return c.estado === 'descartado'
  if (f === 'provisorios') return c.estado === 'provisorio'
  return c.estado !== 'descartado'
}

export function temSelo(c: Cartao): boolean {
  return c.origem === 'ia' || c.estado !== 'canonico'
}

export function textoSelo(c: Cartao): string {
  const origem = c.origem === 'ia' ? 'IA' : 'Autor'
  return c.estado === 'canonico' ? `${origem} · ${ESTADO_ROTULO.canonico}` : `${origem} · ${ESTADO_ROTULO[c.estado]}`
}

export function Selo({ c, compacto = false }: { c: Cartao; compacto?: boolean }): ReactElement | null {
  if (!temSelo(c)) return null
  const icone = c.estado === 'descartado' ? 'descartar' : c.estado === 'provisorio' ? 'provisorio' : 'canonico'
  return (
    <span className={`en-selo s-${c.estado}${c.origem === 'ia' ? ' o-ia' : ''}`} title={textoSelo(c)}>
      <Mini name={icone} size={12} />
      {!compacto && textoSelo(c)}
      {compacto && <span className="en-sr">{textoSelo(c)}</span>}
    </span>
  )
}
