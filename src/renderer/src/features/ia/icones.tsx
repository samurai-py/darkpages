import type { ReactElement } from 'react'

/** Ícones pequenos da feature IA (traço 1.6, mesmo estilo do conjunto do Folio). */

export type IconeIa = 'check' | 'x' | 'brilho' | 'refazer' | 'local' | 'nuvem' | 'alerta' | 'chave' | 'olho'

const P: Record<IconeIa, ReactElement> = {
  check: <path d="M4.5 12.5l4.5 4.5 10.5-11" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  brilho: (
    <>
      <path d="M12 3l1.8 5.4L19 10.2l-5.2 1.8L12 17.4l-1.8-5.4L5 10.2l5.2-1.8z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  refazer: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4.5H15" />
    </>
  ),
  local: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.6" />
      <path d="M9 19.5h6M12 15.5v4" />
    </>
  ),
  nuvem: <path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18.5z" />,
  alerta: (
    <>
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4.2M12 16.8v.2" />
    </>
  ),
  chave: (
    <>
      <circle cx="8" cy="12" r="3.6" />
      <path d="M11.6 12H20.5M17.5 12v3M20 12v2.2" />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  )
}

export function Ico({ n, size = 16 }: { n: IconeIa; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[n]}
    </svg>
  )
}
