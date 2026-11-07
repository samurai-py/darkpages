import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Cartao, EnredoBoard, Ficha } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { conhecimentoNoCapitulo, estadoFio, posicaoDoId, ultimoEscrito } from '../../../../shared/narrativa'
import { Mini } from '../universo/icons'
import { rotuloCapitulo, rotuloPorId } from './board'
import { FioSelo, Selo } from './Selo'

/**
 * Visão do LEITOR (só leitura): o que ele já sabe até o capítulo escolhido
 * (cartões "fato" revelados), o que ainda é segredo, as crenças de
 * personagens e os fios soltos (promessas feitas a ele). Clicar abre o cartão
 * no painel ao lado, onde tudo se edita.
 */

export interface LeitorProps {
  board: EnredoBoard
  chapters: ChapterInfo[]
  fichas: Map<string, Ficha>
  selId: string | null
  onSel: (id: string) => void
  onAbrirCapitulo: (file: string) => void
}

function Item({ c, sel, onSel, children }: { c: Cartao; sel: boolean; onSel: (id: string) => void; children?: ReactElement | false | null | string }): ReactElement {
  return (
    <li>
      <button type="button" className={`en-litem es-${c.estado}${sel ? ' sel' : ''}`} onClick={() => onSel(c.id)} aria-current={sel ? 'true' : undefined}>
        <span className="en-ltl">
          <span className="disp en-lt">{c.titulo || 'Sem título'}</span>
          <Selo c={c} />
        </span>
        {c.texto && <span className="en-lx">{c.texto}</span>}
        {children && <span className="label">{children}</span>}
      </button>
    </li>
  )
}

