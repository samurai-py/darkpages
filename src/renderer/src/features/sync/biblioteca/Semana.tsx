import type { ReactElement } from 'react'
import { hojeLocal } from './util'

export interface DiaBarra {
  dia: string
  rotulo: string
  delta: number
}

/** Palavras escritas por dia = total do dia − último total registrado antes dele. */
export function semana(dias: Record<string, number>, hoje = new Date()): { barras: DiaBarra[]; total: number; sequencia: number } {
  const keys = Object.keys(dias).sort()
  const deltaDe = (d: string): number => {
    const v = dias[d]
    if (v === undefined) return 0
    const prev = keys.filter((k) => k < d).at(-1)
    return prev === undefined ? 0 : v - (dias[prev] ?? 0)
  }
  const barras: DiaBarra[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje)
    d.setDate(d.getDate() - i)
    const iso = hojeLocal(d)
    barras.push({
      dia: iso,
      rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      delta: deltaDe(iso)
    })
  }
  const total = barras.reduce((s, b) => s + Math.max(0, b.delta), 0)
  // sequência: dias seguidos com palavras novas, terminando hoje (ou ontem, se hoje ainda está em branco)
  let sequencia = 0
  const cursor = new Date(hoje)
  if (deltaDe(hojeLocal(cursor)) <= 0) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 400; i++) {
    if (deltaDe(hojeLocal(cursor)) > 0) sequencia++
    else break
    cursor.setDate(cursor.getDate() - 1)
  }
  return { barras, total, sequencia }
}

const fmt = (n: number): string => n.toLocaleString('pt-BR')

export function Semana({ dias }: { dias: Record<string, number> | null }): ReactElement {
  const { barras, total, sequencia } = semana(dias ?? {})
  const max = Math.max(1, ...barras.map((b) => b.delta))
  const hoje = hojeLocal(new Date())
  const resumo = barras.map((b) => `${b.rotulo}: ${fmt(b.delta)}`).join(', ')
  return (
    <div className="panel bib-card">
      <span className="bib-eb">Esta semana</span>
      <div className="bib-week" role="img" aria-label={`Palavras por dia nesta semana. ${resumo}`}>
        {barras.map((b) => (
          <span key={b.dia} className="bib-day" title={`${b.rotulo}: ${b.delta >= 0 ? '+' : ''}${fmt(b.delta)} palavras`}>
            <span className="bib-val">{b.delta > 0 ? fmt(b.delta) : ''}</span>
            <span
              className={`bib-bar${b.dia === hoje ? ' hoje' : ''}${b.delta <= 0 ? ' zero' : ''}`}
              style={{ height: `${b.delta > 0 ? Math.max(5, (b.delta / max) * 72) : 3}%` }}
            />
            <span className="bib-dl">{b.rotulo}</span>
          </span>
        ))}
      </div>
      <span className="bib-foot">
        <b>{fmt(total)}</b> palavras novas
        {sequencia > 0 && <> · {sequencia} {sequencia === 1 ? 'dia' : 'dias seguidos'}</>}
      </span>
    </div>
  )
}
