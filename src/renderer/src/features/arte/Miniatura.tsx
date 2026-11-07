import { useEffect, useState, type ReactElement } from 'react'
import { folio } from '../../api'
import { Ic } from './Previas'
import type { GeracaoMeta, StatusItem } from './api'

// Cache de imagens (data URL) por livro+arquivo+versão: a versão é a data da geração.
const cache = new Map<string, string | null>()
const pendentes = new Map<string, Promise<string | null>>()

export function useAsset(dir: string, nome: string | null, versao: string | undefined): string | null {
  const k = nome ? `${dir}|${nome}|${versao ?? ''}` : ''
  const [url, setUrl] = useState<string | null>(() => (k ? cache.get(k) ?? null : null))
  useEffect(() => {
    if (!k || !nome) {
      setUrl(null)
      return
    }
    if (cache.has(k)) {
      setUrl(cache.get(k) ?? null)
      return
    }
    let vivo = true
    let p = pendentes.get(k)
    if (!p) {
      p = folio.assets.get(dir, nome).catch(() => null)
      pendentes.set(k, p)
    }
    void p.then((u) => {
      cache.set(k, u)
      pendentes.delete(k)
      if (vivo) setUrl(u)
    })
    return () => {
      vivo = false
    }
  }, [dir, nome, k])
  return url
}

export interface MiniaturaProps {
  dir: string
  rotulo: string
  /** subtítulo curto (ex.: "Cap. 3") */
  sub?: string
  meta?: GeracaoMeta
  status?: StatusItem
  erro?: string
  /** proporção w/h da caixa */
  proporcao: number
  selecionada: boolean
  onSelecionar(): void
  onAbrir(): void
  onRegenerar(): void
  podeGerar: boolean
}

export function Miniatura(p: MiniaturaProps): ReactElement {
  const url = useAsset(p.dir, p.meta?.asset ?? null, p.meta?.criadoEm)
  const ocupada = p.status === 'gerando' || p.status === 'fila'
  let corpo: ReactElement
  let estado: string
  if (p.status === 'gerando') {
    corpo = <span className="arte-shimmer" />
    estado = 'gerando'
  } else if (p.status === 'fila') {
    corpo = <span className="arte-vazio tracejado">na fila</span>
    estado = 'na fila'
  } else if (p.status === 'erro' && !url) {
    corpo = <span className="arte-vazio erro">erro</span>
    estado = 'erro'
  } else if (url) {
    corpo = <img src={url} alt="" draggable={false} />
    estado = p.status === 'erro' ? 'erro na última tentativa' : 'pronta'
  } else {
    corpo = <span className="arte-vazio">sem arte</span>
    estado = 'sem arte'
  }
  return (
    <div className="arte-tile" data-status={p.status ?? (url ? 'pronto' : 'vazio')}>
      <button
        type="button"
        className="arte-thumb"
        style={{ aspectRatio: String(p.proporcao) }}
        aria-pressed={p.selecionada}
        aria-label={`${p.rotulo}: ${estado}. Mostrar contexto`}
        title={p.erro ?? undefined}
        onClick={p.onSelecionar}
      >
        {corpo}
      </button>
      <div className="arte-tile-pe">
        <span className="arte-tile-rot" title={p.rotulo}>
          {p.sub && <b>{p.sub}</b>} {p.rotulo}
        </span>
        <span className="arte-tile-acoes">
          {url && (
            <button type="button" className="arte-ib" onClick={p.onAbrir} aria-label={`Abrir arte de ${p.rotulo}`} title="Abrir">
              <Ic nome="abrir" tam={14} />
            </button>
          )}
          <button
            type="button"
            className="arte-ib"
            onClick={p.onRegenerar}
            disabled={ocupada || !p.podeGerar}
            aria-label={url ? `Regenerar ${p.rotulo} com nova variação` : `Gerar ${p.rotulo}`}
            title={url ? 'Regenerar (nova variação)' : 'Gerar'}
          >
            <Ic nome={url ? 'refazer' : 'faisca'} tam={14} />
          </button>
        </span>
      </div>
    </div>
  )
}
