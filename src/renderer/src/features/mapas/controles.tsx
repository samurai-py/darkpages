import { useId, type ReactElement } from 'react'

/**
 * Controles do painel que agrupam a edição contínua num único passo de
 * desfazer: `inicio` ao começar a mexer, `muda` a cada valor, `fim` ao soltar.
 */
export interface Passo {
  inicio: () => void
  fim: () => void
}

export function Faixa({
  rotulo,
  valor,
  min,
  max,
  passo = 1,
  fmt,
  onMuda,
  passoHist
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  passo?: number
  fmt?: (v: number) => string
  onMuda: (v: number) => void
  passoHist?: Passo
}): ReactElement {
  const id = useId()
  return (
    <div className="mp-faixa">
      <label htmlFor={id}>
        <span>{rotulo}</span>
        <output htmlFor={id}>{fmt ? fmt(valor) : valor}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onPointerDown={passoHist?.inicio}
        onPointerUp={passoHist?.fim}
        onKeyDown={passoHist?.inicio}
        onKeyUp={passoHist?.fim}
        onBlur={passoHist?.fim}
        onChange={(e) => onMuda(Number(e.target.value))}
      />
    </div>
  )
}

export function Texto({
  rotulo,
  valor,
  onMuda,
  passoHist,
  autoFocus,
  max = 160,
  placeholder
}: {
  rotulo: string
  valor: string
  onMuda: (v: string) => void
  passoHist?: Passo
  autoFocus?: boolean
  max?: number
  placeholder?: string
}): ReactElement {
  return (
    <label className="field">
      {rotulo}
      <input
        className="input"
        value={valor}
        maxLength={max}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={passoHist?.inicio}
        onBlur={passoHist?.fim}
        onChange={(e) => onMuda(e.target.value)}
      />
    </label>
  )
}

export function Segmentos<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMuda
}: {
  rotulo: string
  valor: T
  opcoes: Array<{ v: T; nome: string }>
  onMuda: (v: T) => void
}): ReactElement {
  return (
    <div className="mp-seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => onMuda(o.v)}>
          {o.nome}
        </button>
      ))}
    </div>
  )
}

export function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMuda
}: {
  rotulo: string
  valor: T
  opcoes: Array<{ v: T; nome: string }>
  onMuda: (v: T) => void
}): ReactElement {
  return (
    <label className="field">
      {rotulo}
      <select className="select" value={valor} onChange={(e) => onMuda(e.target.value as T)}>
        {opcoes.map((o) => (
          <option key={o.v} value={o.v}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  )
}
