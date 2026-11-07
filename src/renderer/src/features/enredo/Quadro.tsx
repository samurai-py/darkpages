import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type AriaLabelConfig,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnBeforeDelete
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CartaoTipo, EnredoBoard, Ficha } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { Mini } from '../universo/icons'
import { CARTAO_ROTULO, CARTAO_TIPOS, rotuloCapitulo } from './board'
import { CartaoNode, type CartaoNodeT } from './CartaoNode'

export type Selecao = { tipo: 'cartao' | 'ligacao' | 'multi'; id: string } | null

export interface QuadroProps {
  board: EnredoBoard
  fichas: Map<string, Ficha>
  retratos: Record<string, string | null>
  chapters: ChapterInfo[]
  sel: Selecao
  onSel: (s: Selecao) => void
  onMover: (pos: Array<{ id: string; x: number; y: number }>) => void
  onConectar: (de: string, para: string) => void
  onRemoverLigacoes: (ids: string[]) => void
  onCriar: (tipo: CartaoTipo, x: number, y: number) => void
}

const nodeTypes: NodeTypes = { cartao: CartaoNode }

const COR_TIPO: Record<CartaoTipo, string> = {
  cena: 'var(--acc2)',
  virada: 'var(--acc)',
  personagem: 'var(--text)',
  ideia: 'var(--muted)',
  local: 'var(--line)',
  fato: 'var(--acc)'
}

type Filtro = CartaoTipo | 'todos'

const ROTULOS_ARIA: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default': 'Cartão. Enter ou espaço seleciona; com ele selecionado, as setas movem.',
  'node.a11yDescription.keyboardDisabled': 'Cartão.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Cartão movido para ${direction}: x ${x}, y ${y}`,
  'edge.a11yDescription.default': 'Ligação. Enter seleciona; Delete apaga.',
  'controls.ariaLabel': 'Controles do quadro',
  'controls.zoomIn.ariaLabel': 'Aproximar',
  'controls.zoomOut.ariaLabel': 'Afastar',
  'controls.fitView.ariaLabel': 'Enquadrar tudo',
  'controls.interactive.ariaLabel': 'Travar/destravar',
  'minimap.ariaLabel': 'Minimapa do quadro',
  'handle.ariaLabel': 'Ponto de ligação'
}

