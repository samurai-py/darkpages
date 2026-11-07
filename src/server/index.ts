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
import { homedir, hostname } from 'node:os'
import { randomBytes, timingSafeEqual } from 'node:crypto'
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

/**
 * Proteções do modo web (a API escreve arquivos e chama IA, então não pode
 * ser chamada por outra página aberta no navegador):
 * - Host: só aceita os nomes deste servidor (bloqueia DNS rebinding)
 * - Origin: se presente, tem de ser o próprio servidor (bloqueia CSRF)
 * - Content-Type application/json obrigatório na API (força preflight CORS, que nunca é aceito)
 * - token aleatório por inicialização, entregue em cookie SameSite=Strict HttpOnly ao carregar a interface
 */
const TOKEN = randomBytes(32).toString('hex')
const COOKIE = 'folio_token'
const host = hostname().toLowerCase()
const ALLOWED_HOSTS = new Set(
  [
    `${HOST}:${PORT}`,
    `${host}:${PORT}`,
    ...(process.env['FOLIO_ALLOWED_HOSTS'] ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  ].map((h) => h.toLowerCase())
)

function hostOk(raw: string | undefined): boolean {
  if (!raw) return false
  const h = raw.toLowerCase()
  if (ALLOWED_HOSTS.has(h)) return true
  // nome MagicDNS do Tailscale: <maquina>.<tailnet>.ts.net:porta
  return h === `${host}.${h.split('.').slice(1).join('.')}` && /\.ts\.net:\d+$/.test(h) && h.endsWith(`:${PORT}`)
}

function tokenOk(req: IncomingMessage): boolean {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`))
  if (!m?.[1]) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

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
  const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (type.startsWith('text/html')) {
    headers['set-cookie'] = `${COOKIE}=${TOKEN}; Path=/; HttpOnly; SameSite=Strict`
    headers['x-frame-options'] = 'DENY'
  }
  res.writeHead(status, headers)
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
      if (!hostOk(req.headers.host)) return send(res, 421, '{"error":"host não reconhecido"}')
      const origin = req.headers.origin
      if (origin && !hostOk(origin.replace(/^https?:\/\//, ''))) return send(res, 403, '{"error":"origem não permitida"}')
      const needsToken = url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')
      if (needsToken && !tokenOk(req)) return send(res, 401, '{"error":"sessão inválida: recarregue a página"}')
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'POST') return send(res, 405, '{"error":"use POST"}')
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
          return send(res, 415, '{"error":"content-type deve ser application/json"}')
        }
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
      if (extname(full) !== '.html' && (await serveFile(res, full))) return
      return send(res, 200, await readFile(join(STATIC, 'index.html'), 'utf8'), MIME['.html'])
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
  })()
})

server.listen(PORT, HOST, () => {
  console.log(`Folio web em http://${HOST}:${PORT}  (livros novos em ${ctx.libraryDir})`)
})
