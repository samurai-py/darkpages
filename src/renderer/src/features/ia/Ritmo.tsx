import type { ReactElement } from 'react'
import type { MetricasRitmo, RitmoComparado } from '../../../../shared/models'
import { Ico } from './icones'

/**
 * Ritmo do capítulo × média do livro (só leitura, não é sugestão). Cada
 * linha: barra do capítulo e um traço vertical na média do livro.
 */

interface Linha {
  nome: string
  k: 'mediaFrase' | 'mediaParagrafo' | 'pctDialogo'
  unidade: string
}

const LINHAS: Linha[] = [
  { nome: 'Frase', k: 'mediaFrase', unidade: 'palavras' },
  { nome: 'Parágrafo', k: 'mediaParagrafo', unidade: 'palavras' },
  { nome: 'Diálogo', k: 'pctDialogo', unidade: '%' }
]

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function escala(l: Linha, a: MetricasRitmo, b: MetricasRitmo): number {
  if (l.k === 'pctDialogo') return 100
  return Math.max(1, a[l.k], b[l.k]) * 1.25
}

export function Ritmo({ r }: { r: RitmoComparado }): ReactElement | null {
  const { capitulo: c, livro: l } = r
  if (!c.palavras) return null
  const comparar = r.capitulosNaMedia > 1
  return (
    <section className="panel rv-ritmo" aria-labelledby="rv-ritmo-t">
      <span className="rv-eb" id="rv-ritmo-t">
        <Ico n="ritmo" size={14} /> Ritmo
      </span>
      <dl className="rv-rlist">
        {LINHAS.map((x) => {
          const max = escala(x, c, l)
          const v = c[x.k]
          const m = l[x.k]
          const desc = `${x.nome}: ${fmt(v)} ${x.unidade}${comparar ? `; média do livro ${fmt(m)} ${x.unidade}` : ''}`
          return (
            <div key={x.k} className="rv-rl">
              <dt>{x.nome}</dt>
              <dd>
                <b>
                  {fmt(v)}
                  <small>{x.unidade === '%' ? '%' : ' pal.'}</small>
                </b>
                <span className="rv-rbar" role="img" aria-label={desc}>
                  <span className="rv-rv" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                  {comparar && <span className="rv-rm" style={{ left: `${Math.min(100, (m / max) * 100)}%` }} title={`Média do livro: ${fmt(m)}`} />}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
      {comparar && (
        <span className="rv-rleg">
          <i aria-hidden="true" /> média do livro ({r.capitulosNaMedia} capítulos)
        </span>
      )}
      {c.iniciosRepetidos.length > 0 && (
        <div className="rv-rinis">
          <span className="rv-rinil">Frases que começam igual</span>
          <span className="rv-rchips">
            {c.iniciosRepetidos.map((i) => (
              <span key={i.inicio} className="rv-rchip">
                {i.inicio}… <b>{i.n}×</b>
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  )
}
