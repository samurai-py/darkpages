import { readSection, writeSectionRaw } from '../store/settings'
import { call, HttpError, loopback, OfflineError, pkce, postForm, randomState, request, type Loopback } from './net'

/**
 * Spotify (X9): controle remoto do app do Spotify que já está tocando
 * (Spotify Connect) via Web API. Authorization Code com PKCE, sem segredo.
 *
 * Seção "spotify" das configurações: clientId, redirectUri (opcional),
 * refreshToken, conta.
 *
 * Redirect URI (regras atuais do Spotify): loopback por IP literal
 * (http://127.0.0.1:PORTA/...) ou https; "localhost" não é aceito.
 *  - padrão: http://127.0.0.1:43827/callback
 *    · desktop: o Folio escuta nessa porta e recebe o retorno sozinho;
 *    · modo web: o navegador (em outra máquina) não alcança o servidor por
 *      127.0.0.1, então a página de retorno não carrega; o autor copia a URL
 *      da barra de endereço e cola no Folio (spotify.finalizar).
 *  - https://<host>/oauth/spotify/callback: se o servidor web estiver
 *    publicado em https (ex.: `tailscale serve`), a rota HTTP do servidor
 *    recebe o retorno sozinha.
 *
 * Os comandos de reprodução exigem Spotify Premium; em apps no modo de
 * desenvolvimento, o dono do app também precisa ter Premium (regra de
 * fevereiro/2026).
 */

const AUTH = 'https://accounts.spotify.com/authorize'
const TOKEN = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
export const SPOTIFY_DEFAULT_REDIRECT = 'http://127.0.0.1:43827/callback'
export const SPOTIFY_HTTPS_PATH = '/oauth/spotify/callback'
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ')

export interface SpotifySettings {
  clientId?: string
  redirectUri?: string
  refreshToken?: string
  conta?: string
}

export type ModoRetorno = 'automatico' | 'colar'

export interface EstadoSpotify {
  configurado: boolean
  conectado: boolean
  conta: string
  redirectUri: string
  pendente: { url: string; modo: ModoRetorno } | null
  erro: string | null
}

export type SpotifyFalha = 'desconectado' | 'premium' | 'sem-dispositivo' | 'limite' | 'rede' | 'outro'

export interface Agora {
  conectado: boolean
  tocando: boolean
  faixa: string | null
  artistas: string | null
  album: string | null
  capa: string | null
  contexto: { tipo: string; uri: string; nome: string | null } | null
  progressoMs: number
  duracaoMs: number
  dispositivo: string | null
  /** quando a resposta foi obtida (para a interface animar o progresso) */
  em: number
  falha: SpotifyFalha | null
  mensagem: string | null
}

export interface Playlist {
  id: string
  uri: string
  nome: string
  imagem: string | null
  faixas: number | null
  dono: string | null
}

/** Erro com a classificação para a interface mostrar mensagem clara. */
export class SpotifyError extends Error {
  constructor(
    readonly falha: SpotifyFalha,
    message: string
  ) {
    super(message)
    this.name = 'SpotifyError'
  }
}

const MSG: Record<SpotifyFalha, string> = {
  desconectado: 'Conecte o Spotify em Ajustes.',
  premium: 'Controlar a reprodução exige Spotify Premium (e, em apps de desenvolvimento, o dono do app também precisa ser Premium).',
  'sem-dispositivo': 'Nenhum Spotify ativo. Abra o Spotify no computador ou celular e toque algo uma vez.',
  limite: 'Muitas chamadas ao Spotify agora. Tente de novo em instantes.',
  rede: 'Sem conexão com o Spotify.',
  outro: 'O Spotify recusou o pedido.'
}

function classify(e: unknown): SpotifyError {
  if (e instanceof SpotifyError) return e
  if (e instanceof HttpError) {
    const body = e.body && typeof e.body === 'object' ? (e.body as { error?: { reason?: unknown; message?: unknown } }).error : undefined
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    const text = `${reason} ${e.message}`.toLowerCase()
    if (e.status === 401) return new SpotifyError('desconectado', 'A autorização do Spotify expirou. Conecte de novo em Ajustes.')
    if (e.status === 429) return new SpotifyError('limite', MSG.limite)
    if (e.status === 404 || text.includes('no_active_device') || text.includes('no active device'))
      return new SpotifyError('sem-dispositivo', MSG['sem-dispositivo'])
    if (e.status === 403 && text.includes('premium')) return new SpotifyError('premium', MSG.premium)
    if (e.status === 403) return new SpotifyError('outro', `O Spotify recusou o comando (${e.message}).`)
    return new SpotifyError('outro', `${MSG.outro} (${e.message})`)
  }
  if (e instanceof OfflineError) return new SpotifyError('rede', MSG.rede)
  return new SpotifyError('outro', e instanceof Error ? e.message : String(e))
}

