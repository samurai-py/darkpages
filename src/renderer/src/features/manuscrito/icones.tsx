import type { ReactElement } from 'react'

/** Ícones do Manuscrito no mesmo traço de icons.tsx (1.35, preenchimento suave, detalhe no acento). */

const D = { fill: 'currentColor', fillOpacity: 0.16 } as const
const A = { style: { fill: 'var(--acc)' }, stroke: 'none' } as const

export type IconeMs =
  | 'mais' | 'menos' | 'busca' | 'ampulheta' | 'fechar' | 'subir' | 'descer' | 'menu' | 'arrastar'
  | 'importar' | 'exportar' | 'alerta' | 'lugar' | 'olho' | 'brilho' | 'nota' | 'cena' | 'lixeira'
  | 'lapis' | 'anterior' | 'proximo' | 'sair' | 'imagem' | 'eco' | 'versoes' | 'restaurar'
  | 'pagina' | 'teclado' | 'texto' | 'inserir' | 'fala' | 'citacao'

const P: Record<IconeMs, ReactElement> = {
  mais: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  busca: (
    <>
      <circle cx="10.5" cy="10.5" r="6" {...D} />
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  ampulheta: (
    <>
      <path d="M6 3.5h12M6 20.5h12" />
      <path d="M7.5 3.5c0 5 4.5 6 4.5 8.5S7.5 15.5 7.5 20.5h9c0-5-4.5-6-4.5-8.5s4.5-3.5 4.5-8.5z" />
      <path d="M9.4 18.8c.8-1.8 1.8-2.6 2.6-2.6s1.8.8 2.6 2.6z" {...A} />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  subir: <path d="M6 14l6-6 6 6" />,
  descer: <path d="M6 10l6 6 6-6" />,
  menu: (
    <>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  arrastar: (
    <>
      <circle cx="9" cy="7" r="1" fill="currentColor" />
      <circle cx="15" cy="7" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="17" r="1" fill="currentColor" />
      <circle cx="15" cy="17" r="1" fill="currentColor" />
    </>
  ),
  importar: (
    <>
      <path d="M5 14v5.5h14V14" {...D} />
      <path d="M5 14v5.5h14V14M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
    </>
  ),
  exportar: (
    <>
      <path d="M5 14v5.5h14V14" {...D} />
      <path d="M5 14v5.5h14V14M12 14.5v-11M7.5 8L12 3.5 16.5 8" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5l9 16H3z" {...D} />
      <path d="M12 3.5l9 16H3zM12 10v4.5" />
      <circle cx="12" cy="17" r=".9" {...A} />
    </>
  ),
  lugar: (
    <>
      <path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" {...D} />
      <path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.4" {...A} />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...D} />
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" {...A} />
    </>
  ),
  brilho: (
    <>
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" {...D} />
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />
      <path d="M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" {...A} />
    </>
  ),
  nota: (
    <>
      <path d="M4 6h11M4 10h11M4 14h7" />
      <path d="M16.5 13.5h4M18.5 11.5v4" style={{ stroke: 'var(--acc)' }} />
      <path d="M4 19.5h16" strokeDasharray="1.4 2" />
    </>
  ),
  cena: (
    <>
      <path d="M12 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" {...A} />
      <path d="M7 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM17 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>
  ),
  lixeira: (
    <>
      <path d="M6.5 7h11l-1 13h-9z" {...D} />
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.2 10.5v6M13.8 10.5v6" />
    </>
  ),
  lapis: (
    <>
      <path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z" {...D} />
      <path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19zM13.5 7l3.5 3.5" />
    </>
  ),
  anterior: <path d="M15 6l-6 6 6 6" />,
  proximo: <path d="M9 6l6 6-6 6" />,
  sair: (
    <>
      <path d="M9 4H4.5v16H9" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  imagem: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" {...D} />
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5" />
      <circle cx="15.5" cy="9" r="1.3" {...A} />
    </>
  ),
  versoes: (
    <>
      <circle cx="13" cy="12.5" r="7.5" {...D} />
      <path d="M5.6 9.6A7.5 7.5 0 1 1 5.5 14" />
      <path d="M3.2 7.4l2.4 2.2 2.6-1.9" />
      <path d="M13 8.5v4.3l2.8 1.7" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  restaurar: (
    <>
      <path d="M6 4.5h9l3.5 3.5v11.5H6z" {...D} />
      <path d="M6 4.5h9l3.5 3.5v11.5H6zM15 4.5V8h3.5" />
      <path d="M14.5 15.5a3 3 0 1 0-1-4.2M13 9.8l.5 1.6 1.6-.5" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  pagina: (
    <>
      <path d="M6 3.5h12v6H6z" {...D} />
      <path d="M6 9.5v-6h12v6M6 14.5v6h12v-6" />
      <path d="M3.5 12h2M8 12h2M12 12h2M16 12h2M20.5 12h0" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  teclado: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" {...D} />
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18.4 9.5h.01M6 12.3h.01M18.4 12.3h.01" strokeWidth={2} />
      <path d="M8.5 15h7" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  texto: (
    <>
      <path d="M3.5 18.5L8.5 5.5l5 13M5.4 14h6.2" />
      <path d="M15 12.5a2.6 2.6 0 015.2 0v6M20.2 15.8c-1.2-.9-5.6-1-5.6 1.2 0 1.9 4 1.8 5.6-.4" />
      <circle cx="8.5" cy="5.5" r="1.1" {...A} />
    </>
  ),
  inserir: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" {...D} />
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  fala: (
    <>
      <path d="M4 7h7" style={{ stroke: 'var(--acc)' }} strokeWidth={2} />
      <path d="M13.5 7h6.5M4 12h16M4 17h11" />
    </>
  ),
  citacao: (
    <>
      <path d="M5 6.5v11" style={{ stroke: 'var(--acc)' }} strokeWidth={2} />
      <path d="M9 8h10M9 12h10M9 16h7" />
    </>
  ),
  eco: (
    <>
      <path d="M4 12h3M17 12h3" />
      <path d="M8.5 8.5a5 5 0 017 0M8.5 15.5a5 5 0 007 0" />
      <circle cx="12" cy="12" r="1.4" {...A} />
    </>
  )
}

export function Ico({ n, size = 16 }: { n: IconeMs; size?: number }): ReactElement {
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
    >
      {P[n]}
    </svg>
  )
}
