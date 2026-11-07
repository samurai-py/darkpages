import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = { kind: 'idle' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string }

/**
 * Salvamento automático com debounce. `save` recebe o valor mais recente;
 * `flush()` força o salvamento imediato (troca de capítulo, fechar janela).
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delayMs = 1000): {
  state: SaveState
  schedule: (value: T) => void
  flush: () => Promise<void>
} {
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const inFlight = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const p = pending.current
    if (!p) return inFlight.current
    pending.current = null
    setState({ kind: 'saving' })
    inFlight.current = inFlight.current
      .then(() => saveRef.current(p.value))
      .then(
        () => setState({ kind: 'saved', at: new Date() }),
        (e: unknown) => {
          // devolve o valor para a próxima tentativa
          pending.current ??= p
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      )
    return inFlight.current
  }, [])

  const schedule = useCallback(
    (value: T): void => {
      pending.current = { value }
      setState({ kind: 'dirty' })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delayMs)
    },
    [delayMs, flush]
  )

  useEffect(() => {
    const onHide = (): void => void flush()
    window.addEventListener('beforeunload', onHide)
    return () => {
      window.removeEventListener('beforeunload', onHide)
      void flush()
    }
  }, [flush])

  return { state, schedule, flush }
}
