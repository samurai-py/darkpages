import { copyFile, mkdir, open, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ASSET_NAMES } from '../../shared/models'
import type { ChapterInfo } from '../../shared/types'

export interface PngSize {
  width: number
  height: number
}

/** Lê largura e altura de um PNG pelo cabeçalho IHDR (bytes 16–23), sem decodificar a imagem. */
export async function pngSize(path: string): Promise<PngSize | null> {
  let fh
  try {
    fh = await open(path, 'r')
    const buf = Buffer.alloc(24)
    const { bytesRead } = await fh.read(buf, 0, 24, 0)
    if (bytesRead < 24) return null
    const sig = buf.subarray(0, 8).toString('hex')
    if (sig !== '89504e470d0a1a0a' || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  } finally {
    await fh?.close()
  }
}

/**
 * Resolução efetiva (dpi) de uma imagem que cobre uma área (fit "cover"):
 * a escala é a maior das duas razões, e cada pixel ocupa mm/px.
 */
export function coverDpi(img: PngSize, areaWmm: number, areaHmm: number): number {
  const mmPerPx = Math.max(areaWmm / img.width, areaHmm / img.height)
  return Math.round(25.4 / mmPerPx)
}

async function exists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

/** Caminho em <livro>/assets/ da arte de abertura do capítulo, se existir. */
export async function aberturaPath(dir: string, file: string): Promise<string | null> {
  const p = join(dir, 'assets', ASSET_NAMES.abertura(file))
  return (await exists(p)) ? p : null
}

export async function capaFrentePath(dir: string): Promise<string | null> {
  const p = join(dir, 'assets', ASSET_NAMES.capa)
  return (await exists(p)) ? p : null
}

/**
 * Copia as artes de abertura para <buildDir>/img/ (o Typst só lê arquivos
 * dentro de --root) e devolve arquivo do capítulo → caminho relativo.
 */
export async function stageAberturas(dir: string, buildDir: string, chapters: ChapterInfo[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await mkdir(join(buildDir, 'img'), { recursive: true })
  for (const c of chapters) {
    const src = await aberturaPath(dir, c.file)
    if (!src) continue
    const name = ASSET_NAMES.abertura(c.file)
    await copyFile(src, join(buildDir, 'img', name))
    out.set(c.file, `img/${name}`)
  }
  return out
}

export async function stageCapa(dir: string, buildDir: string): Promise<string | null> {
  const src = await capaFrentePath(dir)
  if (!src) return null
  await mkdir(join(buildDir, 'img'), { recursive: true })
  await copyFile(src, join(buildDir, 'img', ASSET_NAMES.capa))
  return `img/${ASSET_NAMES.capa}`
}

// ---------- imagens no texto (figuras) e foto do autor ----------

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg'

const MEDIA: Record<ImageKind, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }

/** Tipo real da imagem pelos primeiros bytes (a extensão pode mentir). */
export function imageKind(head: Buffer): ImageKind | null {
  if (head.length >= 8 && head.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  const txt = head.subarray(0, 256).toString('utf8').trimStart()
  if (txt.startsWith('<svg') || (txt.startsWith('<?xml') && txt.includes('<svg'))) return 'svg'
  return null
}

export function mediaType(kind: ImageKind): string {
  return MEDIA[kind]
}

/** Largura e altura de um JPEG pelo marcador SOF (sem decodificar). */
export function jpegSizeFrom(buf: Buffer): PngSize | null {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = buf[i + 1] ?? 0
    // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

/** Largura e altura em pixels de PNG ou JPEG. */
export async function imageSize(path: string): Promise<(PngSize & { kind: ImageKind }) | null> {
  try {
    const buf = await readFile(path)
    const kind = imageKind(buf)
    if (kind === 'png') {
      const s = await pngSize(path)
      return s ? { ...s, kind } : null
    }
    if (kind === 'jpeg') {
      const s = jpegSizeFrom(buf)
      return s ? { ...s, kind } : null
    }
    return null
  } catch {
    return null
  }
}

/** Resolução efetiva (dpi) de uma imagem impressa com a largura dada. */
export function widthDpi(img: PngSize, widthMm: number): number {
  return Math.round(img.width / (widthMm / 25.4))
}

/**
 * Copia para <buildDir>/img/ as imagens citadas no texto (figuras) e a foto do
 * autor. Devolve nome em assets/ → caminho relativo ao buildDir. Arquivos que
 * não existem ficam de fora (o Typst mostra só a legenda).
 */
export async function stageImagens(dir: string, buildDir: string, names: Iterable<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await mkdir(join(buildDir, 'img'), { recursive: true })
  for (const name of new Set(names)) {
    const src = join(dir, 'assets', name)
    if (!(await exists(src))) continue
    await copyFile(src, join(buildDir, 'img', name))
    out.set(name, `img/${name}`)
  }
  return out
}
