import type { ReactElement } from 'react'
import type { MapaEstilo, SimboloCamada, SimboloTipo } from './types'

/**
 * Biblioteca de símbolos cartográficos própria. Cada símbolo tem uma geometria
 * única desenhada com "materiais" (pedra, verde, telha…); a paleta decide se vira
 * traço à pena (tinta + hachura sobre pergaminho) ou versão colorida.
 */

export interface Paleta {
  ink: string
  paper: string
  /** preenchimento do lado em sombra (hachura no estilo à pena) */
  sombra: string
  neve: string
  verde: string
  verde2: string
  pedra: string
  pedra2: string
  telha: string
  madeira: string
  agua: string
  fogo: string
  solido: string
  escama: string
  /** ondas e redemoinhos sobre a água */
  onda: string
}

export function paleta(estilo: MapaEstilo, p: string): Paleta {
  if (estilo === 'pena') {
    const hatch = `url(#${p}hatch)`
    return {
      ink: '#3B2E1E', paper: '#F4EAD2', sombra: hatch, neve: '#F4EAD2', verde: '#F1E6CA', verde2: hatch,
      pedra: '#F4EAD2', pedra2: hatch, telha: '#3B2E1E', madeira: '#E9DDBF', agua: '#3B2E1E', fogo: '#3B2E1E', solido: '#3B2E1E', escama: '#F4EAD2', onda: '#3B2E1E'
    }
  }
  return {
    ink: '#2B2117', paper: '#F3EBD8', sombra: 'rgba(34,24,12,.32)', neve: '#F8F6F0', verde: '#5E8B47', verde2: '#3E6833',
    pedra: '#A99E8B', pedra2: '#6E6455', telha: '#A8432E', madeira: '#8A5A33', agua: '#3F7896', fogo: '#D2541E', solido: '#8E8676', escama: '#4E7A6A', onda: '#E3EEF2'
  }
}

interface Def {
  nome: string
  camada: SimboloCamada
  /** viewBox */
  w: number
  h: number
  /** largura padrão em unidades do mapa */
  base: number
  draw: (c: Paleta) => ReactElement
}

const S = (c: Paleta, w = 1): { stroke: string; strokeWidth: number; strokeLinejoin: 'round'; strokeLinecap: 'round' } => ({
  stroke: c.ink,
  strokeWidth: w,
  strokeLinejoin: 'round',
  strokeLinecap: 'round'
})

