import { useState, type ReactElement } from 'react'
import type { Cartao, EnredoBoard, Ficha } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { Mini } from '../universo/icons'
import { arrastavel, soltavel } from './arrastar'
import { doCapitulo, rotuloCapitulo, vizinho } from './board'
import { FioSelo, Selo } from './Selo'
import { CartaoImagem } from './imagem'

export interface RoteiroProps {
  /** pasta do livro (imagens dos cartões) */
  dir: string
  board: EnredoBoard
  chapters: ChapterInfo[]
  fichas: Map<string, Ficha>
  selId: string | null
  onSel: (id: string) => void
  /** move o cartão para o capítulo, antes de `antesDe` (null = fim) */
  onMover: (id: string, capitulo: string, antesDe: string | null) => void
  onCriarCena: (capitulo: string) => void
  onAbrirCapitulo: (file: string) => void
  /** sinopse da cena de cada capítulo (arquivo → texto) */
  sinopses?: Record<string, string>
}

const SO_CENAS = ['cena' as const]

/** E4: roteiro cena a cena, por capítulo. */
export function Roteiro(props: RoteiroProps): ReactElement {
  const { board, chapters, fichas, selId } = props
  const [sobre, setSobre] = useState<string | null>(null)
  const semCap = doCapitulo(board.cartoes, '', SO_CENAS)
  const orfas = board.cartoes.filter(
    (c) => c.tipo === 'cena' && c.capitulo && !chapters.some((ch) => ch.file === c.capitulo)
  )
  const total = board.cartoes.filter((c) => c.tipo === 'cena').length

  const grupos: Array<{ cap: string; titulo: string; rot: string; cenas: Cartao[] }> = [
    ...chapters.map((ch) => ({
      cap: ch.file,
      titulo: ch.title,
      rot: rotuloCapitulo(chapters, ch.file),
      cenas: doCapitulo(board.cartoes, ch.file, SO_CENAS)
    })),
    { cap: '', titulo: 'Cenas sem capítulo', rot: '', cenas: [...semCap, ...orfas] }
  ]

  let n = 0
  return (
    <div className="en-roteiro">
      <p className="label en-dica">
        {total} {total === 1 ? 'cena' : 'cenas'}. Arraste pelas alças ou use as setas para reordenar; solte em outro capítulo para mover.
      </p>
      {grupos.map((g) => (
        <section
          key={g.cap || '__sem'}
          className={`en-rcap${sobre === `cap:${g.cap}` ? ' drop' : ''}`}
          aria-label={g.cap ? `${g.rot}: ${g.titulo}` : g.titulo}
          {...soltavel(`cap:${g.cap}`, setSobre, (id) => props.onMover(id, g.cap, null))}
        >
          <header className="en-rhead">
            {g.rot && <span className="en-eb">{g.rot}</span>}
            <h2 className="disp">{g.titulo}</h2>
            <span className="pill en-count">{g.cenas.length}</span>
            <span className="en-rule" aria-hidden="true" />
            {g.cap && (
              <button type="button" className="btn sm" onClick={() => props.onAbrirCapitulo(g.cap)}>
                <Mini name="capitulo" /> Abrir capítulo
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => props.onCriarCena(g.cap)}>
              <Mini name="mais" /> Cena
            </button>
          </header>
          {g.cap && props.sinopses?.[g.cap] && <p className="en-sinopse en-rsinopse">{props.sinopses[g.cap]}</p>}
          {g.cenas.length === 0 && <p className="label en-rvazio">Nenhuma cena. Solte uma aqui ou crie.</p>}
          <ol className="en-rlist">
            {g.cenas.map((c, i) => {
              n++
              const ligadas = c.fichas.map((id) => fichas.get(id)).filter((f): f is Ficha => !!f)
              const sobe = vizinho(board.cartoes, c.id, -1, SO_CENAS)
              const desce = vizinho(board.cartoes, c.id, 1, SO_CENAS)
              return (
                <li
                  key={c.id}
                  className={`en-rrow es-${c.estado}${c.id === selId ? ' sel' : ''}${sobre === `row:${c.id}` ? ' drop' : ''}`}
                  {...arrastavel(c.id)}
                  {...soltavel(`row:${c.id}`, setSobre, (id) => props.onMover(id, g.cap, c.id))}
                >
                  <span className="en-grip" aria-hidden="true">
                    <Mini name="arrastar" />
                  </span>
                  <span className="en-rn">{n}</span>
                  <button type="button" className="en-rbody" onClick={() => props.onSel(c.id)} aria-current={c.id === selId ? 'true' : undefined}>
                    {c.imagem && <CartaoImagem dir={props.dir} nome={c.imagem} className="en-rthumb" />}
                    <span className="en-rcol">
                      <span className="en-rtl">
                        <span className="disp en-rt">{c.titulo || 'Cena sem título'}</span>
                        <Selo c={c} />
                        <FioSelo c={c} chapters={chapters} />
                      </span>
                      {c.texto && <span className="en-rx">{c.texto}</span>}
                      {ligadas.length > 0 && (
                        <span className="en-fichas">
                          {ligadas.map((f) => (
                            <span key={f.id} className="en-fchip">
                              {f.nome}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <span className="en-rmove">
                    <button
                      type="button"
                      className="en-ico"
                      aria-label={`Subir cena ${i + 1}`}
                      disabled={sobe === undefined}
                      onClick={() => sobe !== undefined && props.onMover(c.id, g.cap, sobe)}
                    >
                      <Mini name="subir" />
                    </button>
                    <button
                      type="button"
                      className="en-ico"
                      aria-label={`Descer cena ${i + 1}`}
                      disabled={desce === undefined}
                      onClick={() => desce !== undefined && props.onMover(c.id, g.cap, desce)}
                    >
                      <Mini name="descer" />
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
