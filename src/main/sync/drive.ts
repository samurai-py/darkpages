import { extname } from 'node:path'
import { call, HttpError, request } from './net'
import type { Remote, RemoteFile } from './remote'

/**
 * Cliente mínimo da Google Drive API v3 (fetch nativo).
 *  - files.list com q (name, 'id' in parents, mimeType, trashed)
 *  - files.create/update multipart (até 5 MB) e resumable (acima disso)
 *  - files.get (metadados e alt=media)
 */

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'
const FIELDS = 'id,name,mimeType,md5Checksum,modifiedTime,trashed'
const MULTIPART_MAX = 5 * 1024 * 1024

const MIME: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf'
}

interface DriveFileJson {
  id?: string
  name?: string
  mimeType?: string
  md5Checksum?: string
  modifiedTime?: string
  trashed?: boolean
}

function toRemote(f: DriveFileJson): RemoteFile {
  return {
    id: String(f.id ?? ''),
    name: String(f.name ?? ''),
    md5: f.md5Checksum,
    modifiedTime: f.modifiedTime ?? new Date(0).toISOString(),
    folder: f.mimeType === FOLDER
  }
}

/** Escapa ' e \ dentro de literais do parâmetro q. */
function lit(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function mimeOf(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

export class DriveRemote implements Remote {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly onUnauthorized: () => void
  ) {}

  /** Chamada autenticada; num 401 renova o token e tenta uma vez mais. */
  private async api(url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown; res: Response }> {
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init.headers)
      headers.set('authorization', `Bearer ${await this.token()}`)
      try {
        return await call(url, { ...init, headers })
      } catch (e) {
        if (e instanceof HttpError && e.status === 401 && attempt === 0) {
          this.onUnauthorized()
          continue
        }
        throw e
      }
    }
  }

  private async list(q: string): Promise<RemoteFile[]> {
    const out: RemoteFile[] = []
    let pageToken = ''
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${FIELDS})`,
        pageSize: '1000',
        spaces: 'drive',
        orderBy: 'modifiedTime desc'
      })
      if (pageToken) params.set('pageToken', pageToken)
      const { body } = await this.api(`${API}?${params.toString()}`)
      const b = (body ?? {}) as { files?: DriveFileJson[]; nextPageToken?: string }
      for (const f of b.files ?? []) if (!f.trashed) out.push(toRemote(f))
      pageToken = b.nextPageToken ?? ''
    } while (pageToken)
    return out
  }

  async ensureFolder(parentId: string, name: string, appProps?: Record<string, string>): Promise<string> {
    const found = await this.list(`name = ${lit(name)} and ${lit(parentId)} in parents and mimeType = '${FOLDER}' and trashed = false`)
    if (found[0]) return found[0].id
    const { body } = await this.api(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], ...(appProps ? { appProperties: appProps } : {}) })
    })
    const id = (body as DriveFileJson | null)?.id
    if (!id) throw new Error(`O Drive não devolveu o id da pasta ${name}`)
    return id
  }

  listChildren(folderId: string): Promise<RemoteFile[]> {
    return this.list(`${lit(folderId)} in parents and trashed = false`)
  }

  async findChild(folderId: string, name: string): Promise<RemoteFile | null> {
    const r = await this.list(`name = ${lit(name)} and ${lit(folderId)} in parents and trashed = false and mimeType != '${FOLDER}'`)
    return r[0] ?? null
  }

  async get(id: string): Promise<RemoteFile | null> {
    try {
      const { body } = await this.api(`${API}/${encodeURIComponent(id)}?fields=${FIELDS}`)
      const f = (body ?? {}) as DriveFileJson
      return f.trashed ? null : toRemote(f)
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null
      throw e
    }
  }

  async upload(parentId: string, name: string, bytes: Buffer, existingId?: string): Promise<RemoteFile> {
    const mime = mimeOf(name)
    const meta = existingId ? { name } : { name, parents: [parentId] }
    const base = existingId ? `${UPLOAD}/${encodeURIComponent(existingId)}` : UPLOAD
    const method = existingId ? 'PATCH' : 'POST'
    let file: DriveFileJson
    if (bytes.length <= MULTIPART_MAX) {
      const boundary = `folio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`)
      ])
      const r = await this.api(`${base}?uploadType=multipart&fields=${FIELDS}`, {
        method,
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body)
      })
      file = (r.body ?? {}) as DriveFileJson
    } else {
      const start = await this.api(`${base}?uploadType=resumable&fields=${FIELDS}`, {
        method,
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-type': mime,
          'x-upload-content-length': String(bytes.length)
        },
        body: JSON.stringify(meta)
      })
      const session = start.res.headers.get('location')
      if (!session) throw new Error('O Drive não devolveu a sessão de envio')
      const put = await call(session, { method: 'PUT', headers: { 'content-type': mime }, body: new Uint8Array(bytes) })
      file = (put.body ?? {}) as DriveFileJson
    }
    if (!file.id) throw new Error(`Envio de ${name} sem resposta do Drive`)
    if (!file.md5Checksum) {
      const again = await this.get(file.id)
      if (again) return again
    }
    return toRemote(file)
  }

  async download(id: string): Promise<Buffer> {
    const headers = { authorization: `Bearer ${await this.token()}` }
    let res = await request(`${API}/${encodeURIComponent(id)}?alt=media`, { headers })
    if (res.status === 401) {
      this.onUnauthorized()
      res = await request(`${API}/${encodeURIComponent(id)}?alt=media`, { headers: { authorization: `Bearer ${await this.token()}` } })
    }
    if (res.status >= 400) throw new HttpError(res.status, `Falha ao baixar do Drive (HTTP ${res.status})`, await res.text())
    return Buffer.from(await res.arrayBuffer())
  }

  async trash(id: string): Promise<void> {
    try {
      await this.api(`${API}/${encodeURIComponent(id)}?fields=id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ trashed: true })
      })
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return
      throw e
    }
  }
}