function QuadroInterno(props: QuadroProps): ReactElement {
  const { board, fichas, retratos, chapters, sel, onSel } = props
  const rf = useReactFlow()
  const caixa = useRef<HTMLDivElement>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [nodes, setNodes] = useState<CartaoNodeT[]>([])

  // nós derivados do quadro, preservando medidas, seleção e arraste do React Flow
  useEffect(() => {
    setNodes((prev) => {
      const antes = new Map(prev.map((n) => [n.id, n]))
      return board.cartoes.map((c): CartaoNodeT => {
        const old = antes.get(c.id)
        const ligadas = c.fichas.map((id) => fichas.get(id)).filter((f): f is Ficha => !!f)
        return {
          ...(old ?? {}),
          id: c.id,
          type: 'cartao',
          position: old?.dragging ? old.position : { x: c.x, y: c.y },
          selected: old ? old.selected : sel?.tipo === 'cartao' && sel.id === c.id,
          hidden: filtro !== 'todos' && c.tipo !== filtro,
          ariaLabel: `${CARTAO_ROTULO[c.tipo].um}: ${c.titulo || ligadas[0]?.nome || 'sem título'}`,
          data: {
            cartao: c,
            cap: rotuloCapitulo(chapters, c.capitulo),
            fichas: ligadas,
            retrato: ligadas[0] ? retratos[ligadas[0].id] : null
          }
        }
      })
    })
  }, [board.cartoes, fichas, retratos, chapters, filtro, sel])

  // seleção vinda de fora (roteiro, mural, painel fechado)
  useEffect(() => {
    if (sel?.tipo === 'multi') return
    setNodes((nds) => {
      const alvo = sel?.tipo === 'cartao' ? sel.id : null
      if (alvo && nds.find((n) => n.id === alvo)?.selected) return nds
      return nds.map((n) => (n.selected === (n.id === alvo) ? n : { ...n, selected: n.id === alvo }))
    })
  }, [sel])

  const edges = useMemo(
    (): Edge[] =>
      board.ligacoes.map((l) => {
        const causa = l.tipo === 'causa'
        const escondida =
          filtro !== 'todos' &&
          [l.de, l.para].some((id) => board.cartoes.find((c) => c.id === id)?.tipo !== filtro)
        return {
          id: l.id,
          source: l.de,
          target: l.para,
          label: l.rotulo || undefined,
          animated: causa,
          hidden: escondida,
          selected: sel?.tipo === 'ligacao' && sel.id === l.id,
          className: causa ? 'en-e-causa' : 'en-e-rel',
          markerEnd: causa ? 'en-seta' : undefined,
          ariaLabel: `${causa ? 'Causa' : 'Relação'}${l.rotulo ? `: ${l.rotulo}` : ''}`,
          labelStyle: { fill: causa ? 'var(--acc2)' : 'var(--text)', fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: 'var(--bg)', stroke: 'var(--line)' },
          labelBgPadding: [9, 5] as [number, number],
          labelBgBorderRadius: 999,
          interactionWidth: 18
        }
      }),
    [board.ligacoes, board.cartoes, filtro, sel]
  )

  const onNodesChange = useCallback((changes: NodeChange<CartaoNodeT>[]) => {
    // remoção de nós pelo teclado é bloqueada em onBeforeDelete (só pelo painel, com confirmação)
    setNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), nds))
  }, [])

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const fora = changes.filter((c) => c.type === 'remove').map((c) => c.id)
      if (fora.length) props.onRemoverLigacoes(fora)
    },
    [props.onRemoverLigacoes]
  )

  const onBeforeDelete: OnBeforeDelete<CartaoNodeT, Edge> = useCallback(
    async ({ edges: es }) => ({ nodes: [], edges: es }),
    []
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) props.onConectar(c.source, c.target)
    },
    [props.onConectar]
  )

  const criar = (tipo: CartaoTipo): void => {
    const r = caixa.current?.getBoundingClientRect()
    const centro = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 400, y: 300 }
    const p = rf.screenToFlowPosition(centro)
    const desvio = (board.cartoes.length % 6) * 18
    props.onCriar(tipo, p.x - 115 + desvio, p.y - 50 + desvio)
    if (filtro !== 'todos' && filtro !== tipo) setFiltro('todos')
  }

  const filtros: Filtro[] = ['todos', ...CARTAO_TIPOS]

  return (
    <div className="en-quadro" ref={caixa}>
      <svg width="0" height="0" className="en-defs" aria-hidden="true">
        <defs>
          <marker id="en-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5 0 10z" className="en-seta" />
          </marker>
        </defs>
      </svg>

      <div className="en-filtros" role="toolbar" aria-label="Mostrar no quadro">
        {filtros.map((f) => (
          <button
            key={f}
            type="button"
            className="en-chip"
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
          >
            {f === 'todos' ? 'Tudo' : CARTAO_ROTULO[f].varios}
          </button>
        ))}
      </div>

      <div className="en-tools" role="toolbar" aria-label="Novo cartão" aria-orientation="vertical">
        {CARTAO_TIPOS.map((t) => (
          <button key={t} type="button" className="en-tool" onClick={() => criar(t)} aria-label={`Criar cartão: ${CARTAO_ROTULO[t].um}`} title={CARTAO_ROTULO[t].novo}>
            <Mini name={t} size={20} />
          </button>
        ))}
      </div>

      <ReactFlow<CartaoNodeT, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onBeforeDelete={onBeforeDelete}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        onNodeDragStop={(_e, _n, moved) => props.onMover(moved.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })))}
        onNodeClick={(_e, n) => onSel({ tipo: 'cartao', id: n.id })}
        onEdgeClick={(_e, e) => onSel({ tipo: 'ligacao', id: e.id })}
        onPaneClick={() => onSel(null)}
        onSelectionChange={({ nodes: ns }) => {
          if (ns.length > 1) onSel({ tipo: 'multi', id: '' })
        }}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        ariaLabelConfig={ROTULOS_ARIA}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Minimapa do quadro"
          nodeColor={(n) => COR_TIPO[(n.data as CartaoNodeT['data']).cartao.tipo]}
          nodeBorderRadius={6}
          position="bottom-left"
        />
        <Controls position="bottom-right" showInteractive={false} aria-label="Zoom" />
      </ReactFlow>

      {board.cartoes.length === 0 && (
        <div className="en-vazio">
          <span className="disp">Quadro vazio</span>
          Crie cenas, viradas e personagens na barra à esquerda. Puxe uma linha da borda de um cartão até outro para ligar.
        </div>
      )}
    </div>
  )
}

export function Quadro(props: QuadroProps): ReactElement {
  return (
    <ReactFlowProvider>
      <QuadroInterno {...props} />
    </ReactFlowProvider>
  )
}
