import { useEffect, useRef, type ReactElement } from 'react'
import { Ic } from './Previas'
import { useAsset } from './Miniatura'
import { NOME_PROVEDOR, type EstiloArte, type GeracaoMeta } from './api'

export interface VisualizadorProps {
  dir: string
  rotulo: string
  meta: GeracaoMeta
  estilos: EstiloArte[]
  ocupada: boolean
  podeGerar: boolean
  onFechar(): void
  onRegenerar(): void
  /** ação de ir para onde a arte é usada (Diagramação/Universo) */
  destino?: { rotulo: string; ir(): void }
}

/** Arte em tamanho grande, com os metadados que tornam a geração reproduzível. */
export function Visualizador(p: VisualizadorProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const url = useAsset(p.dir, p.meta.asset, p.meta.criadoEm)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  const estilo = p.estilos.find((e) => e.id === p.meta.estilo)?.nome ?? p.meta.estilo
  const data = new Date(p.meta.criadoEm)
  return (
    <dialog ref={ref} className="arte-dialog arte-vis" aria-label={`Arte: ${p.rotulo}`} onClose={p.onFechar}>
      <div className="arte-vis-img">{url ? <img src={url} alt={`Arte gerada: ${p.rotulo}`} /> : <span className="arte-shimmer" />}</div>
      <div className="arte-vis-lado">
        <header>
          <h2 className="disp">{p.rotulo}</h2>
          <button type="button" className="arte-ib" onClick={() => ref.current?.close()} aria-label="Fechar">
            <Ic nome="fechar" />
          </button>
        </header>
        <dl className="arte-dl">
          <dt>Estilo</dt>
          <dd>{estilo}</dd>
          <dt>Semente</dt>
          <dd>{p.meta.semente >= 0 ? `${p.meta.semente}${p.meta.variacao ? ` (variação ${p.meta.variacao})` : ''}` : 'não se aplica neste provedor'}</dd>
          <dt>Gerador</dt>
          <dd>
            {NOME_PROVEDOR[p.meta.provedor as keyof typeof NOME_PROVEDOR] ?? p.meta.provedor} · {p.meta.modelo}
          </dd>
          <dt>Tamanho</dt>
          <dd>
            {p.meta.largura}×{p.meta.altura} px · {Math.round(p.meta.duracaoMs / 1000)} s
          </dd>
          <dt>Pós-processo</dt>
          <dd>{p.meta.posProcesso}</dd>
          <dt>Data</dt>
          <dd>{Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR')}</dd>
        </dl>
        <div className="arte-vis-prompt">
          <span className="arte-eb">Prompt usado</span>
          <p>{p.meta.prompt}</p>
          {p.meta.negativo && (
            <>
              <span className="arte-eb">Negativo</span>
              <p className="muted">{p.meta.negativo}</p>
            </>
          )}
        </div>
        <footer>
          {p.destino && (
            <button type="button" className="btn sm" onClick={p.destino.ir}>
              {p.destino.rotulo}
            </button>
          )}
          <button type="button" className="btn sm pri" onClick={p.onRegenerar} disabled={p.ocupada || !p.podeGerar}>
            <Ic nome="refazer" tam={14} /> {p.ocupada ? 'Gerando…' : 'Nova variação'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
