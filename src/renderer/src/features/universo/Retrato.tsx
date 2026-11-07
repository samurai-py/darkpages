import { useEffect, useState, type ReactElement } from 'react'
import { folio } from '../../api'
import type { Ficha, FichaTipo } from '../../../../shared/models'
import { hash } from './fichas'

// ---------------------------------------------------------------------------
// Cache de retratos (data URLs) por livro. Evita reler o arquivo a cada render.
// ---------------------------------------------------------------------------
const cache = new Map<string, string | null>()
const pendentes = new Map<string, Promise<string | null>>()
const ouvintes = new Set<() => void>()

function chave(dir: string, nome: string): string {
  return `${dir}\u0000${nome}`
}

export function lerRetrato(dir: string, nome: string): Promise<string | null> {
  const k = chave(dir, nome)
  if (cache.has(k)) return Promise.resolve(cache.get(k) ?? null)
  const p =
    pendentes.get(k) ??
    folio.assets
      .get(dir, nome)
      .catch(() => null)
      .then((url) => {
        cache.set(k, url)
        pendentes.delete(k)
        return url
      })
  pendentes.set(k, p)
  return p
}

/** Grava no cache um retrato recém-enviado e avisa quem estiver mostrando. */
export function definirRetrato(dir: string, nome: string, url: string | null): void {
  cache.set(chave(dir, nome), url)
  for (const f of ouvintes) f()
}

