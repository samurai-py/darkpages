import { readSection, writeSectionRaw } from '../store/settings'
import { AuthError, HttpError, jwtPayload, loopback, pkce, postForm, randomState, request } from './net'

/**
 * OAuth do Google para o espelho no Drive (escopo drive.file: o app só vê
 * os arquivos que ele mesmo criou).
 *
 * Dois fluxos, conforme a doc oficial:
 *  - Desktop (Electron): "apps instalados" com loopback 127.0.0.1 em porta
 *    efêmera + PKCE S256. Cliente OAuth do tipo "App para computador".
 *  - Modo web (navegador em outra máquina): "TVs e dispositivos com entrada
 *    limitada" (device flow), que aceita drive.file. Cliente OAuth do tipo
 *    "TVs e dispositivos de entrada limitada".
 * Se só o cliente de dispositivo estiver configurado, o desktop também usa o
 * device flow.
 *
 * Configurações na seção "drive": clientId, clientSecret (desktop),
 * deviceClientId, deviceClientSecret (dispositivo), refreshToken, conta,
 * authClient ('desktop' | 'device'), incluirArca.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEVICE_URL = 'https://oauth2.googleapis.com/device/code'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
export const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file openid email'

export interface DriveSettings {
  clientId?: string
  clientSecret?: string
  deviceClientId?: string
  deviceClientSecret?: string
  refreshToken?: string
  conta?: string
  authClient?: 'desktop' | 'device'
  conectadoEm?: string
  incluirArca?: boolean
}

export type Pendente =
  | { modo: 'navegador'; url: string; desde: string }
  | { modo: 'dispositivo'; url: string; codigo: string; expiraEm: string; desde: string }

export interface ConexaoGoogle {
  configurado: boolean
  /** qual fluxo será usado neste modo (desktop/web) */
  fluxo: 'navegador' | 'dispositivo' | null
  conectado: boolean
  conta: string
  conectadoEm: string | null
  pendente: Pendente | null
  erro: string | null
}

const SECTION = 'drive'

export class GoogleAuth {
  private access: { token: string; exp: number } | null = null
  private pendente: Pendente | null = null
  private erro: string | null = null
  private cancel: (() => void) | null = null

  constructor(
    private readonly dataDir: string,
    private readonly web: boolean
  ) {}

  settings(): Promise<Partial<DriveSettings>> {
    return readSection<DriveSettings>(this.dataDir, SECTION)
  }

  private fluxo(s: Partial<DriveSettings>): 'navegador' | 'dispositivo' | null {
    if (!this.web && s.clientId) return 'navegador'
    if (s.deviceClientId) return 'dispositivo'
    return null
  }

  async conexao(): Promise<ConexaoGoogle> {
    const s = await this.settings()
    return {
      configurado: this.fluxo(s) !== null,
      fluxo: this.fluxo(s),
      conectado: Boolean(s.refreshToken),
      conta: s.conta ?? '',
      conectadoEm: s.conectadoEm ?? null,
      pendente: this.pendente,
      erro: this.erro
    }
  }

  async conectado(): Promise<boolean> {
    return Boolean((await this.settings()).refreshToken)
  }

  /** Marca erro de autorização (ex.: token expirou) para a interface. */
  setErro(msg: string | null): void {
    this.erro = msg
  }

  /** Começa a conexão. Devolve o que a interface precisa mostrar; o resto segue em segundo plano. */
  async conectar(openExternal: (url: string) => Promise<void>): Promise<ConexaoGoogle> {
    const s = await this.settings()
    const fluxo = this.fluxo(s)
    if (!fluxo) {
      throw new Error(
        this.web
          ? 'No modo web, informe o ID e a chave secreta do cliente OAuth do tipo "TVs e dispositivos de entrada limitada".'
          : 'Informe o ID e a chave secreta do cliente OAuth do tipo "App para computador" (ou do tipo "TVs e dispositivos").'
      )
    }
    this.cancel?.()
    this.erro = null
    if (fluxo === 'navegador') await this.startLoopback(s, openExternal)
    else await this.startDevice(s)
    return this.conexao()
  }

  private async startLoopback(s: Partial<DriveSettings>, openExternal: (url: string) => Promise<void>): Promise<void> {
    const lb = await loopback('/', 0)
    const redirect = `http://127.0.0.1:${lb.port}`
    const { verifier, challenge } = pkce()
    const state = randomState()
    const url = `${AUTH_URL}?${new URLSearchParams({
      client_id: s.clientId ?? '',
      redirect_uri: redirect,
      response_type: 'code',
      scope: DRIVE_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent'
    }).toString()}`
    this.pendente = { modo: 'navegador', url, desde: new Date().toISOString() }
    let cancelled = false
    this.cancel = () => {
      cancelled = true
      lb.close()
    }
    void (async () => {
      try {
        const q = await lb.result
        if (cancelled) return
        if (q.get('error')) throw new Error(`Autorização recusada (${q.get('error') ?? ''})`)
        if (q.get('state') !== state) throw new Error('Retorno de autorização inválido (state)')
        const code = q.get('code')
        if (!code) throw new Error('Retorno sem código de autorização')
        const tok = await postForm(TOKEN_URL, {
          code,
          client_id: s.clientId ?? '',
          ...(s.clientSecret ? { client_secret: s.clientSecret } : {}),
          redirect_uri: redirect,
          grant_type: 'authorization_code',
          code_verifier: verifier
        })
        await this.saveTokens(tok, 'desktop')
      } catch (e) {
        if (!cancelled) this.erro = e instanceof Error ? e.message : String(e)
      } finally {
        if (!cancelled) this.pendente = null
      }
    })()
    await openExternal(url)
  }

