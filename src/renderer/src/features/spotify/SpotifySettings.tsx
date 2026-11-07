import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio, isWeb } from '../../api'
import { errMsg, spotifyApi, useVisiblePolling, type EstadoSpotify } from '../sync/api'
import { SpotifyLogo } from './SpotifyLogo'
import './spotify.css'

const PADRAO = 'http://127.0.0.1:43827/callback'

/** Conexão do Spotify (montado pelo painel de Ajustes do Sync). */
export function SpotifySettings(): ReactElement {
  const [clientId, setClientId] = useState('')
  const [redirect, setRedirect] = useState('')
  const [e, setE] = useState<EstadoSpotify | null>(null)
  const [colada, setColada] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void folio.settings.get<Record<string, unknown>>('spotify').then((s) => {
      setClientId(typeof s['clientId'] === 'string' ? s['clientId'] : '')
      setRedirect(typeof s['redirectUri'] === 'string' ? s['redirectUri'] : '')
    }, (x: unknown) => setErro(errMsg(x)))
    void spotifyApi.estado().then(setE, (x: unknown) => setErro(errMsg(x)))
  }, [])

  useVisiblePolling(
    async () => {
      try {
        setE(await spotifyApi.estado())
      } catch (x) {
        setErro(errMsg(x))
      }
    },
    2500,
    e?.pendente?.modo === 'automatico'
  )

  const save = async (ev?: FormEvent): Promise<void> => {
    ev?.preventDefault()
    setErro(null)
    await folio.settings.put('spotify', { clientId: clientId.trim(), redirectUri: redirect.trim() })
    setE(await spotifyApi.estado())
  }

  const run = async (fn: () => Promise<EstadoSpotify>): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      setE(await fn())
    } catch (x) {
      setErro(errMsg(x))
    } finally {
      setBusy(false)
    }
  }

  const uri = e?.redirectUri ?? (redirect.trim() || PADRAO)
  const p = e?.pendente ?? null

  return (
    <section className="panel sy-card" aria-labelledby="sp-set-h">
      <header>
        <SpotifyLogo size={26} />
        <h2 id="sp-set-h" className="disp">Spotify</h2>
        <span className="pill">{e?.conectado ? <span className="sy-ok"><b>{e.conta || 'Conectado'}</b></span> : 'Desconectado'}</span>
      </header>
      <p className="sy-hint">
        Mostra o que está tocando no seu Spotify (no computador, celular ou caixa de som) e controla a música sem sair do texto.
        O áudio continua no app do Spotify. Os controles exigem conta <b>Premium</b>.
      </p>

      <form
        className="sy-set"
        onSubmit={(ev) => {
          ev.preventDefault()
          void run(async () => {
            await save()
            return spotifyApi.estado()
          })
        }}
      >
        <div className="sy-grid">
          <label className="field">
            Client ID do app do Spotify
            <input className="input" value={clientId} onChange={(x) => setClientId(x.target.value)} placeholder="32 caracteres" autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            Redirect URI (opcional)
            <input className="input" value={redirect} onChange={(x) => setRedirect(x.target.value)} placeholder={PADRAO} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className="sy-row">
          <button type="submit" className="btn sm">Salvar</button>
          {e?.conectado ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => void run(() => spotifyApi.desconectar())}>Desconectar</button>
          ) : (
            <button
              type="button"
              className="btn pri sm"
              disabled={busy || !clientId.trim()}
              onClick={() => void run(async () => {
                await save()
                return spotifyApi.conectar()
              })}
            >
              Conectar Spotify
            </button>
          )}
        </div>
      </form>

      {p && (
        <div className="sy-device" role="status">
          <a className="sy-link" href={p.url} target="_blank" rel="noopener noreferrer">
            {isWeb ? 'Abrir a página de autorização do Spotify' : 'Se o navegador não abriu, clique aqui para autorizar'}
          </a>
          {p.modo === 'colar' ? (
            <form
              className="sy-set"
              style={{ width: '100%', gap: 10 }}
              onSubmit={(ev) => {
                ev.preventDefault()
                void run(() => spotifyApi.finalizar(colada)).then(() => setColada(''))
              }}
            >
              <span className="sy-hint">
                Depois de autorizar, o navegador vai para <code>{uri}</code> e mostra erro de conexão. Isso é esperado:
                copie o endereço inteiro da barra e cole aqui.
              </span>
              <input className="input" value={colada} onChange={(x) => setColada(x.target.value)} placeholder={`${uri}?code=…&state=…`} aria-label="Endereço de retorno do Spotify" spellCheck={false} />
              <button type="submit" className="btn sm" disabled={busy || !colada.includes('code=')} style={{ alignSelf: 'flex-start' }}>Concluir conexão</button>
            </form>
          ) : (
            <span className="sy-hint">Esperando a autorização no navegador…</span>
          )}
        </div>
      )}
      {(erro ?? e?.erro) && <p className="err" role="alert">{erro ?? e?.erro}</p>}

      <details className="sy-details">
        <summary>Passo a passo: criar o app no Spotify</summary>
        <ol className="sy-steps">
          <li>Entre em <a className="sy-link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">developer.spotify.com/dashboard</a> com sua conta (o dono do app precisa ter Premium) e clique em <b>Create app</b>.</li>
          <li>Nome e descrição livres. Em <b>Redirect URIs</b>, adicione exatamente <code>{uri}</code>. O Spotify não aceita “localhost”, só <code>127.0.0.1</code> ou https.</li>
          <li>Em <b>Which API/SDKs are you planning to use?</b>, marque <b>Web API</b>, aceite os termos e salve.</li>
          <li>Abra <b>Settings</b> do app e copie o <b>Client ID</b> para o campo acima. Não é preciso o Client secret (o Folio usa PKCE).</li>
          <li>Em <b>User Management</b>, adicione o e-mail da conta Spotify que vai usar (apps em modo de desenvolvimento aceitam até 5 usuários).</li>
          {isWeb ? (
            <li>
              Modo web: depois de autorizar, cole aqui o endereço em que o navegador parou. Alternativa sem colar: publique o servidor em https
              (ex.: <code>tailscale serve</code>), cadastre <code>https://SEU-ENDERECO/oauth/spotify/callback</code> no Spotify e preencha o mesmo valor em Redirect URI acima.
            </li>
          ) : (
            <li>Clique em <b>Conectar Spotify</b>: o navegador abre, você autoriza e o Folio recebe o retorno sozinho na porta 43827.</li>
          )}
        </ol>
      </details>
    </section>
  )
}
