/**
 * Folio em modo web: serve a interface construída (out/renderer) e a mesma
 * API do app desktop via HTTP (POST /api/<método>, corpo = lista de argumentos).
 *
 *   FOLIO_HOST     IP para escutar (padrão 127.0.0.1; use o IP do Tailscale)
 *   FOLIO_PORT     porta (padrão 4747)
 *   FOLIO_LIBRARY  pasta onde livros novos são criados (padrão ~/Folio)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { recentsStore } from '../main/recents'
import { dispatch } from '../main/api/registry'
import { httpRoutes } from '../main/api/routes'
import type { Ctx } from '../main/api/context'

const ROOT = process.cwd()
const HOST = process.env['FOLIO_HOST'] ?? '127.0.0.1'
const PORT = Number(process.env['FOLIO_PORT'] ?? 4747)
const STATIC = join(ROOT, 'out', 'renderer')
const MAX_BODY = 40 * 1024 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.otf': 'font/otf'
}

const allowed = new Set<string>()
const dataDir = join(homedir(), '.config', 'folio')
const recents = recentsStore(dataDir)

const ctx: Ctx = {
  web: true,
  resourcesDir: join(ROOT, 'resources'),
  dataDir,
  libraryDir: process.env['FOLIO_LIBRARY'] ?? join(homedir(), 'Folio'),
  isAllowed: async (dir) => allowed.has(dir) || (await recents.list()).some((r) => r.dir === dir),
  remember: async (p) => {
    allowed.add(p.dir)
    await recents.touch(p.dir, p.meta.title)
    return p
  },
  pickDirectory: async () => null,
  openExternal: async () => undefined,
  reveal: async () => undefined
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        fail(new Error('Corpo grande demais'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

function send(res: ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}

async function serveFile(res: ServerResponse, path: string, download = false): Promise<boolean> {
  try {
    const s = await stat(path)
    if (!s.isFile()) return false
    res.writeHead(200, {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      'content-length': s.size,
      'x-content-type-options': 'nosniff',
      ...(download ? { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.split(sep).pop() ?? 'arquivo')}` } : {})
    })
    createReadStream(path).pipe(res)
    return true
  } catch {
    return false
  }
}

/** Arquivo exportado: só dentro de <livro>/export/ de um livro autorizado. */
async function serveExport(res: ServerResponse, raw: string | null): Promise<void> {
  if (!raw) return send(res, 400, '{"error":"path ausente"}')
  const path = resolve(raw)
  const exportDir = resolve(path, '..')
  const book = resolve(exportDir, '..')
  if (!exportDir.endsWith(`${sep}export`) || !(await ctx.isAllowed(book))) {
    return send(res, 403, '{"error":"arquivo não autorizado"}')
  }
  if (!(await serveFile(res, path, extname(path) !== '.pdf'))) send(res, 404, '{"error":"não encontrado"}')
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://folio')
    try {
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST') return send(res, 405, '{"error":"use POST"}')
        const args = JSON.parse((await readBody(req)) || '[]') as unknown
        if (!Array.isArray(args)) return send(res, 400, '{"error":"args deve ser lista"}')
        const result = await dispatch(ctx, url.pathname.slice(5), args)
        return send(res, 200, JSON.stringify({ ok: true, result: result ?? null }))
      }
      if (url.pathname === '/files/pdf' || url.pathname === '/files/export') return serveExport(res, url.searchParams.get('path'))
      for (const route of httpRoutes) if (await route(ctx, req, res, url)) return

      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
      const full = resolve(STATIC, rel)
      if (!full.startsWith(STATIC + sep)) return send(res, 403, '{"error":"proibido"}')
      if (await serveFile(res, full)) return
      return send(res, 200, await readFile(join(STATIC, 'index.html'), 'utf8'), MIME['.html'])
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
  })()
})

server.listen(PORT, HOST, () => {
  console.log(`Folio web em http://${HOST}:${PORT}  (livros novos em ${ctx.libraryDir})`)
})
