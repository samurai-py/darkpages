import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'

/** Diálogo modal nativo (<dialog>): foco preso, Esc fecha, funciona em tela cheia. */
export function Modal({
  titulo,
  onClose,
  children,
  largura = 460
}: {
  titulo: string
  onClose: () => void
  children: ReactNode
  largura?: number
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    const onCancel = (e: Event): void => {
      e.preventDefault()
      closeRef.current()
    }
    d.addEventListener('cancel', onCancel)
    return () => {
      d.removeEventListener('cancel', onCancel)
      if (d.open) d.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="ms-modal panel"
      aria-label={titulo}
      style={{ width: `min(${largura}px, calc(100vw - 32px))` }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <header className="ms-modal-h">
        <span className="disp">{titulo}</span>
      </header>
      <div className="ms-modal-b">{children}</div>
    </dialog>
  )
}
