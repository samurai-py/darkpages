import { memo, type ReactElement } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { Cartao, Ficha } from '../../../../shared/models'
import { Retrato } from '../universo/Retrato'
import { Mini } from '../universo/icons'
import { CARTAO_ROTULO } from './board'
import { Selo } from './Selo'

export type CartaoData = {
  cartao: Cartao
  /** "cap. 3", "Prólogo"… ou vazio */
  cap: string
  /** fichas ligadas que existem */
  fichas: Ficha[]
  /** retrato da primeira ficha (cartão de personagem) */
  retrato: string | null | undefined
}

export type CartaoNodeT = Node<CartaoData, 'cartao'>

function Alcas(): ReactElement {
  return (
    <>
      <Handle type="source" position={Position.Top} id="t" className="en-h" />
      <Handle type="source" position={Position.Right} id="r" className="en-h" />
      <Handle type="source" position={Position.Bottom} id="b" className="en-h" />
      <Handle type="source" position={Position.Left} id="l" className="en-h" />
    </>
  )
}

function CartaoNodeBase({ data, selected }: NodeProps<CartaoNodeT>): ReactElement {
  const { cartao: c, cap, fichas, retrato } = data
  if (c.tipo === 'personagem') {
    const f = fichas[0]
    const nome = f?.nome || c.titulo || 'Sem ficha'
    const sub = c.titulo && f && c.titulo !== f.nome ? c.titulo : f?.papel
    return (
      <div className={`en-person es-${c.estado}${selected ? ' sel' : ''}`}>
        <Alcas />
        <span className="en-face">
          {f ? <Retrato ficha={f} url={retrato} /> : <Retrato ficha={{ nome, tipo: 'personagem' }} url={null} />}
        </span>
        <span className="disp en-pname">{nome}</span>
        {sub && <span className="en-prole">{sub}</span>}
        <Selo c={c} />
      </div>
    )
  }
  return (
    <div className={`en-card en-${c.tipo} es-${c.estado}${selected ? ' sel' : ''}`}>
      <Alcas />
      <span className="en-eb">
        <Mini name={c.tipo} size={13} />
        {CARTAO_ROTULO[c.tipo].um}
        {cap && ` · ${cap}`}
      </span>
      <Selo c={c} />
      <span className="disp en-title">{c.titulo || 'Sem título'}</span>
      {c.texto && <span className="en-text">{c.texto}</span>}
      {fichas.length > 0 && (
        <span className="en-fichas">
          {fichas.slice(0, 4).map((f) => (
            <span key={f.id} className="en-fchip">
              {f.nome}
            </span>
          ))}
          {fichas.length > 4 && <span className="en-fchip">+{fichas.length - 4}</span>}
        </span>
      )}
    </div>
  )
}

export const CartaoNode = memo(CartaoNodeBase)
