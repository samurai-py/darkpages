import type { ReactElement } from 'react'

/** Ícones das ferramentas do editor de mapas, no mesmo traço do conjunto do Darkpages. */

const D = { fill: 'currentColor', fillOpacity: 0.16 } as const
const A = { style: { fill: 'var(--acc)' }, stroke: 'none' } as const
const AS = { style: { stroke: 'var(--acc)' } } as const

export type IconeMapa =
  | 'selecionar' | 'terra' | 'agua' | 'montanha' | 'floresta' | 'cidade' | 'vila' | 'castelo' | 'ruina' | 'torre'
  | 'porto' | 'navio' | 'monstro' | 'carimbo' | 'rio' | 'rota' | 'texto' | 'ligar' | 'borracha'
  | 'desfazer' | 'refazer' | 'menos' | 'mais' | 'ajustar' | 'exportar' | 'fechar' | 'novo' | 'abrir'

const P: Record<IconeMapa, ReactElement> = {
  selecionar: (
    <>
      <path d="M5 3.5l13 7.2-5.6 1.6 3.4 6.4-2.4 1.3-3.4-6.4L5.6 17.5z" {...D} />
      <path d="M5 3.5l13 7.2-5.6 1.6 3.4 6.4-2.4 1.3-3.4-6.4L5.6 17.5z" />
      <circle cx="5" cy="3.5" r="1" {...A} />
    </>
  ),
  terra: (
    <>
      <path d="M3.5 17c2-3 5-1.5 7-3.5s4-1 6 0 3 3.5 3.5 4.5c-3 1.5-13.5 2-16.5-1z" {...D} />
      <path d="M3.5 17c2-3 5-1.5 7-3.5s4-1 6 0 3 3.5 3.5 4.5c-3 1.5-13.5 2-16.5-1z" />
      <path d="M20 3.5l-7 7.4M12.2 11.7c-1.4-.3-2.6.5-2.6 1.9" />
      <circle cx="20" cy="3.5" r="1" {...A} />
    </>
  ),
  agua: (
    <>
      <path d="M12 3.5c3 4 5 6.6 5 9.2a5 5 0 01-10 0c0-2.6 2-5.2 5-9.2z" {...D} />
      <path d="M12 3.5c3 4 5 6.6 5 9.2a5 5 0 01-10 0c0-2.6 2-5.2 5-9.2z" />
      <path d="M3 20.5c2-1.2 3.5-1.2 5.5 0s3.5 1.2 5.5 0 3.5-1.2 5.5 0" />
      <path d="M10 13.4c.2 1.2 1 2 2 2.2" {...AS} />
    </>
  ),
  montanha: (
    <>
      <path d="M2.5 19.5l6-11 3.5 5.5 2.5-3.5 7 9z" {...D} />
      <path d="M2.5 19.5l6-11 3.5 5.5 2.5-3.5 7 9z" />
      <path d="M8.5 8.5l-1.6 11M14.5 10.5l-1 9" />
      <path d="M8.5 8.5l1.3 2.3" {...AS} />
    </>
  ),
  floresta: (
    <>
      <path d="M8 3.5c2.8 0 4.6 2.4 4.6 5.1S10.5 13 8 13s-4.6-1.7-4.6-4.4S5.2 3.5 8 3.5z" {...D} />
      <path d="M8 3.5c2.8 0 4.6 2.4 4.6 5.1S10.5 13 8 13s-4.6-1.7-4.6-4.4S5.2 3.5 8 3.5zM8 13v7.5" />
      <path d="M16.5 7.5c2.4 0 4 2 4 4.3s-1.8 3.7-4 3.7-4-1.4-4-3.7 1.6-4.3 4-4.3zM16.5 15.5v5M3.5 20.5h17" />
      <circle cx="16.5" cy="11.5" r="1" {...A} />
    </>
  ),
  cidade: (
    <>
      <path d="M3.5 20.5V11h3v2.5h3V6h2V3.5l2.5 2.5v7.5h3V11h3.5v9.5z" {...D} />
      <path d="M3.5 20.5V11h3v2.5h3V6h2V3.5l2.5 2.5v7.5h3V11h3.5v9.5zM10.5 20.5v-4h3v4" />
      <path d="M11.5 3.5V1.5l2 .9-2 .9" {...AS} />
    </>
  ),
  vila: (
    <>
      <path d="M3 20V13l4-4 4 4v7zM13 20v-5l4-3.6 4 3.6v5z" {...D} />
      <path d="M3 20V13l4-4 4 4v7zM13 20v-5l4-3.6 4 3.6v5zM2 20.5h20" />
      <path d="M6 20v-3h2v3" {...AS} />
    </>
  ),
  castelo: (
    <>
      <path d="M4 20.5V9h3v3h2.5V5H11V2.5l2.5 2.5v7H16V9h3.5v11.5z" {...D} />
      <path d="M4 20.5V9h3v3h2.5V5H11V2.5l2.5 2.5v7H16V9h3.5v11.5z" />
      <path d="M10 20.5v-4a1.8 1.8 0 013.6 0v4" {...AS} />
    </>
  ),
  ruina: (
    <>
      <path d="M4 19.5V9h3v10.5zM10.5 19.5V5h3v14.5zM17 19.5v-7h3v7z" {...D} />
      <path d="M4 19.5V9l1.5 1L7 9v10.5M10.5 19.5V5l1.5 1.4L13.5 5v14.5M17 19.5v-7l1.5.8 1.5-.8v7M2.5 19.5h19" />
      <circle cx="15.3" cy="18.4" r=".9" {...A} />
    </>
  ),
  torre: (
    <>
      <path d="M8.5 20.5V8h7v12.5z" {...D} />
      <path d="M8.5 20.5V8h7v12.5zM7.5 8V4h2v1.6h1.6V4h1.8v1.6h1.6V4h2v4M6 20.5h12" />
      <path d="M11.4 11.5h1.2v2.6h-1.2z" {...A} />
    </>
  ),
  porto: (
    <>
      <path d="M2.5 13.5h19v2h-19z" {...D} />
      <path d="M2.5 13.5h19v2h-19zM6 15.5v3.5M11 15.5v3.5M16 15.5v3.5M15 13.5V4l5 7.5h-5" />
      <path d="M2 21.5c1.6-.8 2.8-.8 4.4 0s2.8.8 4.4 0 2.8-.8 4.4 0 2.8.8 4.4 0" {...AS} />
    </>
  ),
  navio: (
    <>
      <path d="M3 15h18l-3 4.5H6z" {...D} />
      <path d="M3 15h18l-3 4.5H6zM12 15V3M12 4c4 1 6 4 6 8.5h-6M12 6c-3 1-5 3-5 6.5h5" />
      <path d="M12 3l2.6 1-2.6 1" {...AS} />
    </>
  ),
  monstro: (
    <>
      <path d="M2.5 16c2.3-4.5 4.4-4.5 6 0zM10 16c2.3-6 5-6 6.6 0z" {...D} />
      <path d="M2.5 16c2.3-4.5 4.4-4.5 6 0M10 16c2.3-6 5-6 6.6 0M17.5 16c.4-6.5 3.6-9 5-7-.9.6-2 .8-2 1.8 0 1.5.6 3 .6 5.2" />
      <path d="M1.5 19c2-.9 3.4-.9 5.4 0s3.4.9 5.4 0 3.4-.9 5.4 0 3.4.9 5.4 0" />
      <circle cx="21" cy="9.9" r=".8" {...A} />
    </>
  ),
  carimbo: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" {...D} />
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <path d="M17 13.5v7M13.5 17h7" {...AS} />
    </>
  ),
  rio: (
    <>
      <path d="M7 3.5c3 3-2.5 5.5.5 8.5s-2.5 6 .5 8.5" />
      <path d="M14 3.5c3 3-2.5 5.5.5 8.5s-2.5 6 .5 8.5" />
      <path d="M7.5 12c2 .2 4 .2 6.5 0" strokeDasharray="1 1.8" />
      <circle cx="15" cy="20.5" r="1" {...A} />
    </>
  ),
  rota: (
    <>
      <path d="M4 19c3-1 4-5 7.5-5.5S17 12 18 7" strokeDasharray="2 2.4" />
      <circle cx="4" cy="19" r="1.6" {...D} />
      <circle cx="4" cy="19" r="1.6" />
      <path d="M18 7.8c-1.8-1.7-2.8-3-2.8-4.2a2.8 2.8 0 015.6 0c0 1.2-1 2.5-2.8 4.2z" {...D} />
      <path d="M18 7.8c-1.8-1.7-2.8-3-2.8-4.2a2.8 2.8 0 015.6 0c0 1.2-1 2.5-2.8 4.2z" />
      <circle cx="18" cy="3.7" r=".9" {...A} />
    </>
  ),
  texto: (
    <>
      <path d="M5.5 7V4.8h13V7M12 4.8v14.4M9.4 19.2h5.2" />
      <path d="M5.5 4.8h1.6M16.9 4.8h1.6" {...AS} />
    </>
  ),
  ligar: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
      <circle cx="18.6" cy="18.6" r="2" {...A} />
    </>
  ),
  borracha: (
    <>
      <path d="M14.5 4.5l5 5-8 8H8l-3.5-3.5z" {...D} />
      <path d="M14.5 4.5l5 5-8 8H8l-3.5-3.5zM9.5 9.5l5 5M8 17.5h12.5" />
      <path d="M4.5 14l3.5 3.5" {...AS} />
    </>
  ),
  desfazer: (
    <>
      <path d="M8.5 5L4 9.5 8.5 14" />
      <path d="M4 9.5h10a5.5 5.5 0 010 11h-3" />
    </>
  ),
  refazer: (
    <>
      <path d="M15.5 5L20 9.5 15.5 14" />
      <path d="M20 9.5H10a5.5 5.5 0 000 11h3" />
    </>
  ),
  menos: <path d="M5 12h14" />,
  mais: <path d="M5 12h14M12 5v14" />,
  ajustar: (
    <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" {...D} />
    </>
  ),
  exportar: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
      <path d="M4 15.5v4h16v-4" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  novo: (
    <>
      <path d="M5 3.5h9l5 5v12H5z" {...D} />
      <path d="M5 3.5h9l5 5v12H5zM12 10.5v6M9 13.5h6" />
    </>
  ),
  abrir: <path d="M9 6h9v9M18 6L6 18" />
}

export function IconeM({ nome, size = 20 }: { nome: IconeMapa; size?: number }): ReactElement {
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
      {P[nome]}
    </svg>
  )
}
