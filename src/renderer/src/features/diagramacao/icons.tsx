import type { ReactElement } from 'react'

/** Ícones próprios da diagramação (traço 1.35, mesmo desenho do conjunto do Darkpages). */
export type DgIcon = 'anterior' | 'proxima' | 'checar' | 'pdf' | 'epub' | 'capa' | 'guias' | 'atualizar' | 'ok' | 'aviso' | 'erro' | 'abrir'

const P: Record<DgIcon, ReactElement> = {
  anterior: <path d="M14.5 6l-6 6 6 6" />,
  proxima: <path d="M9.5 6l6 6-6 6" />,
  checar: (
    <>
      <path d="M6 3.5h8.5L18 7v13.5H6z" fill="currentColor" fillOpacity=".16" />
      <path d="M6 3.5h8.5L18 7v13.5H6zM14.5 3.5V7H18" />
      <path d="M9 13.2l2 2 4-4.4" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  pdf: (
    <>
      <path d="M6 3.5h8.5L18 7v13.5H6z" fill="currentColor" fillOpacity=".16" />
      <path d="M6 3.5h8.5L18 7v13.5H6zM14.5 3.5V7H18" />
      <path d="M2.5 6.5h2M3.5 5.5v2M19.5 17.5h2M20.5 16.5v2" style={{ stroke: 'var(--acc)' }} />
      <path d="M9 12h6M9 15h6M9 9h3" />
    </>
  ),
  epub: (
    <>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2" fill="currentColor" fillOpacity=".16" />
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2" />
      <path d="M9.2 7.5h5.6M9.2 10.3h5.6M9.2 13.1h3.6" />
      <circle cx="12" cy="18.2" r=".9" style={{ fill: 'var(--acc)' }} stroke="none" />
    </>
  ),
  capa: (
    <>
      <path d="M3 5.5h7.5v14H3zM13.5 5.5H21v14h-7.5z" fill="currentColor" fillOpacity=".16" />
      <path d="M3 5.5h18v14H3zM10.5 5.5v14M13.5 5.5v14" />
      <path d="M12 3v1.6M12 20.4V22" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  guias: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1" />
      <rect x="7.5" y="7" width="9" height="10" strokeDasharray="1.6 1.6" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  atualizar: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 4.2v3.6h-3.6" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  ok: <path d="M5.5 12.5l4 4 9-9.5" />,
  aviso: (
    <>
      <path d="M12 3.8l9 15.7H3z" />
      <path d="M12 9.5v4.5M12 16.8v.2" />
    </>
  ),
  erro: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4" />
    </>
  ),
  abrir: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5l-8 8" />
      <path d="M17.5 13.5v6h-13v-13h6" />
    </>
  )
}

export function Ico({ name, size = 18 }: { name: DgIcon; size?: number }): ReactElement {
  return (
    <svg
      className="dg-ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  )
}
