import { useState, type ReactElement } from 'react'
import type { Cartao, EnredoBoard, Ficha } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { Retrato } from '../universo/Retrato'
import { Mini } from '../universo/icons'
import { arrastavel, soltavel } from './arrastar'
import { CARTAO_ROTULO, doCapitulo, rotuloCapitulo } from './board'
import { FioSelo, Selo } from './Selo'

export interface MuralProps {
  board: EnredoBoard
  chapters: ChapterInfo[]
  fichas: Map<string, Ficha>
  retratos: Record<string, string | null>
  selId: string | null
  onSel: (id: string) => void
  onMover: (id: string, capitulo: string, antesDe: string | null) => void
  onCriarCena: (capitulo: string) => void
  onAbrirCapitulo: (file: string) => void
  /** sinopse da cena de cada capítulo (arquivo → texto) */
  sinopses?: Record<string, string>
}

/** E5: mural com uma coluna por capítulo e todos os cartões dele. */
export function Mural(props: MuralProps): ReactElement {
  const { board, chapters, fichas, retratos, selId } = props
  const [sobre, setSobre] = useState<string | null>(null)
  const orfaos = board.cartoes.filter((c) => c.capitulo && !chapters.some((ch) => ch.file === c.capitulo))
  const colunas: Array<{ cap: string; rot: string; titulo: string; cartoes: Cartao[] }> = [
    { cap: '', rot: 'Solto', titulo: 'Sem capítulo', cartoes: [...doCapitulo(board.cartoes, ''), ...orfaos] },
    ...chapters.map((ch) => ({
      cap: ch.file,
      rot: rotuloCapitulo(chapters, ch.file),
      titulo: ch.title,
      cartoes: doCapitulo(board.cartoes, ch.file)
    }))
  ]

  return (
    <div className="en-mural" role="list" aria-label="Mural por capítulo">
      {colunas.map((col) => (
        <section
          key={col.cap || '__sem'}
          role="listitem"
          className={`en-col${sobre === `col:${col.cap}` ? ' drop' : ''}`}
          aria-label={`${col.rot}: ${col.titulo}`}
          {...soltavel(`col:${col.cap}`, setSobre, (id) => props.onMover(id, col.cap, null))}
        >
          <header className="en-colhead">
            <span className="en-eb">
              {col.rot} · {col.cartoes.length}
            </span>
            <h2 className="disp">{col.titulo}</h2>
            {col.cap && props.sinopses?.[col.cap] && (
              <p className="en-sinopse" title={props.sinopses[col.cap]}>
                {props.sinopses[col.cap]}
              </p>
            )}
            <div className="en-row">
              {col.cap && (
                <button type="button" className="en-ico" aria-label={`Abrir ${col.titulo} no manuscrito`} onClick={() => props.onAbrirCapitulo(col.cap)}>
                  <Mini name="capitulo" />
                </button>
              )}
              <button type="button" className="en-ico" aria-label={`Nova cena em ${col.titulo}`} onClick={() => props.onCriarCena(col.cap)}>
                <Mini name="mais" />
              </button>
            </div>
          </header>
          <ul className="en-colbody">
            {col.cartoes.map((c) => {
              const ligadas = c.fichas.map((id) => fichas.get(id)).filter((f): f is Ficha => !!f)
              const f0 = ligadas[0]
              return (
                <li
                  key={c.id}
                  className={`en-mcard en-${c.tipo} es-${c.estado}${c.id === selId ? ' sel' : ''}${sobre === `m:${c.id}` ? ' drop' : ''}`}
                  {...arrastavel(c.id)}
                  {...soltavel(`m:${c.id}`, setSobre, (id) => props.onMover(id, col.cap, c.id))}
                >
                  <button type="button" className="en-mbtn" onClick={() => props.onSel(c.id)} aria-current={c.id === selId ? 'true' : undefined}>
                    <span className="en-eb">
                      <Mini name={c.tipo} size={13} /> {CARTAO_ROTULO[c.tipo].um}
                    </span>
                    <Selo c={c} />
                    <FioSelo c={c} chapters={chapters} />
                    {c.tipo === 'personagem' && f0 ? (
                      <span className="en-mperson">
                        <span className="en-mface">
                          <Retrato ficha={f0} url={retratos[f0.id]} />
                        </span>
                        <span className="disp en-title">{f0.nome}</span>
                      </span>
                    ) : (
                      <span className="disp en-title">{c.titulo || 'Sem título'}</span>
                    )}
                    {c.texto && <span className="en-text">{c.texto}</span>}
                    {ligadas.length > 0 && c.tipo !== 'personagem' && (
                      <span className="en-fichas">
                        {ligadas.map((f) => (
                          <span key={f.id} className="en-fchip">
                            {f.nome}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {col.cartoes.length === 0 && <p className="label en-colvazio">Solte cartões aqui.</p>}
        </section>
      ))}
    </div>
  )
}
