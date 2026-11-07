import { useEffect, useId, useState, type ReactElement } from 'react'
import { fmt } from './model'

function parse(v: string): number | null {
  const n = Number(v.replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

interface NumFieldProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  suffix?: string
}

/** Campo numérico em pt-BR (vírgula decimal). Aplica ao sair do campo ou com Enter. */
export function NumField({ label, value, min, max, onChange, suffix }: NumFieldProps): ReactElement {
  const [text, setText] = useState(fmt(value, 3))
  useEffect(() => setText(fmt(value, 3)), [value])
  const commit = (): void => {
    const n = parse(text)
    if (n === null || n < min || n > max) {
      setText(fmt(value, 3))
      return
    }
    if (n !== value) onChange(n)
  }
  return (
    <label className="field">
      {label}
      <input
        className="input"
        inputMode="decimal"
        value={text}
        aria-describedby={undefined}
        title={`${fmt(min)} a ${fmt(max)}${suffix ? ` ${suffix}` : ''}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </label>
  )
}

interface StepperProps {
  label: string
  value: number
  step: number
  min: number
  max: number
  digits?: number
  unit?: string
  onChange: (n: number) => void
}

/** Linha "rótulo  − valor +" do painel de tipografia. */
export function Stepper({ label, value, step, min, max, digits = 2, unit = '', onChange }: StepperProps): ReactElement {
  const id = useId()
  const set = (n: number): void => onChange(Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)))
  return (
    <div className="dg-row">
      <span id={id}>{label}</span>
      <span className="dg-step" role="group" aria-labelledby={id}>
        <button type="button" className="btn sm" aria-label={`Diminuir ${label.toLowerCase()}`} disabled={value <= min} onClick={() => set(value - step)}>−</button>
        <output aria-live="polite">{fmt(value, digits)}{unit}</output>
        <button type="button" className="btn sm" aria-label={`Aumentar ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + step)}>+</button>
      </span>
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (s: string) => void
  multiline?: boolean
  placeholder?: string
  rows?: number
}

/** Texto livre; aplica ao sair do campo (não recompila a cada tecla). */
export function TextField({ label, value, onChange, multiline = false, placeholder, rows = 3 }: TextFieldProps): ReactElement {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = (): void => {
    if (text !== value) onChange(text)
  }
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea className="input" rows={rows} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : (
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
      )}
    </label>
  )
}
