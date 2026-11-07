import { useId, type ReactElement } from 'react'
import type { EstiloArte, Paleta } from './api'

/**
 * Prévias desenhadas de cada estilo (SVG próprio, sem imagem gerada): dão uma
 * ideia do traço e da paleta antes de gastar uma geração. As cores aqui são
 * da ilustração, não da interface, então não seguem o tema.
 */

function Gravura({ uid }: { uid: string }): ReactElement {
  return (
    <>
      <defs>
        <pattern id={`${uid}h`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M0 0v4" stroke="#000" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="#EFE3C6" />
      <rect width="120" height="120" fill={`url(#${uid}h)`} opacity=".25" />
      <circle cx="82" cy="34" r="16" fill="#EFE3C6" stroke="#2E2416" strokeWidth="1.2" />
      <path d="M50 120V64l5-10h2v-8l4-8 4 8v8h2l5 10v56z" fill="#EFE3C6" stroke="#2E2416" strokeWidth="1.4" />
      <path d="M52 120V70M56 120V68M60 120V66M64 120V68M68 120V70" stroke="#2E2416" strokeWidth=".6" />
      <path d="M0 120v-24h14v-8h10v32zM90 120V96h12v-10h18v34z" fill="#2E2416" />
    </>
  )
}

function Xilo(): ReactElement {
  return (
    <>
      <rect width="120" height="120" fill="#E9DFCB" />
      <path d="M0 0h120v70c-20-8-40 6-60-4S20 60 0 70z" fill="#141210" />
      <circle cx="84" cy="30" r="14" fill="#E9DFCB" />
      <path d="M78 26h12M76 32h16" stroke="#141210" strokeWidth="2" />
      <path d="M44 120V60l8-14 8 14v60z" fill="#141210" />
      <path d="M10 120c10-30 20-30 30 0zM70 120c10-24 30-24 40 0z" fill="#8A2A1E" />
    </>
  )
}

function Nouveau(): ReactElement {
  return (
    <>
      <rect width="120" height="120" fill="#1E2A26" />
      <path d="M20 120V50a40 40 0 0180 0v70" fill="#2E4038" stroke="#C9A55A" strokeWidth="2" />
      <path d="M28 120V52a32 32 0 0164 0v68" fill="none" stroke="#C9A55A" strokeWidth=".8" />
      <path d="M60 18c-8 10-8 20 0 30 8-10 8-20 0-30z" fill="#C9A55A" />
      <path d="M20 80c10-6 14-16 10-26M100 80c-10-6-14-16-10-26" fill="none" stroke="#C9A55A" strokeWidth="1.2" />
      <circle cx="60" cy="74" r="12" fill="#E9DDBF" />
    </>
  )
}

function Aquarela({ uid }: { uid: string }): ReactElement {
  return (
    <>
      <defs>
        <filter id={`${uid}w`}>
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <rect width="120" height="120" fill="#F4F0E8" />
      <g filter={`url(#${uid}w)`}>
        <circle cx="40" cy="40" r="26" fill="#9CB8D6" opacity=".8" />
        <circle cx="82" cy="34" r="20" fill="#E8B4A0" opacity=".8" />
        <ellipse cx="60" cy="94" rx="50" ry="18" fill="#7FA38A" opacity=".8" />
      </g>
      <path d="M56 104V62l4-8 4 8v42z" fill="#3A4A5C" opacity=".85" />
    </>
  )
}

function Nanquim(): ReactElement {
  return (
    <>
      <rect width="120" height="120" fill="#F2F2F0" />
      <path d="M10 96c20-6 40-30 54-62M30 110c26-10 50-36 66-80" stroke="#0A0A0A" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M14 40c18 4 30 0 46-10" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="90" cy="86" r="10" fill="#C1121F" />
    </>
  )
}

function Ornamento(): ReactElement {
  return (
    <>
      <rect width="120" height="120" fill="#101010" />
      <g fill="none" stroke="#D9D9D9" strokeWidth="1.4">
        <path d="M60 60c-14-20-34-20-40-8s8 22 18 14-2-16-8-10" />
        <path d="M60 60c14-20 34-20 40-8s-8 22-18 14 2-16 8-10" />
        <path d="M60 60c-14 20-34 20-40 8s8-22 18-14-2 16-8 10" />
        <path d="M60 60c14 20 34 20 40 8s-8-22-18-14 2 16 8 10" />
      </g>
      <path d="M60 50l6 10-6 10-6-10z" fill="#C1121F" />
    </>
  )
}

const TINTA: Record<Paleta, { fundo: string; traco: string; acento: string }> = {
  mono: { fundo: '#F2F2F0', traco: '#111111', acento: '#6B6B6B' },
  sepia: { fundo: '#EFE3C6', traco: '#2E2416', acento: '#8A6A3E' },
  cor: { fundo: '#EDE7DB', traco: '#2B3A4A', acento: '#B5523B' }
}

/** Estilo personalizado sem base: monograma com a paleta escolhida. */
function Proprio({ estilo }: { estilo: EstiloArte }): ReactElement {
  const t = TINTA[estilo.paleta]
  const letra = (estilo.nome.trim()[0] ?? '?').toUpperCase()
  return (
    <>
      <rect width="120" height="120" fill={t.fundo} />
      <rect x="14" y="14" width="92" height="92" fill="none" stroke={t.traco} strokeWidth="1.2" />
      <rect x="19" y="19" width="82" height="82" fill="none" stroke={t.traco} strokeWidth=".6" />
      <path d="M14 14l10 10M106 14l-10 10M14 106l10-10M106 106l-10-10" stroke={t.acento} strokeWidth="1.4" />
      <text x="60" y="76" textAnchor="middle" fontFamily="Georgia, serif" fontSize="46" fill={t.traco}>
        {letra}
      </text>
    </>
  )
}

export function PreviaEstilo({ estilo }: { estilo: EstiloArte }): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = estilo.preset ? estilo.id : estilo.base ?? ''
  let corpo: ReactElement
  switch (id) {
    case 'gravura-pena': corpo = <Gravura uid={uid} />; break
    case 'xilogravura': corpo = <Xilo />; break
    case 'art-nouveau': corpo = <Nouveau />; break
    case 'aquarela': corpo = <Aquarela uid={uid} />; break
    case 'nanquim': corpo = <Nanquim />; break
    case 'ornamento': corpo = <Ornamento />; break
    default: corpo = <Proprio estilo={estilo} />
  }
  return (
    <svg className="arte-previa" viewBox="0 0 120 120" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {corpo}
      {!estilo.preset && estilo.base && (
        <g>
          <rect x="84" y="6" width="30" height="16" rx="8" fill="rgba(0,0,0,.6)" />
          <text x="99" y="17.5" textAnchor="middle" fontSize="9" fontFamily="sans-serif" fill="#fff">seu</text>
        </g>
      )}
    </svg>
  )
}

