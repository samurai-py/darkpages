import type { ReactElement } from 'react'
import { emGlifos, glifoD, largura, tracoD } from './glifos'
import type { Glifo } from './model'

/** Um glifo desenhado na grade 0..24. */
export function GlifoSvg({ glifo, size = 40, animar = false, atraso = 0 }: { glifo: Glifo | undefined; size?: number; animar?: boolean; atraso?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {glifo && !animar && (
        <path d={glifoD(glifo)} fill="none" stroke="currentColor" strokeWidth={glifo.espessura} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {glifo &&
        animar &&
        glifo.tracos.map((t, i) => (
          <path
            key={i}
            className="idi-draw"
            pathLength={1}
            style={{ animationDelay: `${atraso + i * 120}ms` }}
            d={tracoD(t)}
            fill="none"
            stroke="currentColor"
            strokeWidth={glifo.espessura}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
    </svg>
  )
}

/** Texto romanizado escrito no alfabeto da língua, com animação de traço. */
export function TextoEmGlifos({ texto, glifos, altura = 30, animar = true }: { texto: string; glifos: Record<string, Glifo>; altura?: number; animar?: boolean }): ReactElement {
  const pecas = emGlifos(texto, glifos)
  let n = 0
  // agrupa por palavra para quebrar linha só entre palavras
  const palavras: ReactElement[][] = [[]]
  pecas.forEach((p, i) => {
    if (p.tipo === 'espaco') {
      palavras.push([])
      return
    }
    const atual = palavras[palavras.length - 1] as ReactElement[]
    if (p.tipo === 'glifo') {
      const g = glifos[p.chave] as Glifo
      const { min, max } = largura(g)
      const pad = g.espessura
      const w = max - min + pad * 2
      const atraso = n++ * 90
      atual.push(
        <svg key={i} width={(altura * w) / 24} height={altura} viewBox={`${min - pad} 0 ${w} 24`} aria-hidden="true" focusable="false">
          {g.tracos.map((t, k) => (
            <path
              key={k}
              className={animar ? 'idi-draw' : undefined}
              pathLength={1}
              style={animar ? { animationDelay: `${atraso + k * 60}ms` } : undefined}
              d={tracoD(t)}
              fill="none"
              stroke="currentColor"
              strokeWidth={g.espessura}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )
    } else if (p.tipo === 'falta') {
      atual.push(
        <span key={i} className="idi-falta" style={{ height: altura, minWidth: altura * 0.6 }} title={`Sem glifo para “${p.texto}”`}>
          {p.texto}
        </span>
      )
    } else {
      atual.push(
        <span key={i} className="idi-sinal" style={{ fontSize: altura * 0.8 }}>
          {p.texto}
        </span>
      )
    }
  })
  return (
    <div className="idi-glifotexto" role="img" aria-label={`Texto no alfabeto: ${texto}`}>
      {palavras
        .filter((p) => p.length)
        .map((p, i) => (
          <span key={i} className="idi-palavra">
            {p}
          </span>
        ))}
    </div>
  )
}
