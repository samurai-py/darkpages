import { useState, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { folio, isWeb } from '../api'
import { spineWidthMm, type ExportResult, type LayoutSettings, type Project } from '../../../shared/types'

type Props = ScreenProps

const TRIMS: { label: string; w: number; h: number }[] = [
  { label: '16 × 23 cm', w: 160, h: 230 },
  { label: '14 × 21 cm', w: 140, h: 210 },
  { label: '15,5 × 23 cm', w: 155, h: 230 },
  { label: 'A5 · 14,8 × 21 cm', w: 148, h: 210 },
  { label: 'Bolso · 11 × 18 cm', w: 110, h: 180 },
  { label: 'KDP 6 × 9 pol', w: 152.4, h: 228.6 }
]

const PAPERS: { name: string; caliperMm: number }[] = [
  { name: 'Pólen 80 g', caliperMm: 0.1 },
  { name: 'Pólen 90 g', caliperMm: 0.115 },
  { name: 'Offset 75 g', caliperMm: 0.09 },
  { name: 'Offset 90 g', caliperMm: 0.11 }
]

function num(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function Diagramacao({ project, onProject }: Props): ReactElement {
  const [layout, setLayout] = useState<LayoutSettings>(project.meta.layout)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<LayoutSettings>): void => setLayout((l) => ({ ...l, ...patch }))
  const trimKey = TRIMS.findIndex((t) => t.w === layout.trim.widthMm && t.h === layout.trim.heightMm)
  const paperKey = PAPERS.findIndex((p) => p.name === layout.paper.name)

  const exportPdf = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onProject(await folio.saveLayout(project.dir, layout))
      setResult(await folio.exportPrintPdf(project.dir))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const words = project.chapters.reduce((s, c) => s + c.words, 0)

  return (
    <div className="screen diag">
      <aside className="form" aria-label="Formato e tipografia">
        <h1 className="disp" style={{ margin: 0, fontSize: 30 }}>Diagramação</h1>

        <div className="grid2">
          <label className="field">
            Formato
            <select
              className="select"
              value={trimKey}
              onChange={(e) => {
                const t = TRIMS[Number(e.target.value)]
                if (t) set({ trim: { widthMm: t.w, heightMm: t.h } })
              }}
            >
              {trimKey === -1 && <option value={-1}>Personalizado</option>}
              {TRIMS.map((t, i) => (
                <option key={t.label} value={i}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Papel
            <select
              className="select"
              value={paperKey}
              onChange={(e) => {
                const p = PAPERS[Number(e.target.value)]
                if (p) set({ paper: p })
              }}
            >
              {paperKey === -1 && <option value={-1}>{layout.paper.name}</option>}
              {PAPERS.map((p, i) => (
                <option key={p.name} value={i}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid2">
          <label className="field">
            Corpo do texto (pt)
            <input className="input" inputMode="decimal" defaultValue={String(layout.bodyPt).replace('.', ',')} onBlur={(e) => set({ bodyPt: num(e.target.value, layout.bodyPt) })} />
          </label>
          <label className="field">
            Entrelinha
            <input className="input" inputMode="decimal" defaultValue={String(layout.lineHeight).replace('.', ',')} onBlur={(e) => set({ lineHeight: num(e.target.value, layout.lineHeight) })} />
          </label>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="label" style={{ marginBottom: 8 }}>Margens (mm)</legend>
          <div className="grid4">
            {(
              [
                ['topMm', 'sup.'],
                ['bottomMm', 'inf.'],
                ['insideMm', 'int.'],
                ['outsideMm', 'ext.']
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                {label}
                <input
                  className="input"
                  inputMode="decimal"
                  defaultValue={String(layout.margins[k])}
                  onBlur={(e) => set({ margins: { ...layout.margins, [k]: num(e.target.value, layout.margins[k]) } })}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid2">
          <label className="field">
            Sangria (mm)
            <input className="input" inputMode="decimal" defaultValue={String(layout.bleedMm)} onBlur={(e) => set({ bleedMm: num(e.target.value, layout.bleedMm) })} />
          </label>
          <label className="field">
            Fonte do miolo
            <input className="input" defaultValue={layout.font} onBlur={(e) => set({ font: e.target.value.trim() || layout.font })} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={layout.cropMarks} onChange={(e) => set({ cropMarks: e.target.checked })} />
          Marcas de corte
        </label>

        <button type="button" className="btn pri" disabled={busy} onClick={() => void exportPdf()}>
          {busy ? 'Gerando PDF…' : 'Gerar PDF da gráfica'}
        </button>
        {error && <p className="err">{error}</p>}
      </aside>

      <section className="out" aria-live="polite">
        <div className="sheet">
          <span className="pill">Formato <b>{layout.trim.widthMm} × {layout.trim.heightMm} mm</b></span>
          <span className="pill">Sangria <b>{layout.bleedMm} mm</b></span>
          <span className="pill">Livro <b>{words.toLocaleString('pt-BR')} palavras</b></span>
          {result && <span className="pill">Páginas <b>{result.pages}</b></span>}
          {result && <span className="pill">Lombada <b>{spineWidthMm(result.pages, layout.paper.caliperMm).toLocaleString('pt-BR')} mm</b></span>}
        </div>
        {result ? (
          <div className="panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <h2 className="disp" style={{ margin: 0, fontSize: 26 }}>PDF pronto</h2>
            <p style={{ margin: 0 }}>
              {result.pages} páginas. Lombada de {result.spineMm.toLocaleString('pt-BR')} mm em {layout.paper.name} (
              {Math.ceil(result.pages / 2)} folhas × {layout.paper.caliperMm.toLocaleString('pt-BR')} mm).
            </p>
            <p className="muted" style={{ margin: 0, wordBreak: 'break-all' }}>{result.pdfPath}</p>
            <div>
              <button type="button" className="btn" onClick={() => void folio.revealFile(result.pdfPath)}>
                {isWeb ? 'Abrir o PDF' : 'Mostrar na pasta'}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty">
            <span className="disp">O miolo sai daqui</span>
            Ajuste formato, papel e margens à esquerda e gere o PDF com sangria e marcas de corte.
          </div>
        )}
      </section>
    </div>
  )
}