  private async startDevice(s: Partial<DriveSettings>): Promise<void> {
    const r = await postForm(DEVICE_URL, { client_id: s.deviceClientId ?? '', scope: DRIVE_SCOPES })
    const deviceCode = String(r['device_code'] ?? '')
    const userCode = String(r['user_code'] ?? '')
    const verify = String(r['verification_url'] ?? r['verification_uri'] ?? 'https://www.google.com/device')
    const expiresIn = Number(r['expires_in'] ?? 1800)
    let interval = Math.max(5, Number(r['interval'] ?? 5)) * 1000
    if (!deviceCode || !userCode) throw new Error('O Google não devolveu o código do dispositivo')
    const deadline = Date.now() + expiresIn * 1000
    this.pendente = {
      modo: 'dispositivo',
      url: verify,
      codigo: userCode,
      expiraEm: new Date(deadline).toISOString(),
      desde: new Date().toISOString()
    }
    let cancelled = false
    let timer: NodeJS.Timeout | null = null
    this.cancel = () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    const poll = async (): Promise<void> => {
      if (cancelled) return
      if (Date.now() > deadline) {
        this.erro = 'O código expirou antes da autorização. Clique em Conectar de novo.'
        this.pendente = null
        return
      }
      try {
        const tok = await postForm(TOKEN_URL, {
          client_id: s.deviceClientId ?? '',
          ...(s.deviceClientSecret ? { client_secret: s.deviceClientSecret } : {}),
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
        if (cancelled) return
        await this.saveTokens(tok, 'device')
        this.pendente = null
        return
      } catch (e) {
        if (cancelled) return
        const code = e instanceof HttpError && e.body && typeof e.body === 'object' ? (e.body as { error?: unknown }).error : null
        if (code === 'authorization_pending') {
          /* segue esperando */
        } else if (code === 'slow_down') {
          interval += 5000
        } else if (e instanceof HttpError) {
          this.erro =
            code === 'access_denied'
              ? 'Acesso negado na tela do Google.'
              : code === 'expired_token'
                ? 'O código expirou. Clique em Conectar de novo.'
                : code === 'invalid_client'
                  ? 'Cliente OAuth inválido: confira se o ID é de um cliente do tipo "TVs e dispositivos de entrada limitada".'
                  : `Falha na autorização: ${e.message}`
          this.pendente = null
          return
        }
        /* sem rede: tenta de novo no próximo intervalo */
      }
      timer = setTimeout(() => void poll(), interval)
      timer.unref()
    }
    timer = setTimeout(() => void poll(), interval)
    timer.unref()
  }

  private async saveTokens(tok: Record<string, unknown>, client: 'desktop' | 'device'): Promise<void> {
    const refresh = typeof tok['refresh_token'] === 'string' ? tok['refresh_token'] : ''
    if (!refresh) throw new Error('O Google não devolveu um refresh token. Remova o acesso do Folio na sua conta Google e conecte de novo.')
    const at = typeof tok['access_token'] === 'string' ? tok['access_token'] : ''
    const exp = Number(tok['expires_in'] ?? 3600)
    if (at) this.access = { token: at, exp: Date.now() + (exp - 60) * 1000 }
    const email = jwtPayload(tok['id_token'])['email']
    await writeSectionRaw(this.dataDir, SECTION, {
      refreshToken: refresh,
      authClient: client,
      conta: typeof email === 'string' ? email : 'conta Google',
      conectadoEm: new Date().toISOString()
    })
    this.erro = null
  }

  /** Access token válido (renova pelo refresh token quando preciso). */
  async token(): Promise<string> {
    if (this.access && Date.now() < this.access.exp) return this.access.token
    const s = await this.settings()
    if (!s.refreshToken) throw new AuthError('Google Drive não conectado')
    const device = s.authClient === 'device'
    const clientId = device ? s.deviceClientId : s.clientId
    const secret = device ? s.deviceClientSecret : s.clientSecret
    if (!clientId) throw new AuthError('Cliente OAuth do Google ausente nas configurações')
    try {
      const tok = await postForm(TOKEN_URL, {
        client_id: clientId,
        ...(secret ? { client_secret: secret } : {}),
        refresh_token: s.refreshToken,
        grant_type: 'refresh_token'
      })
      const at = String(tok['access_token'] ?? '')
      if (!at) throw new Error('Resposta de token sem access_token')
      this.access = { token: at, exp: Date.now() + (Number(tok['expires_in'] ?? 3600) - 60) * 1000 }
      if (this.erro && /conect/i.test(this.erro)) this.erro = null
      return at
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) {
        const code = e.body && typeof e.body === 'object' ? (e.body as { error?: unknown }).error : null
        if (code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client') {
          const msg =
            'A autorização do Google Drive expirou ou foi revogada. Conecte de novo em Ajustes. ' +
            '(Projetos no modo "Teste" do Google recebem tokens que vencem em 7 dias.)'
          this.erro = msg
          throw new AuthError(msg)
        }
      }
      throw e
    }
  }

  /** Força renovar o access token na próxima chamada (após 401). */
  invalidate(): void {
    this.access = null
  }

  async desconectar(): Promise<void> {
    this.cancel?.()
    this.pendente = null
    const s = await this.settings()
    if (s.refreshToken) {
      try {
        await request(REVOKE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: s.refreshToken }).toString()
        })
      } catch {
        /* sem rede: o token some daqui mesmo assim */
      }
    }
    this.access = null
    this.erro = null
    await writeSectionRaw(this.dataDir, SECTION, { refreshToken: '', conta: '', conectadoEm: '', authClient: undefined })
  }
}