function isLoopback(uri: string): boolean {
  try {
    const u = new URL(uri)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === '[::1]')
  } catch {
    return false
  }
}

export class SpotifyClient {
  private access: { token: string; exp: number } | null = null
  private pending: { state: string; verifier: string; redirect: string; url: string; modo: ModoRetorno; exp: number } | null = null
  private lb: Loopback | null = null
  private erro: string | null = null
  private names = new Map<string, string | null>()
  private imgs = new Map<string, string | null>()

  constructor(
    private readonly dataDir: string,
    private readonly web: boolean
  ) {}

  private settings(): Promise<Partial<SpotifySettings>> {
    return readSection<SpotifySettings>(this.dataDir, 'spotify')
  }

  private redirectOf(s: Partial<SpotifySettings>): string {
    const r = (s.redirectUri ?? '').trim()
    return r || SPOTIFY_DEFAULT_REDIRECT
  }

  async estado(): Promise<EstadoSpotify> {
    const s = await this.settings()
    if (this.pending && Date.now() > this.pending.exp) this.pending = null
    return {
      configurado: Boolean(s.clientId),
      conectado: Boolean(s.refreshToken),
      conta: s.conta ?? '',
      redirectUri: this.redirectOf(s),
      pendente: this.pending ? { url: this.pending.url, modo: this.pending.modo } : null,
      erro: this.erro
    }
  }

  async conectar(openExternal: (url: string) => Promise<void>): Promise<EstadoSpotify> {
    const s = await this.settings()
    if (!s.clientId) throw new Error('Informe o Client ID do app do Spotify.')
    const redirect = this.redirectOf(s)
    let parsed: URL
    try {
      parsed = new URL(redirect)
    } catch {
      throw new Error('Redirect URI inválida')
    }
    if (parsed.hostname === 'localhost') throw new Error('O Spotify não aceita "localhost": use http://127.0.0.1:PORTA/callback.')
    if (!isLoopback(redirect) && parsed.protocol !== 'https:') throw new Error('A Redirect URI precisa ser http://127.0.0.1:PORTA/... ou https://...')
    this.lb?.close()
    this.lb = null
    this.erro = null
    const { verifier, challenge } = pkce()
    const state = randomState()
    const url = `${AUTH}?${new URLSearchParams({
      client_id: s.clientId,
      response_type: 'code',
      redirect_uri: redirect,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    }).toString()}`

    let modo: ModoRetorno = 'colar'
    if (isLoopback(redirect) && !this.web) {
      const port = Number(parsed.port || 80)
      this.lb = await loopback(parsed.pathname || '/', port)
      modo = 'automatico'
      const lb = this.lb
      void lb.result
        .then(async (q) => {
          await this.finalizarParams(q)
        })
        .catch((e: unknown) => {
          this.erro = e instanceof Error ? e.message : String(e)
          this.pending = null
        })
    } else if (parsed.protocol === 'https:' && this.web && parsed.pathname === SPOTIFY_HTTPS_PATH) {
      modo = 'automatico'
    }
    this.pending = { state, verifier, redirect, url, modo, exp: Date.now() + 10 * 60_000 }
    if (!this.web) await openExternal(url)
    return this.estado()
  }

  /** URL de retorno colada pelo autor (modo web com redirect em 127.0.0.1). */
  async finalizar(colada: string): Promise<EstadoSpotify> {
    let q: URLSearchParams
    try {
      q = new URL(colada.trim()).searchParams
    } catch {
      q = new URLSearchParams(colada.trim().replace(/^.*\?/, ''))
    }
    await this.finalizarParams(q)
    return this.estado()
  }