export const SIMBOLOS: Record<SimboloTipo, Def> = {
  montanha: {
    nome: 'Montanha', camada: 'relevo', w: 40, h: 26, base: 44,
    draw: (c) => (
      <>
        <path d="M1 25L15 4l7 9 5-6 12 18z" fill={c.pedra} {...S(c, 1.3)} />
        <path d="M15 4l7 9 5-6 12 18H17z" fill={c.sombra} />
        <path d="M15 4l-3 21M15 4l2 7M27 7l-2 18M9 14l-2 5M20 16l-1 4" fill="none" {...S(c, 0.7)} />
        <path d="M1 25L15 4l7 9 5-6 12 18" fill="none" {...S(c, 1.3)} />
      </>
    )
  },
  pico: {
    nome: 'Pico nevado', camada: 'relevo', w: 32, h: 30, base: 36,
    draw: (c) => (
      <>
        <path d="M1 29L16 2l15 27z" fill={c.pedra} />
        <path d="M16 2l3 27h12z" fill={c.sombra} />
        <path d="M16 2l-5 9 2.4-1 2.6 2.2 2.6-2.2 2.4 1z" fill={c.neve} {...S(c, 0.8)} />
        <path d="M16 12l-2 8M19 13l1 9M10 20l-2 5" fill="none" {...S(c, 0.6)} />
        <path d="M1 29L16 2l15 27" fill="none" {...S(c, 1.3)} />
      </>
    )
  },
  colina: {
    nome: 'Colina', camada: 'relevo', w: 30, h: 14, base: 30,
    draw: (c) => (
      <>
        <path d="M1 13C6 4 12 2 16 3s9 5 13 10z" fill={c.verde} />
        <path d="M16 3c4 1 9 5 13 10H18c1-3 0-7-2-10z" fill={c.sombra} />
        <path d="M1 13C6 4 12 2 16 3s9 5 13 10" fill="none" {...S(c, 1.2)} />
        <path d="M18 7l-1.5 3M22 9l-1.5 3M8 9l-1 2" fill="none" {...S(c, 0.6)} />
      </>
    )
  },
  vulcao: {
    nome: 'Vulcão', camada: 'relevo', w: 36, h: 30, base: 44,
    draw: (c) => (
      <>
        <path d="M1 29L13 9h10l12 20z" fill={c.pedra} {...S(c, 1.3)} />
        <path d="M23 9l12 20H25z" fill={c.sombra} />
        <path d="M13 9c2 1.6 8 1.6 10 0" fill="none" {...S(c, 1)} />
        <path d="M17 10l-2 8 3-3 1 6 2-10z" fill={c.fogo} />
        <path d="M17 6c-2-2 0-4 2-3s3.5-2 5-.5 3 0 3 0" fill="none" {...S(c, 0.8)} />
        <path d="M14 3c-1.5-1.5 0-3 1.6-2.4" fill="none" {...S(c, 0.6)} />
      </>
    )
  },
  arvore: {
    nome: 'Árvore', camada: 'vegetacao', w: 12, h: 14, base: 13,
    draw: (c) => (
      <>
        <path d="M6 1c3 0 5 2.4 5 5.2S8.6 11 6 11 1 9 1 6.2 3 1 6 1z" fill={c.verde} />
        <path d="M6 11c2.6 0 5-1.6 5-4.8 0-1.5-.6-2.9-1.6-3.8.3 3.6-1.5 7.2-3.4 8.6z" fill={c.verde2} />
        <path d="M6 1c3 0 5 2.4 5 5.2S8.6 11 6 11 1 9 1 6.2 3 1 6 1zM6 11v3" fill="none" {...S(c, 0.9)} />
        <path d="M4 4.5c1 2 1 3 .6 5" fill="none" {...S(c, 0.5)} />
      </>
    )
  },
  pinheiro: {
    nome: 'Pinheiro', camada: 'vegetacao', w: 10, h: 16, base: 11,
    draw: (c) => (
      <>
        <path d="M5 1L1.5 8h2L1 12.5h8L6.5 8h2z" fill={c.verde} />
        <path d="M5 1l3.5 7h-2L9 12.5H5z" fill={c.verde2} />
        <path d="M5 1L1.5 8h2L1 12.5h8L6.5 8h2zM5 12.5v3" fill="none" {...S(c, 0.8)} />
      </>
    )
  },
  palmeira: {
    nome: 'Palmeira', camada: 'vegetacao', w: 16, h: 18, base: 16,
    draw: (c) => (
      <>
        <path d="M8 17c0-4 1.2-8 0-11" fill="none" {...S(c, 1.1)} />
        <path d="M8 6C5 2.5 2 3.5 1 6.5 3 5 5.5 5 8 6zM8 6c3-3.5 6-2.5 7 .5C13 5 10.5 5 8 6zM8 6C7 3 8 1 10 .8 9 2.5 8.6 4 8 6zM8 6c-3 .2-5 2-5.2 4.6C4.4 8.6 6 7.2 8 6zM8 6c3 .2 5 2 5.2 4.6C11.6 8.6 10 7.2 8 6z" fill={c.verde} {...S(c, 0.6)} />
        <path d="M5 17h6" fill="none" {...S(c, 0.6)} />
      </>
    )
  },
  pantano: {
    nome: 'Pântano', camada: 'vegetacao', w: 22, h: 12, base: 24,
    draw: (c) => (
      <>
        <path d="M1 10h6M9 11h7M14 8h7M3 7h4" fill="none" {...S(c, 0.7)} stroke={c.agua} />
        <path d="M4 10V5M5 10l1.2-4.4M3 10L1.8 6.4M12 11V6M13 11l1.2-4M11 11l-1.3-3.6M18 8V3.5M19 8l1-3.4M17 8l-1-3" fill="none" {...S(c, 0.7)} />
      </>
    )
  },
  arbusto: {
    nome: 'Arbustos', camada: 'vegetacao', w: 14, h: 8, base: 14,
    draw: (c) => (
      <>
        <path d="M1 7c0-3 2-4 3.5-3 .5-2 3-2.5 4-.5 1-2 4-1.5 4 1 1 0 1.5 1.5 0 2.5z" fill={c.verde} {...S(c, 0.7)} />
        <path d="M8.5 3.5c.3 1.3 0 2.5-.6 3.5M12.5 4.5c0 1-.3 1.8-.8 2.5" fill="none" {...S(c, 0.5)} />
      </>
    )
  },
  cidade: {
    nome: 'Cidade', camada: 'simbolos', w: 26, h: 20, base: 28,
    draw: (c) => (
      <>
        <path d="M2 19v-9l3-3 3 3v9zM8 19V6h4V3l2-2 2 2v3h2v13zM18 19v-7l3-3 3 3v7z" fill={c.paper} {...S(c, 1)} />
        <path d="M2 10l3-3 3 3zM12 3l2-2 2 2zM18 12l3-3 3 3z" fill={c.telha} {...S(c, 0.8)} />
        <path d="M16 6h2v13h-2z" fill={c.sombra} />
        <path d="M10 9h1.4v2H10zM13.2 9h1.4v2h-1.4zM4.3 13h1.4v2H4.3zM20.3 14h1.4v2h-1.4zM12.5 15h2.6v4h-2.6z" fill={c.ink} />
        <path d="M1 19h24" fill="none" {...S(c, 1.1)} />
      </>
    )
  },
  capital: {
    nome: 'Capital', camada: 'simbolos', w: 30, h: 26, base: 36,
    draw: (c) => (
      <>
        <path d="M1 25V15h3v-2h2v2h3V9h3V6l3-3 3 3v3h3v6h3v-2h2v2h3v10z" fill={c.paper} {...S(c, 1.1)} />
        <path d="M12 6l3-3 3 3z" fill={c.telha} {...S(c, 0.8)} />
        <path d="M18 9h3v16h-3zM26 15h3v10h-3z" fill={c.sombra} />
        <path d="M13 25v-4a2 2 0 014 0v4z" fill={c.ink} />
        <path d="M15 3V0.6l3 1-3 1" fill={c.telha} {...S(c, 0.6)} />
        <path d="M13.6 11h1.2v2h-1.2zM16 11h1.2v2H16zM3 18h1.2v2H3zM25 18h1.2v2H25z" fill={c.ink} />
        <path d="M0.5 25h29" fill="none" {...S(c, 1.2)} />
      </>
    )
  },
  vila: {
    nome: 'Vila', camada: 'simbolos', w: 16, h: 12, base: 18,
    draw: (c) => (
      <>
        <path d="M1 11V6l3-3 3 3v5zM8 11V7l3.5-3L15 7v4z" fill={c.paper} {...S(c, 0.9)} />
        <path d="M1 6l3-3 3 3zM8 7l3.5-3L15 7z" fill={c.telha} {...S(c, 0.7)} />
        <path d="M3.4 8h1.3v3H3.4zM11 8.5h1.3v2.5H11z" fill={c.ink} />
      </>
    )
  },
  castelo: {
    nome: 'Castelo', camada: 'simbolos', w: 24, h: 22, base: 28,
    draw: (c) => (
      <>
        <path d="M3 21V9h3v3h3V5h2V2l3 3v7h3V9h3v12z" fill={c.solido} {...S(c, 0.9)} />
        <path d="M14 5v16h7V9h-3v3h-3V5z" fill={c.sombra} />
        <path d="M10 21v-5a2 2 0 014 0v5z" fill={c.paper} {...S(c, 0.7)} />
        <path d="M11 2V-0.4l2.4.8-2.4.8" fill={c.telha} {...S(c, 0.5)} />
      </>
    )
  },
  ruina: {
    nome: 'Ruína', camada: 'simbolos', w: 20, h: 16, base: 22,
    draw: (c) => (
      <>
        <path d="M2 15V6h3v9zM8 15V3h3v12zM14 15V8h3v7z" fill={c.pedra} />
        <path d="M2 15V6l1.5 1L5 6v9M8 15V3l1.6 1.4L11 3v12M14 15V8l1.5.8L17 8v7M1 15h18" fill="none" {...S(c, 1.2)} />
        <path d="M5.5 14.5h1.5v-1H5.5zM12 14.5h1.4v-1.2H12zM18 14.5h1v-.8h-1z" fill={c.ink} />
      </>
    )
  },
  torre: {
    nome: 'Torre', camada: 'simbolos', w: 12, h: 24, base: 14,
    draw: (c) => (
      <>
        <path d="M3 23V7h6v16z" fill={c.paper} {...S(c, 1)} />
        <path d="M7 7h2v16H7z" fill={c.sombra} />
        <path d="M2 7V3.5h2v1.5h1.3V3.5h1.4v1.5H8V3.5h2V7z" fill={c.paper} {...S(c, 0.9)} />
        <path d="M5.4 10h1.2v2.6H5.4zM5.4 16h1.2v2.6H5.4z" fill={c.ink} />
        <path d="M1.5 23h9" fill="none" {...S(c, 1)} />
      </>
    )
  },
  porto: {
    nome: 'Porto', camada: 'simbolos', w: 26, h: 18, base: 26,
    draw: (c) => (
      <>
        <path d="M2 11V6l3-3 3 3v5zM8 11V7h5v4z" fill={c.paper} {...S(c, 0.9)} />
        <path d="M2 6l3-3 3 3z" fill={c.telha} {...S(c, 0.7)} />
        <path d="M1 11h23v1.6H1z" fill={c.madeira} {...S(c, 0.8)} />
        <path d="M11 12.6v3M15 12.6v3M19 12.6v3M23 12.6v3" fill="none" {...S(c, 0.8)} />
        <path d="M20 11V3l3.5 6.5H20" fill={c.paper} {...S(c, 0.7)} />
        <path d="M1 16.5c2-1 3-1 5 0s3 1 5 0 3-1 5 0 3 1 5 0" fill="none" {...S(c, 0.6)} stroke={c.onda} />
      </>
    )
  },
  templo: {
    nome: 'Templo', camada: 'simbolos', w: 24, h: 18, base: 24,
    draw: (c) => (
      <>
        <path d="M2 7L12 2l10 5z" fill={c.telha} {...S(c, 0.9)} />
        <path d="M3 7h18v1.6H3zM2 15.4h20V17H2z" fill={c.paper} {...S(c, 0.8)} />
        <path d="M5 8.6v6.8M9.5 8.6v6.8M14.5 8.6v6.8M19 8.6v6.8" fill="none" {...S(c, 1.2)} />
        <circle cx="12" cy="5" r="1" fill={c.paper} />
      </>
    )
  },
  farol: {
    nome: 'Farol', camada: 'simbolos', w: 14, h: 24, base: 14,
    draw: (c) => (
      <>
        <path d="M4.5 23L6 9h4l1.5 14z" fill={c.paper} {...S(c, 1)} />
        <path d="M5.3 14h5.4M4.8 19h6.4" fill="none" stroke={c.telha} strokeWidth={1.8} />
        <path d="M5.5 9V6h5v3z" fill={c.fogo} {...S(c, 0.8)} />
        <path d="M5 6l3-3 3 3z" fill={c.ink} />
        <path d="M1 7.5h3M12 7.5h3M2 4.5l2.5 1.5M14 4.5L11.5 6" fill="none" {...S(c, 0.6)} />
        <path d="M3 23h10" fill="none" {...S(c, 1)} />
      </>
    )
  },
  caverna: {
    nome: 'Caverna', camada: 'simbolos', w: 22, h: 14, base: 24,
    draw: (c) => (
      <>
        <path d="M1 13C3 5 7 2 11 2s8 3 10 11z" fill={c.pedra} />
        <path d="M11 2c4 0 8 3 10 11h-5c0-5-2-9-5-11z" fill={c.sombra} />
        <path d="M1 13C3 5 7 2 11 2s8 3 10 11z" fill="none" {...S(c, 1.1)} />
        <path d="M7 13c0-4 1.8-6 4-6s4 2 4 6z" fill={c.ink} />
      </>
    )
  },
  mina: {
    nome: 'Mina', camada: 'simbolos', w: 20, h: 16, base: 22,
    draw: (c) => (
      <>
        <path d="M1 15c2-5 6-7 9-7s7 2 9 7z" fill={c.pedra} {...S(c, 1)} />
        <path d="M5 2l10 10M15 2L5 12" fill="none" {...S(c, 1.3)} />
        <path d="M2.6 3.8C3.6 1.6 5.6 1 7 1.6M17.4 3.8C16.4 1.6 14.4 1 13 1.6" fill="none" {...S(c, 1.1)} />
        <path d="M8.5 15v-2.5a1.5 1.5 0 013 0V15z" fill={c.ink} />
      </>
    )
  },
  acampamento: {
    nome: 'Acampamento', camada: 'simbolos', w: 20, h: 14, base: 22,
    draw: (c) => (
      <>
        <path d="M1 13L6 4l5 9zM10 13l4.5-7.5L19 13z" fill={c.paper} {...S(c, 0.9)} />
        <path d="M6 4l5 9H8zM14.5 5.5L19 13h-2.6z" fill={c.sombra} />
        <path d="M6 13V9l1.6 4M14.5 13v-3.4l1.4 3.4" fill="none" {...S(c, 0.7)} />
        <path d="M6 4V1.5l2 .8-2 .8" fill={c.telha} {...S(c, 0.5)} />
      </>
    )
  },
  ponte: {
    nome: 'Ponte', camada: 'simbolos', w: 24, h: 12, base: 26,
    draw: (c) => (
      <>
        <path d="M1 5h22v2H1z" fill={c.paper} {...S(c, 0.9)} />
        <path d="M2 7v4h3a7 4.5 0 0114 0h3V7z" fill={c.pedra} {...S(c, 0.9)} />
        <path d="M3 5V3M7 5V3M11 5V3M15 5V3M19 5V3M21 5V3M2 3h20" fill="none" {...S(c, 0.6)} />
      </>
    )
  },
  navio: {
    nome: 'Navio', camada: 'simbolos', w: 24, h: 22, base: 34,
    draw: (c) => (
      <>
        <path d="M2 15h20l-3 4.5H5z" fill={c.madeira} {...S(c, 1)} />
        <path d="M12 15V2" fill="none" {...S(c, 1)} />
        <path d="M12 3c4 1 6 4 6 9.5h-6zM12 5c-3 1-5 3.5-5 7.5h5z" fill={c.paper} {...S(c, 0.8)} />
        <path d="M12 3c4 1 6 4 6 9.5h-2c0-4-1.5-7-4-9.5z" fill={c.sombra} />
        <path d="M12 2l3 1-3 1z" fill={c.telha} />
        <path d="M1 21c2-1 3-1 5 0s3 1 5 0 3-1 5 0 3 1 5 0" fill="none" {...S(c, 0.6)} stroke={c.onda} />
      </>
    )
  },
  monstro: {
    nome: 'Monstro marinho', camada: 'simbolos', w: 34, h: 20, base: 52,
    draw: (c) => (
      <>
        <path d="M2 15c3-6 6-6 8 0zM12 15c3-8 7-8 9 0zM23 15c.6-8.5 5.5-12.2 9.2-9.4-1.2.8-3.2 1-3.2 2.4 0 2 1 4 1 7z" fill={c.escama} {...S(c, 1)} />
        <path d="M5 11l-.6-1.8M8 11.4l.5-1.8M15 9.4l-.4-2M18 9.4l.6-2" fill="none" {...S(c, 0.7)} />
        <circle cx="29.4" cy="7.4" r=".9" fill={c.ink} />
        <path d="M0.5 15.4c2.5 1 4 1 6 0s4-1 6 0 4 1 6 0 4-1 6 0 4 1 6 0 2.5-1 3 0" fill="none" {...S(c, 0.7)} stroke={c.onda} />
        <path d="M3 18.5c2 .8 3.5.8 5 0M20 18.5c2 .8 3.5.8 5 0" fill="none" {...S(c, 0.5)} stroke={c.onda} />
      </>
    )
  },
  redemoinho: {
    nome: 'Redemoinho', camada: 'simbolos', w: 20, h: 20, base: 26,
    draw: (c) => (
      <path d="M10 10a1 1 0 112 0 3 3 0 11-6 0 5 5 0 1110 0 7 7 0 11-14 0 8.5 8.5 0 1117 0" fill="none" {...S(c, 0.9)} stroke={c.onda} />
    )
  },
  ancora: {
    nome: 'Âncora', camada: 'simbolos', w: 16, h: 18, base: 18,
    draw: (c) => (
      <>
        <circle cx="8" cy="2.4" r="1.6" fill="none" {...S(c, 1)} />
        <path d="M8 4v12.6M4 6.5h8M2 11c0 4 3 5.6 6 5.6s6-1.6 6-5.6" fill="none" {...S(c, 1.1)} />
        <path d="M.8 12.4L2 10l1.8 1.6M15.2 12.4L14 10l-1.8 1.6" fill="none" {...S(c, 1)} />
      </>
    )
  }
}

