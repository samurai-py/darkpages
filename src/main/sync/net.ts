import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

/**
 * Utilitários de rede do sync/Spotify: fetch com tempo limite e erros
 * classificados, PKCE e um servidor de loopback (127.0.0.1) para OAuth.
 * Só usa APIs nativas do Node 22 (fetch, crypto, http).
 */

/** Sem rede (DNS, conexão recusada, tempo esgotado). A fila tenta de novo depois. */
export class OfflineError extends Error {
  constructor(message = 'Sem conexão com a internet') {
    super(message)
    this.name = 'OfflineError'
  }
}

/** Resposta HTTP com status de erro. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
    readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'HttpError'
  }
  /** 5xx e 429 valem nova tentativa; o resto é erro do pedido. */
  get transient(): boolean {
    return this.status >= 500 || this.status === 429
  }
}

/** Autorização perdida (token revogado/expirado): exige conectar de novo. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

const TIMEOUT_MS = 60_000

export async function request(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new OfflineError(`Sem conexão (${msg})`)
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as { error?: unknown; error_description?: unknown; message?: unknown }
    if (typeof b.error_description === 'string') return b.error_description
    if (b.error && typeof b.error === 'object') {
      const m = (b.error as { message?: unknown }).message
      if (typeof m === 'string') return m
    }
    if (typeof b.error === 'string') return b.error
    if (typeof b.message === 'string') return b.message
  }
  if (typeof body === 'string' && body.length < 300) return body
  return `HTTP ${status}`
}

/** Faz a chamada e devolve o corpo (JSON ou texto); lança HttpError se status >= 400. */
export async function call(url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown; res: Response }> {
  const res = await request(url, init)
  if (res.status >= 400) {
    const body = await readBody(res)
    const ra = Number(res.headers.get('retry-after'))
    throw new HttpError(res.status, errorMessage(body, res.status), body, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined)
  }
  return { status: res.status, body: await readBody(res), res }
}

/** POST application/x-www-form-urlencoded (endpoints de token OAuth). */
export async function postForm(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  })
  const body = await readBody(res)
  if (res.status >= 400) throw new HttpError(res.status, errorMessage(body, res.status), body)
  return (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PKCE (RFC 7636): verificador de 64 caracteres e desafio S256. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function randomState(): string {
  return b64url(randomBytes(18))
}

/** Lê o payload de um id_token (JWT) recebido direto do provedor por TLS. */
export function jwtPayload(token: unknown): Record<string, unknown> {
  if (typeof token !== 'string') return {}
  const part = token.split('.')[1]
  if (!part) return {}
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/** Página simples mostrada no navegador ao fim do OAuth. */
export function donePage(ok: boolean, msg: string): string {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Folio</title>
<body style="font-family:system-ui,sans-serif;background:#070707;color:#ededed;display:grid;place-items:center;height:100vh;margin:0">
<main style="max-width:420px;text-align:center"><h1 style="font-weight:500">${ok ? 'Conectado' : 'Não deu certo'}</h1>
<p style="color:#9a9a9a">${escapeHtml(msg)}</p></main></body></html>`
}

export interface Loopback {
  /** porta efetivamente usada */
  port: number
  /** resolve com os parâmetros da URL de retorno */
  result: Promise<URLSearchParams>
  close(): void
}

/**
 * Servidor HTTP em 127.0.0.1 que espera um único retorno de OAuth em `path`.
 * port 0 = porta efêmera escolhida pelo sistema. Fecha sozinho após o retorno
 * ou após `timeoutMs`.
 */
export function loopback(path: string, port = 0, timeoutMs = 5 * 60_000): Promise<Loopback> {
  return new Promise((ok, fail) => {
    let settle: (p: URLSearchParams) => void = () => undefined
    let reject: (e: Error) => void = () => undefined
    const result = new Promise<URLSearchParams>((a, b) => {
      settle = a
      reject = b
    })
    result.catch(() => undefined)
    let server: Server | null = null
    const close = (): void => {
      clearTimeout(timer)
      server?.close()
      server?.closeAllConnections()
    }
    const timer = setTimeout(() => {
      reject(new Error('Tempo esgotado esperando a autorização no navegador'))
      close()
    }, timeoutMs)
    timer.unref()
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== path) {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        donePage(
          !err,
          err ? `O provedor respondeu: ${err}. Volte ao Folio e tente de novo.` : 'Pode fechar esta aba e voltar ao Folio.'
        )
      )
      settle(url.searchParams)
      setTimeout(close, 200).unref()
    })
    server.on('error', (e) => {
      clearTimeout(timer)
      fail(
        (e as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? new Error(`A porta ${port} de 127.0.0.1 está ocupada. Feche o programa que a usa e tente de novo.`)
          : e
      )
    })
    server.listen(port, '127.0.0.1', () => {
      const addr = server?.address()
      const real = addr && typeof addr === 'object' ? addr.port : port
      ok({ port: real, result, close })
    })
  })
}
