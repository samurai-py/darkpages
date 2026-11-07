import { useState, type ReactElement } from 'react'
import type { OpDiff } from '../../../../shared/versoes'
import './versoes.css'

/** Trechos iguais maiores que isto ficam recolhidos (mostra só as pontas). */
const LONGO = 520
const PONTA = 180

function palavras(s: string): number {
  return (s.match(/[\p{L}\p{N}]+/gu) ?? []).length
}

/** Corta em fronteira de palavra para a ponta não começar no meio de uma. */
function cabeca(s: string): string {
  const c = s.slice(0, PONTA)
  const i = c.lastIndexOf(' ')
  return i > PONTA / 2 ? c.slice(0, i) : c
}
function cauda(s: string): string {
  const c = s.slice(-PONTA)
  const i = c.indexOf(' ')
  return i >= 0 && i < PONTA / 2 ? c.slice(i + 1) : c
}

function Igual({ s, inicio, fim }: { s: string; inicio: boolean; fim: boolean }): ReactElement {
  const [aberto, setAberto] = useState(false)
  if (aberto || s.length <= LONGO) return <span className="vs-eq">{s}</span>
  // no começo do texto só importa o fim do trecho (o que encosta na mudança), e vice-versa
  const ini = inicio ? '' : cabeca(s)
  const fin = fim ? '' : cauda(s)
  const escondido = s.slice(ini.length, s.length - fin.length)
  return (
    <span className="vs-eq">
      {ini}
      <button type="button" className="vs-dobra" onClick={() => setAberto(true)} title="Mostrar o trecho igual">
        {palavras(escondido)} palavras iguais
      </button>
      {fin}
    </span>
  )
}

/**
 * Texto corrido com o que saiu riscado e o que entrou sublinhado, no mesmo
 * vocabulário visual do Revisor (rv-diff). Trechos longos sem mudança
 * aparecem recolhidos.
 */
export function DiffView({ ops, vazio = 'Nenhuma diferença.' }: { ops: OpDiff[]; vazio?: string }): ReactElement {
  const mudou = ops.some((o) => o.t !== '=')
  if (!mudou) return <p className="vs-vazio">{vazio}</p>
  return (
    <div className="vs-diff">
      {ops.map((o, i) =>
        o.t === '=' ? (
          <Igual key={i} s={o.s} inicio={i === 0} fim={i === ops.length - 1} />
        ) : o.t === '-' ? (
          <del key={i}>{o.s}</del>
        ) : (
          <ins key={i}>{o.s}</ins>
        )
      )}
    </div>
  )
}

/** "+12 · −4 palavras" */
export function Placar({ adicionadas, removidas }: { adicionadas: number; removidas: number }): ReactElement {
  return (
    <span className="vs-placar">
      <b className="vs-mais">+{adicionadas}</b>
      <b className="vs-menos">−{removidas}</b>
      <span>palavras</span>
    </span>
  )
}