export const TIPOS = Object.keys(SIMBOLOS) as SimboloTipo[]

/** fator global: as bases foram desenhadas para um mapa de ~1000 unidades */
const BASE = 1.5

export function tamanho(tipo: SimboloTipo, escala: number): { w: number; h: number } {
  const d = SIMBOLOS[tipo]
  const w = d.base * BASE * escala
  return { w, h: (w * d.h) / d.w }
}

/** <symbol>s + padrões de hachura para um prefixo de ids. */
export function DefsSimbolos({ estilo, p }: { estilo: MapaEstilo; p: string }): ReactElement {
  const c = paleta(estilo, p)
  return (
    <>
      <pattern id={`${p}hatch`} width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
        <path d="M0 0v2.2" stroke={c.ink} strokeWidth=".55" />
      </pattern>
      {TIPOS.map((t) => {
        const d = SIMBOLOS[t]
        return (
          <symbol key={t} id={`${p}s-${t}`} viewBox={`0 0 ${d.w} ${d.h}`} overflow="visible">
            {d.draw(c)}
          </symbol>
        )
      })}
    </>
  )
}

/** Miniatura isolada de um símbolo (botões da biblioteca). */
export function SimboloMini({ tipo, estilo, size = 28 }: { tipo: SimboloTipo; estilo: MapaEstilo; size?: number }): ReactElement {
  const d = SIMBOLOS[tipo]
  const p = `mini-${tipo}-${estilo}-`
  const c = paleta(estilo, p)
  const pad = 2
  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${d.w + pad * 2} ${d.h + pad * 2}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={`${p}hatch`} width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <path d="M0 0v2.2" stroke={c.ink} strokeWidth=".55" />
        </pattern>
      </defs>
      {d.draw(c)}
    </svg>
  )
}
