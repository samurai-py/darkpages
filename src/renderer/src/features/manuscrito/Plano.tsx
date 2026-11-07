import { useEffect, useState, type ReactElement } from 'react'
import { call } from '../../api'
import type { ConferenciaPlano, ImpactoItem, ImpactoTipo, ItemPlano, PlanoAlvo } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { rotuloCapitulo } from '../enredo/board'
import { Mini } from '../universo/icons'

/**
 * Inspector › Cena: duas leituras do capítulo contra o resto do livro, só
 * leitura (nada muda sozinho):
 * - "Conferir com o plano" (IA): sinopse, cartões, fios e fatos do capítulo
 *   foram cumpridos no texto?
 * - "O que isso afeta?" (local): capítulos seguintes ligados a este por
 *   causa, fatos, fios e fichas que mudam aqui.
 */

interface Props {
  dir: string
  file: string
  capitulos: ChapterInfo[]
  /** salva o capítulo antes de ler o arquivo */
  antes: () => Promise<void>
  onAbrirCapitulo: (file: string) => void
  onAbrirCartao: (id: string) => void
  onAbrirFicha: (id: string) => void
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const TIPO_PLANO: Record<ItemPlano['tipo'], string> = { cumprido: 'Cumprido', faltando: 'Faltando', divergente: 'Diferente do plano' }
const ORDEM_PLANO: ItemPlano['tipo'][] = ['faltando', 'divergente', 'cumprido']
const NOME_ALVO: Record<PlanoAlvo['tipo'], string> = { sinopse: 'Sinopse', cartao: 'Cartão', fio: 'Fio a resolver', fato: 'Fato a revelar' }
const NOME_IMPACTO: Record<ImpactoTipo, string> = { causa: 'causa', fato: 'fato', fio: 'fio', ficha: 'ficha' }

export function ConferirPlano(p: Props): ReactElement {
  const [r, setR] = useState<ConferenciaPlano | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setR(null)
    setErro(null)
  }, [p.file])

  const conferir = async (): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      await p.antes()
      setR(await call<ConferenciaPlano>('ia.conferirPlano', p.dir, p.file))
    } catch (e) {
      setErro(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const itens = r ? [...r.itens].sort((a, b) => ORDEM_PLANO.indexOf(a.tipo) - ORDEM_PLANO.indexOf(b.tipo)) : []
  const conta = (t: ItemPlano['tipo']): number => itens.filter((x) => x.tipo === t).length

  return (
    <section className="ms-sec">
      <span className="ms-eb">Plano</span>
      <p className="ms-hint">A IA compara o texto com a sinopse, os cartões deste capítulo, os fios que se resolvem aqui e os fatos revelados aqui. Não muda nada.</p>
      <button type="button" className="btn sm" onClick={() => void conferir()} disabled={busy}>
        <Mini name="canonico" size={15} /> {busy ? 'Conferindo…' : 'Conferir com o plano'}
      </button>
      {erro && <p className="err">{erro}</p>}
      {r && (
        <>
          <p className="ms-hint" role="status">
            {conta('cumprido')} cumprido{conta('cumprido') === 1 ? '' : 's'} · {conta('faltando')} faltando · {conta('divergente')} diferente
            {conta('divergente') === 1 ? '' : 's'}
          </p>
          <ul className="ms-plano">
            {itens.map((it, i) => (
              <li key={`${it.alvo.tipo}-${it.alvo.id ?? ''}-${i}`} className={`ms-pitem t-${it.tipo}`}>
                <span className="ms-pitem-h">
                  <span className="ms-ptag">{TIPO_PLANO[it.tipo]}</span>
                  <span className="ms-hint">{NOME_ALVO[it.alvo.tipo]}</span>
                </span>
                {it.alvo.id ? (
                  <button type="button" className="ms-link ms-palvo" onClick={() => it.alvo.id && p.onAbrirCartao(it.alvo.id)}>
                    {it.alvo.titulo}
                  </button>
                ) : (
                  <strong>{it.alvo.titulo}</strong>
                )}
                <span>{it.explicacao}</span>
                {it.trecho && <q className="ms-trecho">{it.trecho}</q>}
              </li>
            ))}
          </ul>
          {r.semResposta.length > 0 && <p className="ms-hint">Sem resposta da IA: {r.semResposta.map((a) => a.titulo).join(', ')}.</p>}
          {r.avisos.length > 0 && <p className="ms-hint">Contexto reduzido: {r.avisos.join(' ')}</p>}
        </>
      )}
    </section>
  )
}

export function Impacto(p: Props): ReactElement {
  const [itens, setItens] = useState<ImpactoItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setItens(null)
    setErro(null)
  }, [p.file])

  const calcular = async (): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      await p.antes()
      setItens(await call<ImpactoItem[]>('enredo.impacto', p.dir, p.file))
    } catch (e) {
      setErro(msg(e))
    } finally {
      setBusy(false)
    }
  }

  // agrupa por capítulo, na ordem em que vieram (ordem do livro; "resto do livro" no fim)
  const grupos: Array<{ cap: string; itens: ImpactoItem[] }> = []
  for (const it of itens ?? []) {
    const cap = it.capitulo ?? ''
    const g = grupos.find((x) => x.cap === cap)
    if (g) g.itens.push(it)
    else grupos.push({ cap, itens: [it] })
  }
  const titulo = (file: string): string => {
    const ch = p.capitulos.find((c) => c.file === file)
    return ch ? `${rotuloCapitulo(p.capitulos, file)} · ${ch.title}` : 'capítulo removido'
  }

  return (
    <section className="ms-sec">
      <span className="ms-eb">Impacto</span>
      <p className="ms-hint">Se este capítulo mudar, o que adiante pode quebrar: causas no Enredo, fatos revelados aqui, fios plantados aqui e fichas que mudam aqui.</p>
      <button type="button" className="btn sm" onClick={() => void calcular()} disabled={busy}>
        <Mini name="impacto" size={15} /> {busy ? 'Procurando…' : 'O que isso afeta?'}
      </button>
      {erro && <p className="err">{erro}</p>}
      {itens && !itens.length && (
        <p className="ms-hint" role="status">
          Nada adiante depende deste capítulo pelo que está no Enredo e nas fichas.
        </p>
      )}
      {grupos.length > 0 && (
        <ul className="ms-impacto">
          {grupos.map((g) => (
            <li key={g.cap || '__resto'}>
              {g.cap ? (
                <button type="button" className="ms-link ms-icap" onClick={() => p.onAbrirCapitulo(g.cap)}>
                  {titulo(g.cap)}
                </button>
              ) : (
                <strong className="ms-icap">Resto do livro</strong>
              )}
              <ul>
                {g.itens.map((it, i) => (
                  <li key={i} className="ms-iitem">
                    <span className="ms-ptag">{NOME_IMPACTO[it.tipo]}</span>
                    <span>{it.texto}</span>
                    {it.cartaoId && (
                      <button type="button" className="ms-link" onClick={() => it.cartaoId && p.onAbrirCartao(it.cartaoId)}>
                        cartão
                      </button>
                    )}
                    {it.fichaId && (
                      <button type="button" className="ms-link" onClick={() => it.fichaId && p.onAbrirFicha(it.fichaId)}>
                        ficha
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
