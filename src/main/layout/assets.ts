import { copyFile, mkdir, open, stat } from 'node:fs/promises'
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
