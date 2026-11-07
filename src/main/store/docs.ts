import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * Armazenamento genérico de documentos JSON dentro do livro:
 *   <livro>/<coleção>/<id>.json
 * Coleções: universo, enredo, mapas, idioma, arte, notas, norte…
 */

const COLLECTION = /^[a-z][a-z0-9-]{0,40}$/
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/
const ASSET = /^[a-z0-9][a-z0-9-]{0,80}\.(png|jpe?g|webp|svg|otf)$/
const RESERVED = new Set(['manuscrito', 'export', 'assets'])

function collectionDir(dir: string, collection: string): string {
  if (!COLLECTION.test(collection) || RESERVED.has(collection)) throw new Error(`Coleção inválida: ${collection}`)
  return join(dir, collection)
}

function docPath(dir: string, collection: string, id: string): string {
  if (!ID.test(id)) throw new Error(`Id inválido: ${id}`)
  const base = resolve(collectionDir(dir, collection))
  const full = resolve(base, `${id}.json`)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return full
}

export async function atomicWrite(path: string, data: string | Buffer): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export async function listDocs<T = unknown>(dir: string, collection: string): Promise<Array<T & { id: string }>> {
  let files: string[]
  try {
    files = await readdir(collectionDir(dir, collection))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const out: Array<T & { id: string }> = []
  for (const f of files.filter((x) => x.endsWith('.json')).sort()) {
    const id = f.slice(0, -5)
    if (!ID.test(id)) continue
    try {
      out.push({ ...(JSON.parse(await readFile(join(collectionDir(dir, collection), f), 'utf8')) as T), id })
    } catch {
      /* arquivo corrompido: ignora na listagem */
    }
  }
  return out
}

export async function getDoc<T = unknown>(dir: string, collection: string, id: string): Promise<(T & { id: string }) | null> {
  try {
    return { ...(JSON.parse(await readFile(docPath(dir, collection, id), 'utf8')) as T), id }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function putDoc<T extends object>(dir: string, collection: string, id: string, data: T): Promise<T & { id: string }> {
  const path = docPath(dir, collection, id)
  await mkdir(collectionDir(dir, collection), { recursive: true })
  const { id: _drop, ...rest } = data as T & { id?: string }
  await atomicWrite(path, JSON.stringify(rest, null, 2))
  return { ...(rest as T), id }
}

export async function deleteDoc(dir: string, collection: string, id: string): Promise<void> {
  await rm(docPath(dir, collection, id), { force: true })
}

export function newId(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}${prefix ? '-' : ''}${Date.now().toString(36)}-${r}`
}

// ---------- imagens e arquivos binários do livro ----------

function assetPath(dir: string, name: string): string {
  if (!ASSET.test(name)) throw new Error(`Nome de arquivo inválido: ${name}`)
  const base = resolve(dir, 'assets')
  const full = resolve(base, name)
  if (!full.startsWith(base + sep)) throw new Error('Caminho fora do projeto')
  return full
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  otf: 'font/otf'
}

/** Recebe data URL (base64) e grava em <livro>/assets/<name>. */
export async function putAsset(dir: string, name: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/s)
  if (!m || !m[2]) throw new Error('Esperado data URL em base64')
  const path = assetPath(dir, name)
  await mkdir(resolve(dir, 'assets'), { recursive: true })
  await atomicWrite(path, Buffer.from(m[2], 'base64'))
  return name
}

export async function putAssetBytes(dir: string, name: string, bytes: Buffer): Promise<string> {
  const path = assetPath(dir, name)
  await mkdir(resolve(dir, 'assets'), { recursive: true })
  await atomicWrite(path, bytes)
  return name
}

/** Devolve o arquivo como data URL (a interface usa direto em <img src>). */
export async function getAsset(dir: string, name: string): Promise<string | null> {
  try {
    const buf = await readFile(assetPath(dir, name))
    const ext = name.split('.').pop() ?? ''
    return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${buf.toString('base64')}`
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function assetFilePath(dir: string, name: string): string {
  return assetPath(dir, name)
}
