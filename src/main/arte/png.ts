import { deflateSync, inflateSync } from 'node:zlib'
import type { Paleta } from './tipos'

/**
 * Pós-processo das imagens geradas, feito no processo principal para que a
 * fila funcione mesmo com a tela Arte fechada (sem canvas, sem libs novas):
 *   1. recorte central para a proporção exata do tipo de saída;
 *   2. paleta: "mono" vira tons de cinza, "sepia" vira cinza tonalizado;
 *   3. regrava PNG limpo (descarta metadados do gerador, como o workflow do ComfyUI).
 *
 * Decodificador PNG mínimo: 8 bits por canal, sem entrelaçamento, tipos de cor
 * 0 (cinza), 2 (RGB), 3 (paleta), 4 (cinza+alfa) e 6 (RGBA). É o que o ComfyUI
 * (SaveImage) e a OpenAI (output_format=png) devolvem. Fora disso, `posProcessar`
 * devolve a imagem original e avisa.
 */

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface Imagem {
  largura: number
  altura: number
  /** 3 (RGB) ou 4 (RGBA) */
  canais: 3 | 4
  px: Buffer
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function ehPng(b: Buffer): boolean {
  return b.length > 8 && b.subarray(0, 8).equals(SIG)
}

export function decodificarPng(buf: Buffer): Imagem {
  if (!ehPng(buf)) throw new Error('Não é PNG')
  let pos = 8
  let w = 0
  let h = 0
  let depth = 0
  let tipo = -1
  let interlace = 0
  let plte: Buffer | null = null
  let trns: Buffer | null = null
  const idat: Buffer[] = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const nome = buf.toString('latin1', pos + 4, pos + 8)
    const dados = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (nome === 'IHDR') {
      w = dados.readUInt32BE(0)
      h = dados.readUInt32BE(4)
      depth = dados[8]!
      tipo = dados[9]!
      interlace = dados[12]!
    } else if (nome === 'PLTE') plte = dados
    else if (nome === 'tRNS') trns = dados
    else if (nome === 'IDAT') idat.push(dados)
    else if (nome === 'IEND') break
  }
  if (!w || !h) throw new Error('PNG sem cabeçalho')
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG não suportado (profundidade ${depth}, entrelaçado ${interlace})`)
  const bppMap: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const bpp = bppMap[tipo]
  if (!bpp) throw new Error(`Tipo de cor PNG não suportado: ${tipo}`)
  if (tipo === 3 && !plte) throw new Error('PNG com paleta sem PLTE')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  if (raw.length < (stride + 1) * h) throw new Error('PNG truncado')
  const linhas = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!
      const a = x >= bpp ? linhas[dst + x - bpp]! : 0
      const b = y > 0 ? linhas[dst - stride + x]! : 0
      const c = x >= bpp && y > 0 ? linhas[dst - stride + x - bpp]! : 0
      let o: number
      switch (f) {
        case 0: o = v; break
        case 1: o = v + a; break
        case 2: o = v + b; break
        case 3: o = v + ((a + b) >> 1); break
        case 4: o = v + paeth(a, b, c); break
        default: throw new Error(`Filtro PNG inválido: ${f}`)
      }
      linhas[dst + x] = o & 0xff
    }
  }
  const alfa = tipo === 4 || tipo === 6 || (tipo === 3 && trns !== null)
  const canais: 3 | 4 = alfa ? 4 : 3
  const px = Buffer.alloc(w * h * canais)
  for (let i = 0; i < w * h; i++) {
    const o = i * canais
    const s = i * bpp
    let r: number, g: number, b: number, al = 255
    if (tipo === 0) r = g = b = linhas[s]!
    else if (tipo === 2) { r = linhas[s]!; g = linhas[s + 1]!; b = linhas[s + 2]! }
    else if (tipo === 3) {
      const k = linhas[s]!
      r = plte![k * 3] ?? 0; g = plte![k * 3 + 1] ?? 0; b = plte![k * 3 + 2] ?? 0
      if (trns) al = trns[k] ?? 255
    } else if (tipo === 4) { r = g = b = linhas[s]!; al = linhas[s + 1]! }
    else { r = linhas[s]!; g = linhas[s + 1]!; b = linhas[s + 2]!; al = linhas[s + 3]! }
    px[o] = r; px[o + 1] = g; px[o + 2] = b
    if (canais === 4) px[o + 3] = al
  }
  return { largura: w, altura: h, canais, px }
}

function chunk(nome: string, dados: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(nome, 'latin1'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

export function codificarPng(img: Imagem): Buffer {
  const { largura: w, altura: h, canais, px } = img
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = canais === 4 ? 6 : 2
  const stride = w * canais
  // filtro "Sub" em todas as linhas: simples e comprime bem ilustrações
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1)
    raw[o] = 1
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x]!
      const a = x >= canais ? px[y * stride + x - canais]! : 0
      raw[o + 1 + x] = (v - a) & 0xff
    }
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** Recorte central para a proporção w:h. */
export function recortar(img: Imagem, pw: number, ph: number): Imagem {
  const alvo = pw / ph
  const atual = img.largura / img.altura
  if (Math.abs(atual - alvo) < 0.005) return img
  let w = img.largura
  let h = img.altura
  if (atual > alvo) w = Math.max(1, Math.round(h * alvo))
  else h = Math.max(1, Math.round(w / alvo))
  const x0 = Math.floor((img.largura - w) / 2)
  const y0 = Math.floor((img.altura - h) / 2)
  const c = img.canais
  const px = Buffer.alloc(w * h * c)
  for (let y = 0; y < h; y++) {
    const de = ((y0 + y) * img.largura + x0) * c
    img.px.copy(px, y * w * c, de, de + w * c)
  }
  return { largura: w, altura: h, canais: c, px }
}

/** Converte para a paleta do estilo (in place). Luminância Rec. 601. */
export function aplicarPaleta(img: Imagem, paleta: Paleta): Imagem {
  if (paleta === 'cor') return img
  const c = img.canais
  for (let i = 0; i < img.px.length; i += c) {
    const y = 0.299 * img.px[i]! + 0.587 * img.px[i + 1]! + 0.114 * img.px[i + 2]!
    if (paleta === 'mono') {
      const v = Math.round(y)
      img.px[i] = v; img.px[i + 1] = v; img.px[i + 2] = v
    } else {
      // sépia: tinta marrom-escura sobre papel creme, mantendo a luminância
      const t = y / 255
      img.px[i] = Math.round(46 + t * (239 - 46))
      img.px[i + 1] = Math.round(36 + t * (227 - 36))
      img.px[i + 2] = Math.round(22 + t * (198 - 22))
    }
  }
  return img
}

export interface PosProcessado {
  bytes: Buffer
  largura: number
  altura: number
  descricao: string
}

export function posProcessar(bytes: Buffer, proporcao: [number, number], paleta: Paleta): PosProcessado {
  let img: Imagem
  try {
    img = decodificarPng(bytes)
  } catch (e) {
    return { bytes, largura: 0, altura: 0, descricao: `nenhum (${(e as Error).message})` }
  }
  const antes = `${img.largura}×${img.altura}`
  img = aplicarPaleta(recortar(img, proporcao[0], proporcao[1]), paleta)
  const passos = [`recorte ${antes} → ${img.largura}×${img.altura}`]
  if (paleta === 'mono') passos.push('tons de cinza')
  if (paleta === 'sepia') passos.push('sépia')
  return { bytes: codificarPng(img), largura: img.largura, altura: img.altura, descricao: passos.join(', ') }
}
