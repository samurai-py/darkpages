import type { ReactElement } from 'react'

/** Conjunto de ícones próprio do Folio: traço 1.35, preenchimento suave e um detalhe na cor de acento. */

const D = { fill: 'currentColor', fillOpacity: 0.16 } as const
const A = { style: { fill: 'var(--acc)' }, stroke: 'none' } as const

export type IconName =
  | 'biblioteca' | 'manuscrito' | 'universo' | 'enredo' | 'mapas'
  | 'idioma' | 'revisor' | 'arte' | 'diagramar' | 'ajustes' | 'sino'

const PATHS: Record<IconName, ReactElement> = {
  sino: (
    <>
      <path d="M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.6 1.9H4.6z" {...D} />
      <path d="M10 20.6a2.1 2.1 0 0 0 4 0" />
      <path d="M12 3.2v1.9" />
      <circle cx="17.4" cy="6.2" r="1.3" {...A} />
    </>
  ),
  biblioteca: (
    <>
      <path d="M3.5 20.5h17" />
      <rect x="4.5" y="6" width="3.6" height="14.5" rx=".6" {...D} />
      <rect x="8.6" y="3.5" width="3.6" height="17" rx=".6" />
      <path d="M4.5 9h3.6M4.5 17h3.6M8.6 7h3.6M8.6 17.5h3.6" />
      <path d="M13.6 6.8l3.3-1.1 4.2 13.6-3.3 1.1z" {...D} />
      <circle cx="10.4" cy="12.2" r="1" {...A} />
    </>
  ),
  manuscrito: (
    <>
      <path d="M20.5 3.5C14 4.5 10 9 9 15c4.5-.5 9.8-4.4 11.5-11.5z" {...D} />
      <path d="M20.5 3.5L7.5 18M15.2 8.4l-2.3-.5M13.2 11.2l-2.5-.2M17.6 5.9l-1.8-.8" />
      <path d="M3.5 20.5h7M4.6 20.5l.7-2.6h3.4l.7 2.6" />
      <circle cx="7.3" cy="18.2" r=".9" {...A} />
    </>
  ),
  universo: (
    <>
      <ellipse cx="12" cy="12.5" rx="7.5" ry="8.8" {...D} />
      <ellipse cx="12" cy="12.5" rx="7.5" ry="8.8" />
      <circle cx="12" cy="10.6" r="2.5" />
      <path d="M7.9 18c.9-2.3 2.4-3.5 4.1-3.5s3.2 1.2 4.1 3.5" />
      <circle cx="12" cy="2.6" r="1" {...A} />
    </>
  ),
  enredo: (
    <>
      <path d="M4 17.5l5-6.5 5 3.2 6-9.2" />
      <path d="M14 14.2l3 5.8" strokeDasharray="1.4 2" />
      <circle cx="4" cy="17.5" r="1.8" {...D} />
      <circle cx="4" cy="17.5" r="1.8" />
      <circle cx="9" cy="11" r="1.8" />
      <circle cx="14" cy="14.2" r="1.8" />
      <circle cx="17" cy="20" r="1.2" />
      <path d="M20 2.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...A} />
    </>
  ),
  mapas: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <circle cx="12" cy="12" r="6.2" strokeDasharray=".6 1.8" />
      <path d="M12 2.5l2.1 9.5-2.1 9.5-2.1-9.5z" {...D} />
      <path d="M12 2.5l2.1 9.5-2.1 9.5-2.1-9.5zM2.5 12l9.5-2.1 9.5 2.1-9.5 2.1z" />
      <path d="M12 2.5l2.1 9.5H12z" {...A} />
    </>
  ),
  idioma: (
    <>
      <path d="M5 3.5h11l3 3v14H5z" {...D} />
      <path d="M5 3.5h11l3 3v14H5zM16 3.5v3h3" />
      <path d="M8.3 9l2 3.4-2 3.4M13.2 9v7M13.2 12.4l2.6-2.4M13.2 12.4l2.6 2.9" />
      <circle cx="8.6" cy="18.4" r=".9" {...A} />
    </>
  ),
  revisor: (
    <>
      <path d="M3.5 5.5h10M3.5 9h10M3.5 12.5h5" />
      <circle cx="15.5" cy="15.5" r="4.6" {...D} />
      <circle cx="15.5" cy="15.5" r="4.6" />
      <path d="M18.9 18.9l2.4 2.4" />
      <path d="M13.4 15.6l1.5 1.5 2.7-2.9" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  arte: (
    <>
      <path d="M20 3.5l-8.6 9.8" />
      <path d="M11.4 13.3c-2-.7-4.5.5-4.8 3.2-.2 2-1.2 3-3.1 3.8 3.8 1 8 .3 8.9-3.1.4-1.5 0-3-1-3.9z" {...D} />
      <path d="M11.4 13.3c-2-.7-4.5.5-4.8 3.2-.2 2-1.2 3-3.1 3.8 3.8 1 8 .3 8.9-3.1.4-1.5 0-3-1-3.9z" />
      <path d="M18 13.8l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" {...A} />
    </>
  ),
  diagramar: (
    <>
      <path d="M4 7.2c2.7-1 5.3-1 8 .8v11.4c-2.7-1.8-5.3-1.8-8-.8z" {...D} />
      <path d="M4 7.2c2.7-1 5.3-1 8 .8v11.4c-2.7-1.8-5.3-1.8-8-.8zM20 7.2c-2.7-1-5.3-1-8 .8v11.4c2.7-1.8 5.3-1.8 8-.8z" />
      <path d="M14.4 11h3.2M14.4 13.6h3.2" />
      <path d="M1.8 4.6h2.4M4.6 1.8v2.4M22.2 4.6h-2.4M19.4 1.8v2.4" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  ajustes: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="2.3" {...D} />
      <circle cx="12" cy="12" r="2.3" />
      <path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M7.6 16.4l2.8-2.8M13.6 10.4l2.8-2.8" />
      <circle cx="16.6" cy="7.4" r="1.1" {...A} />
    </>
  )
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }): ReactElement {
  return (
    <svg
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
      {PATHS[name]}
    </svg>
  )
}