export function Leitor({ board, chapters, fichas, selId, onSel, onAbrirCapitulo }: LeitorProps): ReactElement {
  const padrao = chapters[Math.max(0, ultimoEscrito(chapters))]?.id ?? ''
  const [ate, setAte] = useState(padrao)
  useEffect(() => {
    if (!chapters.some((c) => c.id === ate)) setAte(padrao)
  }, [chapters, ate, padrao])

  const pos = posicaoDoId(ate, chapters)
  const k = useMemo(() => conhecimentoNoCapitulo(board.cartoes, pos, chapters), [board.cartoes, pos, chapters])
  const fios = useMemo(() => {
    const peso = { atrasado: 0, aberto: 1, resolvido: 2 } as const
    return board.cartoes
      .filter((c) => c.fio && c.estado !== 'descartado')
      .map((c) => ({ c, est: estadoFio(c, chapters) ?? 'aberto' }))
      .sort((a, b) => peso[a.est] - peso[b.est] || posicaoDoId(a.c.fio?.resolveEm, chapters) - posicaoDoId(b.c.fio?.resolveEm, chapters))
  }, [board.cartoes, chapters])
  const abertos = fios.filter((f) => f.est !== 'resolvido')
  const resolvidos = fios.filter((f) => f.est === 'resolvido')
  const atrasados = fios.filter((f) => f.est === 'atrasado').length
  const capAte = chapters[pos]
  const quando = (c: Cartao): string => (c.revelarEm ? `desde ${rotuloPorId(chapters, c.revelarEm, false)}` : 'desde o início')

  return (
    <div className="en-leitor">
      <section className="en-lsec" aria-labelledby="en-l-sabe">
        <header className="en-lhead">
          <h2 className="disp" id="en-l-sabe">
            <Mini name="leitor" size={18} /> O que o leitor sabe
          </h2>
          <label className="en-lsel">
            <span>até</span>
            <select className="select" value={ate} onChange={(e) => setAte(e.target.value)} disabled={!chapters.length}>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {rotuloPorId(chapters, ch.id)}
                </option>
              ))}
            </select>
          </label>
          {capAte && (
            <button type="button" className="btn sm" onClick={() => onAbrirCapitulo(capAte.file)}>
              <Mini name="capitulo" /> Abrir
            </button>
          )}
        </header>
        <p className="en-memintro">
          Cartões do tipo <b>Fato</b> revelados até {capAte ? rotuloCapitulo(chapters, capAte.file) : 'aqui'}. É o que a IA trata como fato do livro nesse
          capítulo; o resto vai para ela como segredo.
        </p>
        {k.sabidos.length + k.segredos.length + k.crencas.length === 0 && (
          <p className="label">Nenhum fato ainda. No Quadro, crie um cartão do tipo Fato e diga a partir de que capítulo o leitor pode saber.</p>
        )}
        {k.sabidos.length > 0 && (
          <>
            <h3 className="en-eb">Já sabe · {k.sabidos.length}</h3>
            <ul className="en-llist">
              {k.sabidos.map((c) => (
                <Item key={c.id} c={c} sel={c.id === selId} onSel={onSel}>
                  {quando(c)}
                </Item>
              ))}
            </ul>
          </>
        )}
        {k.segredos.length > 0 && (
          <>
            <h3 className="en-eb">Ainda segredo · {k.segredos.length}</h3>
            <ul className="en-llist en-lsegredo">
              {k.segredos.map((c) => (
                <Item key={c.id} c={c} sel={c.id === selId} onSel={onSel}>
                  {`revela em ${rotuloPorId(chapters, c.revelarEm, false)}${c.termos?.length ? ` · vigia: ${c.termos.join(', ')}` : ''}`}
                </Item>
              ))}
            </ul>
          </>
        )}
        {k.crencas.length > 0 && (
          <>
            <h3 className="en-eb">Crenças e afirmações · {k.crencas.length}</h3>
            <ul className="en-llist">
              {k.crencas.map((c) => {
                const quem = c.perspectiva?.tipo === 'crenca' ? fichas.get(c.perspectiva.fichaId)?.nome : undefined
                return (
                  <Item key={c.id} c={c} sel={c.id === selId} onSel={onSel}>
                    {`${quem ?? 'Personagem'} acredita/afirma · não é necessariamente verdade`}
                  </Item>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="en-lsec" aria-labelledby="en-l-fios">
        <header className="en-lhead">
          <h2 className="disp" id="en-l-fios">
            <Mini name="fio" size={18} /> Fios soltos
          </h2>
          <span className="pill">
            <b>{abertos.length}</b> {abertos.length === 1 ? 'aberto' : 'abertos'}
          </span>
          {atrasados > 0 && (
            <span className="pill en-pdes">
              <b>{atrasados}</b> {atrasados === 1 ? 'atrasado' : 'atrasados'}
            </span>
          )}
        </header>
        <p className="en-memintro">
          Promessas e perguntas feitas ao leitor. Marque qualquer cartão como fio no painel dele; “atrasado” = o livro já passou do capítulo em que ele devia se
          resolver.
        </p>
        {!fios.length && <p className="label">Nenhum fio marcado ainda.</p>}
        {abertos.length > 0 && (
          <ul className="en-llist">
            {abertos.map(({ c }) => (
              <Item key={c.id} c={c} sel={c.id === selId} onSel={onSel}>
                <>
                  <FioSelo c={c} chapters={chapters} />
                  {c.capitulo ? ` plantado em ${rotuloCapitulo(chapters, c.capitulo)}` : ' sem capítulo de origem'}
                </>
              </Item>
            ))}
          </ul>
        )}
        {resolvidos.length > 0 && (
          <details className="en-ldet">
            <summary className="en-eb">Resolvidos · {resolvidos.length}</summary>
            <ul className="en-llist">
              {resolvidos.map(({ c }) => (
                <Item key={c.id} c={c} sel={c.id === selId} onSel={onSel}>
                  {c.fio?.resolveEm ? `resolvido em ${rotuloPorId(chapters, c.fio.resolveEm, false)}` : 'resolvido'}
                </Item>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  )
}
