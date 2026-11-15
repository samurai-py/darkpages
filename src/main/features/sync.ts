import type { IncomingMessage, ServerResponse } from 'node:http'
import { bookDir, str, type Ctx, type Handlers } from '../api/context'
import { donePage } from '../sync/net'
import { destaque, registrar } from '../sync/progresso'
import { SPOTIFY_HTTPS_PATH } from '../sync/spotify'
import { startServices, statusOf } from '../sync/worker'

/**
 * Métodos da feature Sync/Biblioteca/Spotify. DONO: Sync.
 *
 *  sync.status(dir)            → SyncStatus (conectado, conta, ultimoEnvio, pendentes, conflitos[], erro…)
 *  sync.agora(dir)             → envia já o que mudou e devolve o status
 *  sync.puxar(dir)             → baixa do Drive o que é mais novo lá (chamado ao abrir o livro)
 *  sync.resolver(dir, arquivo, 'local'|'remoto')
 *  sync.conectar()             → inicia OAuth (loopback+PKCE no desktop; device flow no web)
 *  sync.conexao()              → estado da conta/conexão em andamento
 *  sync.desconectar()
 *  spotify.estado() / spotify.conectar() / spotify.finalizar(url) / spotify.desconectar()
 *  spotify.agora() / spotify.comando(cmd) / spotify.playlists() / spotify.tocarPlaylist(uri)
 *  spotify.imagem(url)         → capa do CDN do Spotify como data URL (CSP da interface)
 *  biblioteca.registrar(dir)   → { dias } (palavras totais por dia)
 *  biblioteca.destaque(dir)    → último capítulo editado, trecho final, capa
 */

const svc = (ctx: Ctx): ReturnType<typeof startServices> => startServices(ctx)

const COMANDOS = new Set(['play', 'pause', 'next', 'previous'])

export const handlers: Handlers = {
  'sync.status': async (ctx, dir) => statusOf(svc(ctx), await bookDir(ctx, dir)),

  'sync.agora': async (ctx, dir) => {
    const s = svc(ctx)
    const d = await bookDir(ctx, dir)
    if (!(await s.google.conectado())) throw new Error('Conecte o Google Drive em Ajustes primeiro.')
    const b = await s.book(d)
    // "agora" ignora a espera da retentativa
    const m = await b.manifest()
    for (const q of m.fila) q.proximaEm = 0
    try {
      await b.push()
    } catch {
      /* o erro aparece no status */
    }
    return statusOf(s, d)
  },

  'sync.puxar': async (ctx, dir) => {
    const s = svc(ctx)
    const d = await bookDir(ctx, dir)
    if (!(await s.google.conectado())) return { baixados: 0, conflitos: 0, conectado: false }
    const r = await (await s.book(d)).pull()
    return { ...r, conectado: true }
  },

  'sync.resolver': async (ctx, dir, arquivo, escolha) => {
    const s = svc(ctx)
    const d = await bookDir(ctx, dir)
    if (escolha !== 'local' && escolha !== 'remoto') throw new Error('Escolha inválida')
    const b = await s.book(d)
    await b.resolver(str(arquivo, 1000), escolha)
    try {
      await b.push()
    } catch {
      /* status mostra */
    }
    return statusOf(s, d)
  },

  'sync.conectar': async (ctx) => svc(ctx).google.conectar((url) => ctx.openExternal(url)),
  'sync.conexao': async (ctx) => svc(ctx).google.conexao(),
  'sync.desconectar': async (ctx) => {
    const s = svc(ctx)
    await s.google.desconectar()
    return s.google.conexao()
  },

  'spotify.estado': async (ctx) => svc(ctx).spotify.estado(),
  'spotify.conectar': async (ctx) => svc(ctx).spotify.conectar((url) => ctx.openExternal(url)),
  'spotify.finalizar': async (ctx, url) => svc(ctx).spotify.finalizar(str(url, 4096)),
  'spotify.desconectar': async (ctx) => {
    const s = svc(ctx)
    await s.spotify.desconectar()
    return s.spotify.estado()
  },
  'spotify.agora': async (ctx) => svc(ctx).spotify.agora(),
  'spotify.comando': async (ctx, cmd) => {
    const c = str(cmd, 20)
    if (!COMANDOS.has(c)) throw new Error('Comando inválido')
    await svc(ctx).spotify.comando(c as 'play' | 'pause' | 'next' | 'previous')
    return svc(ctx).spotify.agora()
  },
  'spotify.playlists': async (ctx) => svc(ctx).spotify.playlists(),
  'spotify.imagem': async (ctx, url) => svc(ctx).spotify.imagem(str(url, 2000)),
  'spotify.tocarPlaylist': async (ctx, uri) => {
    await svc(ctx).spotify.tocarPlaylist(str(uri, 200))
    return null
  },

  'biblioteca.registrar': async (ctx, dir) => {
    svc(ctx)
    return registrar(await bookDir(ctx, dir))
  },
  'biblioteca.destaque': async (ctx, dir) => {
    svc(ctx)
    return destaque(await bookDir(ctx, dir))
  }
}

/**
 * Rota HTTP do modo web: retorno do OAuth do Spotify quando a Redirect URI
 * configurada é https://<servidor>/oauth/spotify/callback.
 */
export async function spotifyCallbackRoute(ctx: Ctx, _req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== SPOTIFY_HTTPS_PATH) return false
  let ok = true
  let msg = 'Spotify conectado. Pode fechar esta aba e voltar ao Darkpages.'
  try {
    await svc(ctx).spotify.finalizarParams(url.searchParams)
  } catch (e) {
    ok = false
    msg = e instanceof Error ? e.message : String(e)
  }
  res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(donePage(ok, msg))
  return true
}
