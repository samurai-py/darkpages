import { renderToStaticMarkup } from 'react-dom/server'
import { folio } from '../../api'
import { MapaSvg, terrenoDoc } from './render'
import type { MapaDoc } from './types'

export type Papel = 'A4' | 'A3'
export type Formato = 'png' | 'svg'

export const PAPEIS: Record<Papel, { longoMm: number; curtoMm: number }> = {
  A4: { longoMm: 297, curtoMm: 210 },
  A3: { longoMm: 420, curtoMm: 297 }
}

const DPI = 300
const LIMITE_DATA_URL = 29_500_000

/** Dimensões em pixels do PNG para o papel escolhido (~300 dpi, sem distorcer o mapa). */
export function dimensoesPng(doc: Pick<MapaDoc, 'largura' | 'altura'>, papel: Papel): { w: number; h: number } {
  const { longoMm, curtoMm } = PAPEIS[papel]
  const longo = (longoMm / 25.4) * DPI
  const curto = (curtoMm / 25.4) * DPI
  const paisagem = doc.largura >= doc.altura
  const maxW = paisagem ? longo : curto
  const maxH = paisagem ? curto : longo
  const k = Math.min(maxW / doc.largura, maxH / doc.altura)
  return { w: Math.round(doc.largura * k), h: Math.round(doc.altura * k) }
}

// ---------------------------------------------------------------------------
// fontes embutidas (SVG renderizado como imagem não enxerga as fontes da página)
// ---------------------------------------------------------------------------

const FAMILIAS = new Set(['EB Garamond', 'Cormorant Garamond'])
let cacheFontes: Promise<string> | null = null

function lerBinario(url: string): Promise<ArrayBuffer> {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest()
    x.open('GET', url)
    x.responseType = 'arraybuffer'
    x.onload = () => (x.status === 0 || (x.status >= 200 && x.status < 300) ? ok(x.response as ArrayBuffer) : falha(new Error(`HTTP ${x.status}`)))
    x.onerror = () => falha(new Error('Falha ao ler fonte'))
    x.send()
  })
}

function base64(bytes: Uint8Array): string {
  let s = ''
  const passo = 0x8000
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo))
  return btoa(s)
}

async function montarFontes(): Promise<string> {
  const regras: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const st = rule.style
      const fam = st.getPropertyValue('font-family').replace(/["']/g, '').trim()
      if (!FAMILIAS.has(fam)) continue
      const range = st.getPropertyValue('unicode-range')
      if (range && !/U\+0000|U\+0100/i.test(range)) continue
      const src = st.getPropertyValue('src')
      const m = src.match(/url\(["']?([^"')]+\.woff2)["']?\)/) ?? src.match(/url\(["']?([^"')]+)["']?\)/)
      if (!m?.[1]) continue
      try {
        const url = new URL(m[1], sheet.href ?? location.href).href
        const bin = await lerBinario(url)
        const tipo = url.endsWith('.woff') ? 'woff' : 'woff2'
        regras.push(
          `@font-face{font-family:'${fam}';font-style:${st.getPropertyValue('font-style') || 'normal'};font-weight:${
            st.getPropertyValue('font-weight') || '400'
          };${range ? `unicode-range:${range};` : ''}src:url(data:font/${tipo};base64,${base64(new Uint8Array(bin))}) format('${tipo}');}`
        )
      } catch {
        /* sem esta fonte: o SVG usa a fonte reserva (Georgia/serif) */
      }
    }
  }
  return regras.join('\n')
}

function fontesEmbutidas(): Promise<string> {
  cacheFontes ??= montarFontes().catch(() => '')
  return cacheFontes
}

// ---------------------------------------------------------------------------

function svgTexto(doc: MapaDoc, fontes: string, w?: number, h?: number): string {
  const calc = terrenoDoc(doc)
  const markup = renderToStaticMarkup(<MapaSvg doc={doc} calc={calc} p="ex-" largura={w} altura={h} estiloFontes={fontes} />)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`
}

function blobParaDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => falha(r.error ?? new Error('Falha ao ler imagem'))
    r.readAsDataURL(b)
  })
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => falha(new Error('Não consegui desenhar o mapa para exportar'))
    img.src = url
  })
}

export interface Exportado {
  /** nome salvo em <livro>/assets/ */
  arquivo: string
  /** URL (blob:) para o link de download */
  url: string
  /** nome sugerido para download */
  download: string
  w: number
  h: number
  bytes: number
}

function nomeDownload(doc: MapaDoc, ext: string): string {
  const base = doc.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'mapa'}.${ext}`
}

/** Exporta o mapa: grava em assets/ (mapa-<id>.png|svg) e devolve um link de download. */
export async function exportarMapa(dir: string, doc: MapaDoc, formato: Formato, papel: Papel): Promise<Exportado> {
  const fontes = await fontesEmbutidas()
  if (formato === 'svg') {
    const texto = svgTexto(doc, fontes)
    const blob = new Blob([texto], { type: 'image/svg+xml' })
    const arquivo = `mapa-${doc.id}.svg`
    await folio.assets.put(dir, arquivo, await blobParaDataUrl(blob))
    return { arquivo, url: URL.createObjectURL(blob), download: nomeDownload(doc, 'svg'), w: doc.largura, h: doc.altura, bytes: blob.size }
  }

  const { w, h } = dimensoesPng(doc, papel)
  const texto = svgTexto(doc, fontes, w, h)
  const svgUrl = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml' }))
  try {
    const img = await carregarImagem(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível para exportar')
    ctx.drawImage(img, 0, 0, w, h)
    const png = await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Imagem grande demais para este computador; tente A4'))), 'image/png')
    )
    const dataUrl = await blobParaDataUrl(png)
    if (dataUrl.length > LIMITE_DATA_URL) {
      throw new Error(`O PNG ficou com ${(png.size / 1e6).toFixed(1)} MB, acima do limite de gravação. Exporte em A4 ou em SVG.`)
    }
    const arquivo = `mapa-${doc.id}.png`
    await folio.assets.put(dir, arquivo, dataUrl)
    return { arquivo, url: URL.createObjectURL(png), download: nomeDownload(doc, 'png'), w, h, bytes: png.size }
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
