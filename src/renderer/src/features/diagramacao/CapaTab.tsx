import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call, isWeb, openExport } from '../../api'
import type { CoverSettings } from '../../../../shared/types'
import { TextField } from './fields'
import { Ico } from './icons'
import { errText, fmt, type CoverResult, type FullLayout } from './model'

interface Props {
  dir: string
  l: FullLayout
  set: (patch: Partial<FullLayout>) => void
  /** muda quando o layout foi salvo (dispara nova prévia) */
  version: number
  zoom: number
}

/** Capa aberta para gráfica: contracapa + lombada + frente, com sangria e marcas. */
export function CapaTab({ dir, l, set, version, zoom }: Props): ReactElement {
  const c = l.cover
  const setC = (patch: Partial<CoverSettings>): void => set({ cover: { ...c, ...patch } })
  const [res, setRes] = useState<CoverResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const seq = useRef(0)

  const gerar = async (): Promise<CoverResult | null> => {
    const my = ++seq.current
    setBusy(true)
    setErr(null)
    try {
      const r = await call<CoverResult>('diagramacao.capa', dir)
      if (my === seq.current) setRes(r)
      return r
    } catch (e) {
      if (my === seq.current) setErr(errText(e))
      return null
    } finally {
      if (my === seq.current) setBusy(false)
    }
  }

  useEffect(() => {
    void gerar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, version])

  const g = res?.geometria
  const k = 2.2 * zoom
  const width = g ? g.pageWmm * k : 0

  return (
    <div className="dg-body">
      <aside className="dg-side" style={{ borderLeft: 0, borderRight: '1px solid var(--line)' }} aria-label="Texto e cores da capa">
        <fieldset className="dg-sec">
          <legend className="dg-eb">Quarta capa</legend>
          <TextField label="Sinopse (texto da contracapa)" multiline rows={9} value={c.sinopse} placeholder="Parágrafos separados por linha em branco" onChange={(v) => setC({ sinopse: v })} />
          <label className="check">
            <input type="checkbox" checked={c.codigoBarras} onChange={(e) => setC({ codigoBarras: e.target.checked })} />
            Código de barras do ISBN
          </label>
          {!l.front.isbn.trim() && <p className="label" style={{ margin: 0 }}>Preencha o ISBN em Miolo › Créditos para gerar o código de barras.</p>}
        </fieldset>
        <fieldset className="dg-sec">
          <legend className="dg-eb">Cores</legend>
          {(
            [
              ['fundo', 'Fundo'],
              ['texto', 'Texto'],
              ['destaque', 'Filetes e detalhes']
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="dg-row">
              <span>{label}</span>
              <span className="dg-color">
                <input type="color" aria-label={`Cor: ${label}`} value={c[key]} onChange={(e) => setC({ [key]: e.target.value })} />
              </span>
            </div>
          ))}
        </fieldset>
        <fieldset className="dg-sec">
          <legend className="dg-eb">Frente</legend>
          <p className="label" style={{ margin: 0, lineHeight: 1.5 }}>
            {res?.imagemFrente
              ? 'Usando a imagem da capa feita na tela Arte (assets/capa-frente.png).'
              : 'Sem imagem de capa: a frente sai tipográfica, com título e autor. Gere uma imagem na tela Arte para usá-la aqui.'}
          </p>
        </fieldset>
      </aside>

      <section className="dg-work" aria-live="polite" aria-busy={busy}>
        <div className="dg-actions" style={{ alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">
            {g
              ? `Folha aberta ${fmt(g.openWmm)} × ${fmt(l.trim.heightMm)} mm + sangria ${fmt(g.bleedMm)} mm · lombada ${fmt(g.spineMm)} mm (${res?.paginas} págs.)`
              : 'Calculando a lombada…'}
          </span>
          <span className="dg-actions">
            <button type="button" className="btn sm" disabled={busy} onClick={() => void gerar()}>
              <Ico name="atualizar" size={16} /> {busy ? 'Atualizando…' : 'Atualizar'}
            </button>
            <button
              type="button"
              className="btn pri sm"
              disabled={busy}
              onClick={async () => {
                const r = await gerar()
                if (r) await openExport(r.pdfPath)
              }}
            >
              <Ico name="capa" size={16} /> {isWeb ? 'Gerar e abrir PDF da capa' : 'Gerar PDF da capa'}
            </button>
          </span>
        </div>
        {err && <p className="err">{err}</p>}
        {res && g && (
          <>
            <div className="dg-cover" style={{ width }}>
              <img src={res.previa} alt={`Prévia da capa aberta: contracapa, lombada de ${fmt(g.spineMm)} mm e frente`} />
            </div>
            <div className="dg-cover-labels" style={{ width }} aria-hidden="true">
              <span style={{ width: (g.slugMm + l.trim.widthMm) * k }}>Contracapa</span>
              <span style={{ width: g.spineMm * k }}>{g.spineMm >= 8 ? 'Lombada' : ''}</span>
              <span style={{ width: (g.slugMm + l.trim.widthMm) * k }}>Capa</span>
            </div>
            {res.avisos.length > 0 && (
              <ul className="dg-list" style={{ maxWidth: width }}>
                {res.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            <p className="dg-path">{res.pdfPath}</p>
          </>
        )}
      </section>
    </div>
  )
}