  /** Recebe os parâmetros do retorno (loopback, rota https ou URL colada). */
  async finalizarParams(q: URLSearchParams): Promise<void> {
    const p = this.pending
    if (!p || Date.now() > p.exp) throw new Error('Nenhuma conexão em andamento (ou expirou). Clique em Conectar de novo.')
    const err = q.get('error')
    if (err) {
      this.pending = null
      throw new Error(err === 'access_denied' ? 'Acesso negado na tela do Spotify.' : `O Spotify respondeu: ${err}`)
    }
    if (q.get('state') !== p.state) throw new Error('Retorno inválido: o "state" não confere. Use a URL da última tentativa.')
    const code = q.get('code')
    if (!code) throw new Error('A URL colada não tem o parâmetro "code".')
    const s = await this.settings()
    const tok = await postForm(TOKEN, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: p.redirect,
      client_id: s.clientId ?? '',
      code_verifier: p.verifier
    })
    this.pending = null
    this.lb?.close()
    this.lb = null
    const refresh = typeof tok['refresh_token'] === 'string' ? tok['refresh_token'] : ''
    const at = typeof tok['access_token'] === 'string' ? tok['access_token'] : ''
    if (!refresh || !at) throw new Error('O Spotify não devolveu os tokens')
    this.access = { token: at, exp: Date.now() + (Number(tok['expires_in'] ?? 3600) - 60) * 1000 }
    let conta = 'conta Spotify'
    try {
      const me = (await this.api('GET', '/me')) as { display_name?: unknown; id?: unknown } | null
      conta = String(me?.display_name || me?.id || conta)
    } catch {
      /* conta é só rótulo */
    }
    await writeSectionRaw(this.dataDir, 'spotify', { refreshToken: refresh, conta })
    this.erro = null
  }

  async desconectar(): Promise<void> {
    this.lb?.close()
    this.lb = null
    this.pending = null
    this.access = null
    this.erro = null
    this.names.clear()
    await writeSectionRaw(this.dataDir, 'spotify', { refreshToken: '', conta: '' })
  }

  private async token(): Promise<string> {
    if (this.access && Date.now() < this.access.exp) return this.access.token
    const s = await this.settings()
    if (!s.refreshToken || !s.clientId) throw new SpotifyError('desconectado', MSG.desconectado)
    try {
      const tok = await postForm(TOKEN, { grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId })
      const at = String(tok['access_token'] ?? '')
      if (!at) throw new Error('Resposta sem access_token')
      this.access = { token: at, exp: Date.now() + (Number(tok['expires_in'] ?? 3600) - 60) * 1000 }
      // o Spotify pode ou não devolver um refresh token novo
      if (typeof tok['refresh_token'] === 'string' && tok['refresh_token'] !== s.refreshToken) {
        await writeSectionRaw(this.dataDir, 'spotify', { refreshToken: tok['refresh_token'] })
      }
      return at
    } catch (e) {
      if (e instanceof HttpError && e.status === 400) {
        this.erro = 'A autorização do Spotify foi revogada ou expirou. Conecte de novo.'
        throw new SpotifyError('desconectado', this.erro)
      }
      throw classify(e)
    }
  }

  private async api(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token()
      try {
        const r = await call(`${API}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {})
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        })
        return r.status === 204 ? null : r.body
      } catch (e) {
        if (e instanceof HttpError && e.status === 401 && attempt === 0) {
          this.access = null
          continue
        }
        throw e
      }
    }
  }

  private async contextName(uri: string): Promise<string | null> {
    if (this.names.has(uri)) return this.names.get(uri) ?? null
    const m = uri.match(/^spotify:(playlist|album|artist|show):([A-Za-z0-9]+)$/)
    let name: string | null = null
    if (m) {
      try {
        const kind = m[1] === 'playlist' ? 'playlists' : m[1] === 'album' ? 'albums' : m[1] === 'artist' ? 'artists' : 'shows'
        const r = (await this.api('GET', `/${kind}/${m[2]}${kind === 'playlists' ? '?fields=name' : ''}`)) as { name?: unknown } | null
        name = typeof r?.name === 'string' ? r.name : null
      } catch {
        name = null
      }
    }
    this.names.set(uri, name)
    return name
  }

  async agora(): Promise<Agora> {
    const vazio: Agora = {
      conectado: false,
      tocando: false,
      faixa: null,
      artistas: null,
      album: null,
      capa: null,
      contexto: null,
      progressoMs: 0,
      duracaoMs: 0,
      dispositivo: null,
      em: Date.now(),
      falha: null,
      mensagem: null
    }
    const s = await this.settings()
    if (!s.refreshToken) return { ...vazio, falha: 'desconectado', mensagem: MSG.desconectado }
    try {
      const r = (await this.api('GET', '/me/player?additional_types=track,episode')) as Record<string, unknown> | null
      if (!r) return { ...vazio, conectado: true, falha: 'sem-dispositivo', mensagem: 'Nada tocando no momento. Abra o Spotify e toque algo.' }
      const item = (r['item'] ?? null) as Record<string, unknown> | null
      const device = (r['device'] ?? null) as { name?: unknown } | null
      const ctx = (r['context'] ?? null) as { type?: unknown; uri?: unknown } | null
      let capa: string | null = null
      let artistas: string | null = null
      let album: string | null = null
      if (item) {
        const alb = (item['album'] ?? null) as { name?: unknown; images?: Array<{ url?: unknown; width?: unknown }> } | null
        const show = (item['show'] ?? null) as { name?: unknown; images?: Array<{ url?: unknown; width?: unknown }> } | null
        const imgs = alb?.images ?? show?.images ?? (item['images'] as Array<{ url?: unknown; width?: unknown }> | undefined) ?? []
        // a menor imagem com pelo menos 64 px
        const sorted = [...imgs].sort((a, b) => Number(a.width ?? 0) - Number(b.width ?? 0))
        const pick = sorted.find((i) => Number(i.width ?? 0) >= 64) ?? sorted.at(-1)
        capa = typeof pick?.url === 'string' ? pick.url : null
        const arts = (item['artists'] ?? []) as Array<{ name?: unknown }>
        artistas = arts.map((a) => String(a.name ?? '')).filter(Boolean).join(', ') || (typeof show?.name === 'string' ? show.name : null)
        album = typeof alb?.name === 'string' ? alb.name : null
      }
      const ctxUri = typeof ctx?.uri === 'string' ? ctx.uri : null
      return {
        conectado: true,
        tocando: Boolean(r['is_playing']),
        faixa: item && typeof item['name'] === 'string' ? item['name'] : null,
        artistas,
        album,
        capa: await this.imagem(capa),
        contexto: ctxUri ? { tipo: String(ctx?.type ?? ''), uri: ctxUri, nome: await this.contextName(ctxUri) } : null,
        progressoMs: Number(r['progress_ms'] ?? 0),
        duracaoMs: Number(item?.['duration_ms'] ?? 0),
        dispositivo: typeof device?.name === 'string' ? device.name : null,
        em: Date.now(),
        falha: null,
        mensagem: null
      }
    } catch (e) {
      const c = classify(e)
      return { ...vazio, conectado: c.falha !== 'desconectado', falha: c.falha, mensagem: c.message }
    }
  }

  async comando(cmd: 'play' | 'pause' | 'next' | 'previous'): Promise<void> {
    const route: Record<typeof cmd, [string, string]> = {
      play: ['PUT', '/me/player/play'],
      pause: ['PUT', '/me/player/pause'],
      next: ['POST', '/me/player/next'],
      previous: ['POST', '/me/player/previous']
    }
    const [method, path] = route[cmd]
    try {
      await this.api(method, path)
    } catch (e) {
      throw classify(e)
    }
  }

  async playlists(): Promise<Playlist[]> {
    const out: Playlist[] = []
    try {
      for (let offset = 0; offset < 500; offset += 50) {
        const r = (await this.api('GET', `/me/playlists?limit=50&offset=${offset}`)) as {
          items?: Array<Record<string, unknown> | null>
          next?: unknown
        } | null
        for (const p of r?.items ?? []) {
          if (!p || typeof p['uri'] !== 'string') continue
          const imgs = (p['images'] ?? []) as Array<{ url?: unknown }> | null
          // "items" substituiu "tracks" (fev/2026); aceita os dois
          const count = (p['items'] ?? p['tracks']) as { total?: unknown } | null
          const owner = p['owner'] as { display_name?: unknown } | null
          out.push({
            id: String(p['id'] ?? ''),
            uri: p['uri'],
            nome: String(p['name'] ?? 'Playlist'),
            imagem: typeof imgs?.[0]?.url === 'string' ? imgs[0].url : null,
            faixas: typeof count?.total === 'number' ? count.total : null,
            dono: typeof owner?.display_name === 'string' ? owner.display_name : null
          })
        }
        if (!r?.next) break
      }
    } catch (e) {
      throw classify(e)
    }
    return out
  }

  /**
   * Imagem do CDN do Spotify como data URL: a interface tem CSP só com
   * img-src 'self' data:, então capas remotas passam por aqui.
   */
  async imagem(url: string | null): Promise<string | null> {
    if (!url) return null
    const hit = this.imgs.get(url)
    if (hit !== undefined) return hit
    let ok = false
    try {
      const u = new URL(url)
      ok = u.protocol === 'https:' && /(^|\.)(scdn\.co|spotifycdn\.com)$/.test(u.hostname)
    } catch {
      ok = false
    }
    if (!ok) return null
    let data: string | null = null
    try {
      const res = await request(url, {}, 15_000)
      const type = res.headers.get('content-type') ?? 'image/jpeg'
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length <= 2_000_000) data = `data:${type.split(';')[0]};base64,${buf.toString('base64')}`
      }
    } catch {
      data = null
    }
    if (this.imgs.size > 60) this.imgs.delete(this.imgs.keys().next().value as string)
    this.imgs.set(url, data)
    return data
  }

  async tocarPlaylist(uri: string): Promise<void> {
    if (!/^spotify:playlist:[A-Za-z0-9]{10,40}$/.test(uri)) throw new Error('Playlist inválida')
    try {
      await this.api('PUT', '/me/player/play', { context_uri: uri })
    } catch (e) {
      throw classify(e)
    }
  }
}
