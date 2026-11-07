import { useEffect, useState, type ReactElement } from 'react'
import { folio } from '../../api'
import { MODELOS_SECAO, aplicarModelo, errText, modeloDe, type FullLayout, type ModeloLayout } from './model'

interface Props {
  l: FullLayout
  set: (patch: Partial<FullLayout>) => void
}

function lista(v: unknown): ModeloLayout[] {
  if (!Array.isArray(v)) return []
  return v.filter((m): m is ModeloLayout => Boolean(m) && typeof m === 'object' && typeof (m as ModeloLayout).nome === 'string' && typeof (m as ModeloLayout).layout === 'object')
}

/**
 * Modelos de estilo: guardam formato, tipografia, aberturas, margens, sangria e
 * quais páginas iniciais/finais entram, nas configurações do app (valem para
 * todos os livros). Textos do livro e ajustes por capítulo ficam de fora.
 */
export function ModelosLayout({ l, set }: Props): ReactElement {
  const [modelos, setModelos] = useState<ModeloLayout[]>([])
  const [escolhido, setEscolhido] = useState('')
  const [nome, setNome] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    folio.settings
      .get<{ modelos?: unknown }>(MODELOS_SECAO)
      .then((s) => setModelos(lista(s.modelos)))
      .catch(() => setModelos([]))
  }, [])

  const gravar = async (novos: ModeloLayout[]): Promise<void> => {
    const s = await folio.settings.put<{ modelos?: unknown }>(MODELOS_SECAO, { modelos: novos })
    setModelos(lista(s.modelos))
  }

  const salvar = async (): Promise<void> => {
    const n = nome.trim()
    if (!n) return
    try {
      const m: ModeloLayout = { nome: n, criadoEm: new Date().toISOString(), layout: modeloDe(l) }
      await gravar([...modelos.filter((x) => x.nome !== n), m].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
      setEscolhido(n)
      setNome('')
      setMsg(`Modelo “${n}” salvo. Ele aparece em todos os livros.`)
    } catch (e) {
      setMsg(errText(e))
    }
  }

  const aplicar = (): void => {
    const m = modelos.find((x) => x.nome === escolhido)
    if (!m) return
    const novo = aplicarModelo(l, m.layout)
    set(novo)
    setMsg(`Modelo “${m.nome}” aplicado a este livro.`)
  }

  const excluir = async (): Promise<void> => {
    if (!escolhido) return
    try {
      await gravar(modelos.filter((x) => x.nome !== escolhido))
      setMsg(`Modelo “${escolhido}” excluído.`)
      setEscolhido('')
    } catch (e) {
      setMsg(errText(e))
    }
  }

  return (
    <fieldset className="dg-sec">
      <legend className="dg-eb">Modelos de estilo</legend>
      <label className="field">
        Modelo salvo
        <select className="select" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
          <option value="">{modelos.length ? 'Escolha um modelo…' : 'Nenhum modelo salvo'}</option>
          {modelos.map((m) => (
            <option key={m.nome} value={m.nome}>{m.nome}</option>
          ))}
        </select>
      </label>
      <div className="dg-actions">
        <button type="button" className="btn sm pri" disabled={!escolhido} onClick={aplicar} title="Troca o estilo deste livro pelo do modelo; textos e ajustes por capítulo ficam">
          Aplicar a este livro
        </button>
        <button type="button" className="btn sm" disabled={!escolhido} onClick={() => void excluir()}>
          Excluir
        </button>
      </div>
      <label className="field">
        Salvar o estilo deste livro como
        <input
          className="input"
          value={nome}
          placeholder="Ex.: Romance 14 × 21 clássico"
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void salvar()
          }}
        />
      </label>
      <div className="dg-actions">
        <button type="button" className="btn sm" disabled={!nome.trim()} onClick={() => void salvar()}>
          Salvar modelo
        </button>
      </div>
      {msg && (
        <p className="label" role="status" style={{ margin: 0 }}>
          {msg}
        </p>
      )}
    </fieldset>
  )
}