/** Ícones de traço próprios da tela Arte (mesma gramática de icons.tsx). */
export type IconeArte = 'cadeado' | 'dado' | 'faisca' | 'refazer' | 'abrir' | 'parar' | 'mais' | 'lapis' | 'lixo' | 'fechar' | 'camadas'

const ICONES: Record<IconeArte, ReactElement> = {
  cadeado: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" fillOpacity=".16" />
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" />
      <circle cx="12" cy="15.5" r="1.2" style={{ fill: 'var(--acc)' }} stroke="none" />
    </>
  ),
  dado: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill="currentColor" fillOpacity=".16" />
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" style={{ fill: 'var(--acc)' }} stroke="none" />
    </>
  ),
  faisca: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" fillOpacity=".16" />
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 16.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" style={{ fill: 'var(--acc)' }} stroke="none" />
    </>
  ),
  refazer: (
    <>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
      <path d="M19.8 4.2v3.6h-3.6" />
      <circle cx="12" cy="12" r="1.3" style={{ fill: 'var(--acc)' }} stroke="none" />
    </>
  ),
  abrir: (
    <>
      <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" fillOpacity=".16" />
    </>
  ),
  parar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" fillOpacity=".3" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  lapis: (
    <>
      <path d="M15.5 4.5l4 4L9 19H5v-4z" fill="currentColor" fillOpacity=".16" />
      <path d="M15.5 4.5l4 4L9 19H5v-4zM13.5 6.5l4 4" />
    </>
  ),
  lixo: (
    <>
      <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  camadas: (
    <>
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5z" fill="currentColor" fillOpacity=".16" />
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
    </>
  )
}

export function Ic({ nome, tam = 16 }: { nome: IconeArte; tam?: number }): ReactElement {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nome]}
    </svg>
  )
}