/** Descarta o cache de retratos de um livro (ex.: depois de importar fichas). */
export function esquecerRetratos(dir: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${dir}\u0000`)) cache.delete(k)
  for (const f of ouvintes) f()
}

/** Retratos das fichas: id → data URL (ausente/nulo = usar silhueta). */
export function useRetratos(dir: string, fichas: Ficha[]): Record<string, string | null> {
  const [mapa, setMapa] = useState<Record<string, string | null>>({})
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const f = (): void => setVersao((v) => v + 1)
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [])
  const assinatura = fichas.map((f) => `${f.id}:${f.retrato}`).join('|')
  useEffect(() => {
    let vivo = true
    const comRetrato = fichas.filter((f) => f.retrato)
    void Promise.all(comRetrato.map(async (f) => [f.id, await lerRetrato(dir, f.retrato)] as const)).then((pares) => {
      if (vivo) setMapa(Object.fromEntries(pares))
    })
    return () => {
      vivo = false
    }
    // `fichas` entra pela assinatura (id + retrato), para não refazer a cada render
  }, [dir, assinatura, versao])
  return mapa
}

// ---------------------------------------------------------------------------
// Silhueta gerada: cores derivadas do nome, forma pelo tipo da ficha.
// ---------------------------------------------------------------------------
const PELES = ['#C9B79A', '#B39A7C', '#D1BBA0', '#A88E72', '#8C6E55', '#E0C9AE', '#6E5241']
const CABELOS = [
  'M34 46C34 26 66 26 66 46 62 36 40 34 34 46z',
  'M28 60C26 24 74 24 72 60 66 40 34 40 28 60z',
  'M33 44C30 22 70 22 67 44L70 84C64 70 62 60 62 50 58 38 42 38 38 50 38 60 36 70 30 84z',
  'M35 40C35 27 65 27 65 40 60 33 40 33 35 40zM44 24a7 6 0 1012 0 7 6 0 10-12 0',
  'M34 42C34 26 66 26 66 42 62 34 40 32 34 42z'
]
const CORES_CABELO = ['#0B0D14', '#5B4A37', '#E6E2DA', '#2A1A12', '#8A6A3A', '#C9A15A', '#3B2414']

export interface Paleta {
  fundo: string
  luz: string
  roupa: string
  borda: string
  pele: string
  cabelo: string
  corCabelo: string
}

export function paletaDe(nome: string): Paleta {
  const h = hash(nome || '?')
  const matiz = h % 360
  return {
    fundo: `hsl(${matiz} 34% 19%)`,
    luz: `hsl(${(matiz + 28) % 360} 55% 82%)`,
    roupa: `hsl(${matiz} 38% 8%)`,
    borda: `hsl(${(matiz + 40) % 360} 52% 62%)`,
    pele: PELES[(h >>> 8) % PELES.length] ?? '#C9B79A',
    cabelo: CABELOS[(h >>> 12) % CABELOS.length] ?? '',
    corCabelo: CORES_CABELO[(h >>> 16) % CORES_CABELO.length] ?? '#0B0D14'
  }
}

function Figura({ tipo, p }: { tipo: FichaTipo; p: Paleta }): ReactElement {
  switch (tipo) {
    case 'lugar':
      return (
        <>
          <path d="M0 92L22 70l14 10 22-26 20 18 22-12v60H0z" fill={p.roupa} />
          <path d="M40 98V54l8-10 8 10v44z" fill={p.borda} opacity=".85" />
          <path d="M44 62h8M44 72h8" stroke={p.roupa} strokeWidth="1.4" />
          <path d="M0 104c20-6 40 6 60 0s28-4 40 0v16H0z" fill={p.roupa} />
        </>
      )
    case 'objeto':
      return (
        <>
          <path d="M50 26l18 22-18 50-18-50z" fill={p.borda} opacity=".9" />
          <path d="M50 26l18 22H32zM50 98L41 48h18z" fill={p.luz} opacity=".35" />
          <path d="M50 26l18 22-18 50-18-50zM32 48h36" fill="none" stroke={p.roupa} strokeWidth="1.2" />
          <ellipse cx="50" cy="106" rx="26" ry="4" fill={p.roupa} />
        </>
      )
    case 'grupo':
      return (
        <>
          <path d="M2 120C5 96 16 88 28 88s23 8 26 32z" fill={p.roupa} opacity=".8" />
          <circle cx="28" cy="70" r="11" fill={p.pele} opacity=".8" />
          <path d="M46 120C49 96 60 88 72 88s23 8 26 32z" fill={p.roupa} opacity=".8" />
          <circle cx="72" cy="70" r="11" fill={p.pele} opacity=".8" />
          <path d="M22 120C26 92 38 82 50 82s24 10 28 38z" fill={p.roupa} />
          <path d="M40 84l10 13 10-13" fill="none" stroke={p.borda} strokeWidth="1.4" />
          <circle cx="50" cy="60" r="13" fill={p.pele} />
          <path d={p.cabelo} fill={p.corCabelo} transform="translate(5 9) scale(.9)" />
        </>
      )
    case 'divindade':
      return (
        <>
          <circle cx="50" cy="46" r="27" fill="none" stroke={p.borda} strokeWidth="1.4" />
          <path d="M50 12v8M50 72v8M16 46h8M76 46h8M26 22l6 6M68 64l6 6M74 22l-6 6M32 64l-6 6" stroke={p.borda} strokeWidth="1.4" />
          <path d="M14 120C18 88 34 76 50 76s32 12 36 44z" fill={p.roupa} />
          <path d="M38 78l12 16 12-16" fill="none" stroke={p.borda} strokeWidth="1.4" />
          <circle cx="50" cy="48" r="15" fill={p.pele} />
        </>
      )
    default:
      return (
        <>
          <path d="M14 120C18 88 34 76 50 76s32 12 36 44z" fill={p.roupa} />
          <path d="M38 78l12 16 12-16" fill="none" stroke={p.borda} strokeWidth="1.4" />
          <rect x="45" y="60" width="10" height="16" fill={p.pele} />
          <circle cx="50" cy="48" r="15" fill={p.pele} />
          <path d={p.cabelo} fill={p.corCabelo} />
        </>
      )
  }
}

/** Silhueta SVG (viewBox 100×120) para fichas sem retrato. */
export function Silhueta({ nome, tipo, className }: { nome: string; tipo: FichaTipo; className?: string }): ReactElement {
  const p = paletaDe(nome)
  return (
    <svg className={className} viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="120" fill={p.fundo} />
      <circle cx="68" cy="30" r="34" fill={p.luz} opacity=".3" />
      <circle cx="68" cy="30" r="18" fill={p.luz} opacity=".22" />
      <Figura tipo={tipo} p={p} />
      <rect width="100" height="120" fill="none" stroke={p.borda} strokeWidth=".6" opacity=".5" />
    </svg>
  )
}

/** Retrato da ficha (imagem) ou silhueta gerada. */
export function Retrato({
  ficha,
  url,
  className
}: {
  ficha: Pick<Ficha, 'nome' | 'tipo'>
  url: string | null | undefined
  className?: string
}): ReactElement {
  if (url) return <img className={className} src={url} alt="" draggable={false} />
  return <Silhueta className={className} nome={ficha.nome} tipo={ficha.tipo} />
}

/** Converte uma imagem enviada em PNG (máx. 1024 px no maior lado) para guardar como retrato. */
export async function imagemParaPng(dataUrl: string, max = 1024): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * escala))
  const h = Math.max(1, Math.round(img.naturalHeight * escala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Não foi possível processar a imagem')
  g.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}
