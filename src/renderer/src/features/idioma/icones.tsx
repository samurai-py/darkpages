import type { ReactElement } from 'react'

/** Ícones da tela Idioma, no mesmo traço do conjunto do Folio (1.35, pontas redondas, detalhe no acento). */

export type IconeIdioma = 'sortear' | 'mais' | 'lixo' | 'baixar' | 'importar' | 'ia' | 'traco' | 'curva' | 'mover' | 'apagar' | 'novoTraco' | 'desfazer' | 'fonte'

const A = { style: { fill: 'var(--acc)' }, stroke: 'none' } as const

const P: Record<IconeIdioma, ReactElement> = {
  sortear: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="8.6" cy="8.6" r="1.1" {...A} />
      <circle cx="15.4" cy="15.4" r="1.1" {...A} />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  lixo: (
    <>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7" />
      <path d="M10.3 10.5v5.5M13.7 10.5v5.5" />
    </>
  ),
  baixar: (
    <>
      <path d="M12 4v11M7.5 10.8L12 15.3l4.5-4.5" />
      <path d="M4.5 19.5h15" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  importar: (
    <>
      <path d="M12 15.5V4.5M7.5 8.7L12 4.2l4.5 4.5" />
      <path d="M4.5 19.5h15" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  ia: (
    <>
      <path d="M11 3.5l1.6 4.4 4.4 1.6-4.4 1.6L11 15.5l-1.6-4.4L5 9.5l4.4-1.6z" />
      <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...A} />
    </>
  ),
  traco: (
    <>
      <path d="M5 18L19 6" />
      <circle cx="5" cy="18" r="1.6" {...A} />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  curva: (
    <>
      <path d="M5 18Q6 5 19 6" />
      <path d="M5 18L6 5 19 6" strokeDasharray="1.2 1.8" />
      <rect x="4.9" y="3.9" width="2.2" height="2.2" {...A} />
    </>
  ),
  mover: (
    <>
      <path d="M12 3.5v17M3.5 12h17" />
      <path d="M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5" />
      <circle cx="12" cy="12" r="1.6" {...A} />
    </>
  ),
  apagar: (
    <>
      <path d="M9 19.5h10.5M4.6 14.6l7.9-7.9a1.6 1.6 0 012.3 0l3.1 3.1a1.6 1.6 0 010 2.3L12.6 17.4l-2.1 2.1H8.2l-3.6-3.6a.9.9 0 010-1.3z" />
      <path d="M8.3 10.9l5.4 5.4" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  novoTraco: (
    <>
      <path d="M4 19l9-9" />
      <path d="M17 4v7M13.5 7.5h7" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  desfazer: (
    <>
      <path d="M8.5 5.5L4.5 9.5l4 4" />
      <path d="M4.5 9.5h9.5a5 5 0 010 10H9" />
    </>
  ),
  fonte: (
    <>
      <path d="M5 19.5L11 4.5h2l6 15M7.6 13.5h8.8" />
      <circle cx="19" cy="19.5" r="1.1" {...A} />
    </>
  )
}

export function Ico({ n, size = 16 }: { n: IconeIdioma; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[n]}
    </svg>
  )
}
