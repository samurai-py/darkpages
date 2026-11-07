import type { CSSProperties, ReactElement } from 'react'
import type { PageGeometry, PreviewResult } from './model'

interface RulerProps {
  /** comprimento útil em mm (do corte ao corte) */
  lengthMm: number
  /** sangria, desenhada antes do zero e depois do fim */
  bleedMm: number
  k: number
  vertical?: boolean
}

/** Régua em mm, com zero na linha de corte. */
export function Ruler({ lengthMm, bleedMm, k, vertical = false }: RulerProps): ReactElement {
  const total = (lengthMm + 2 * bleedMm) * k
  const step = k >= 3.2 ? 1 : k >= 1.6 ? 2 : 5
  const ticks: ReactElement[] = []
  for (let mm = 0; mm <= lengthMm; mm += step) {
    const pos = (mm + bleedMm) * k
    const major = mm % 10 === 0
    const mid = mm % 5 === 0
    const len = major ? 12 : mid ? 8 : 5
    ticks.push(
      vertical ? (
        <line key={mm} x1={30 - len} x2={30} y1={pos} y2={pos} />
      ) : (
        <line key={mm} x1={pos} x2={pos} y1={26 - len} y2={26} />
      )
    )
    if (major && mm > 0 && (k >= 1.2 || mm % 20 === 0)) {
      ticks.push(
        vertical ? (
          <text key={`t${mm}`} x={14} y={pos + 3} fontSize="9" textAnchor="end" fill="currentColor" stroke="none">{mm / 10}</text>
        ) : (
          <text key={`t${mm}`} x={pos + 2} y={11} fontSize="9" fill="currentColor" stroke="none">{mm / 10}</text>
        )
      )
    }
  }
  return vertical ? (
    <svg className="dg-ruler-v" width={32} height={total} aria-hidden="true" stroke="currentColor" strokeWidth={0.8}>
      <line x1={30} x2={30} y1={0} y2={total} />
      {ticks}
    </svg>
  ) : (
    <svg className="dg-ruler-h" width={total} height={28} aria-hidden="true" stroke="currentColor" strokeWidth={0.8}>
      <line x1={0} x2={total} y1={26} y2={26} />
      {ticks}
    </svg>
  )
}

interface PageViewProps {
  side: 'esq' | 'dir'
  numero: number | null
  png: string | null
  g: PageGeometry
  k: number
  guides: boolean
}

function PageView({ side, numero, png, g, k, guides }: PageViewProps): ReactElement {
  const B = g.bleedMm
  const W = g.trimWmm
  const H = g.trimHmm
  const box: CSSProperties = { width: (W + B) * k, height: (H + 2 * B) * k }
  const x0 = side === 'esq' ? g.slugMm - B : g.slugMm
  const y0 = g.slugMm - B
  const trimLeft = side === 'esq' ? B : 0
  const m = g.margins
  const guideLeft = trimLeft + (side === 'esq' ? m.outsideMm : m.insideMm)
  if (numero === null) return <div className="dg-pg dg-blank" style={box} aria-hidden="true" />
  return (
    <div className="dg-pg" style={box} role="img" aria-label={`Página ${numero}`}>
      {png ? (
        <img src={png} alt="" draggable={false} style={{ width: g.pageWmm * k, left: -x0 * k, top: -y0 * k }} />
      ) : (
        <div className="dg-blank" style={{ position: 'absolute', inset: 0 }}>carregando…</div>
      )}
      <span className="dg-trim" style={{ left: trimLeft * k, top: B * k, width: W * k, height: H * k }} />
      {guides && (
        <span
          className="dg-guide"
          style={{ left: guideLeft * k, top: (B + m.topMm) * k, width: (W - m.insideMm - m.outsideMm) * k, height: (H - m.topMm - m.bottomMm) * k }}
        />
      )}
      <span className="dg-pg-num" style={side === 'esq' ? { left: B * k } : { right: B * k }}>{numero}</span>
    </div>
  )
}

interface MesaProps {
  preview: PreviewResult
  esq: number | null
  dir: number | null
  k: number
  guides: boolean
  busy: boolean
}

/** Spread lado a lado: páginas recortadas na sangria, linha de corte, guias de margem, sangria tracejada e marcas de corte. */
export function Mesa({ preview, esq, dir, k, guides, busy }: MesaProps): ReactElement {
  const g = preview.geometria
  const B = g.bleedMm
  const pngOf = (n: number | null): string | null => (n === null ? null : (preview.paginas.find((p) => p.numero === n)?.png ?? null))
  const pages = (esq !== null ? 1 : 0) + (dir !== null ? 1 : 0)
  const spreadW = pages * (g.trimWmm + B) * k
  const spreadH = (g.trimHmm + 2 * B) * k
  const bx = B * k
  const markLen = 18
  const gap = 12
  const marks: CSSProperties[] = []
  for (const y of [bx, spreadH - bx]) {
    marks.push({ left: -gap - markLen, top: y, width: markLen, height: 1 })
    marks.push({ left: spreadW + gap, top: y, width: markLen, height: 1 })
  }
  for (const x of [bx, spreadW - bx]) {
    marks.push({ left: x, top: -gap - markLen, width: 1, height: markLen })
    marks.push({ left: x, top: spreadH + gap, width: 1, height: markLen })
  }
  return (
    <div className="dg-rulers">
      <Ruler lengthMm={pages * g.trimWmm} bleedMm={B} k={k} />
      <Ruler lengthMm={g.trimHmm} bleedMm={B} k={k} vertical />
      <div className="dg-spread" data-busy={busy} style={{ width: spreadW, height: spreadH }}>
        {esq !== null && <PageView side="esq" numero={esq} png={pngOf(esq)} g={g} k={k} guides={guides} />}
        {dir !== null && <PageView side="dir" numero={dir} png={pngOf(dir)} g={g} k={k} guides={guides} />}
        {pages === 2 && <span className="dg-spine" style={{ left: (g.trimWmm + B) * k }} aria-hidden="true" />}
        <span className="dg-bleed" aria-hidden="true" />
        {marks.map((s, i) => (
          <span key={i} className="dg-mark" style={s} aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
