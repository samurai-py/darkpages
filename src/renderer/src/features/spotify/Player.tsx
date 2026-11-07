import { useEffect, useState, type ReactElement } from 'react'
import { errMsg, spotifyApi, useVisiblePolling, type Agora } from '../sync/api'
import { SpotifyLogo } from './SpotifyLogo'
import './spotify.css'

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Disco(): ReactElement {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <rect width="52" height="52" rx="8" style={{ fill: 'var(--chipbg)' }} />
      <circle cx="26" cy="26" r="15" fill="none" style={{ stroke: 'var(--line)' }} strokeWidth="1.2" />
      <circle cx="26" cy="26" r="9" fill="none" style={{ stroke: 'var(--line)' }} strokeWidth=".8" />
      <circle cx="26" cy="26" r="2.6" style={{ fill: 'var(--muted)' }} />
    </svg>
  )
}

const CHAVE_MINI = 'folio.spotify.mini'

function lerMini(): boolean {
  try {
    return localStorage.getItem(CHAVE_MINI) === '1'
  } catch {
    return false
  }
}

/** Player "tocando agora" do Spotify. DONO: Sync/Spotify. Usado pelo Manuscrito. */
export function SpotifyPlayer({ className = '' }: { className?: string }): ReactElement | null {
  const [a, setA] = useState<Agora | null>(null)
  const [recv, setRecv] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mini, setMini] = useState<boolean>(() => lerMini())
  const alternarMini = (v: boolean): void => {
    setMini(v)
    try {
      localStorage.setItem(CHAVE_MINI, v ? '1' : '0')
    } catch {
      /* sem armazenamento: só nesta sessão */
    }
  }

  const apply = (x: Agora): void => {
    setA(x)
    setRecv(Date.now())
    setNow(Date.now())
  }

  useVisiblePolling(async () => {
    try {
      apply(await spotifyApi.agora())
    } catch (e) {
      setAviso(errMsg(e))
    }
  }, 5000)

  // progresso animado entre as consultas
  useEffect(() => {
    if (!a?.tocando) return
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [a?.tocando])

  const cmd = async (c: 'play' | 'pause' | 'next' | 'previous'): Promise<void> => {
    setBusy(true)
    setAviso(null)
    if (a && (c === 'play' || c === 'pause')) {
      setA({ ...a, tocando: c === 'play', progressoMs: a.progressoMs + (a.tocando ? Date.now() - recv : 0) })
      setRecv(Date.now())
    }
    try {
      apply(await spotifyApi.comando(c))
    } catch (e) {
      setAviso(errMsg(e))
      try {
        apply(await spotifyApi.agora())
      } catch {
        /* mantém o último estado */
      }
    } finally {
      setBusy(false)
    }
  }

  if (!a) return null

  if (a.falha === 'desconectado') {
    return (
      <div className={`sp sp-off ${className}`}>
        <SpotifyLogo size={16} label={null} />
        <span>Spotify: conecte nas configurações</span>
      </div>
    )
  }

  const temFaixa = Boolean(a.faixa)
  const prog = Math.min(a.duracaoMs, a.progressoMs + (a.tocando ? now - recv : 0))
  const pct = a.duracaoMs > 0 ? (prog / a.duracaoMs) * 100 : 0
  const contexto = a.contexto?.nome ? `${a.contexto.tipo === 'playlist' ? 'playlist' : a.contexto.tipo === 'album' ? 'álbum' : ''} “${a.contexto.nome}”`.trim() : a.album
  const mensagem = aviso ?? (temFaixa ? null : a.mensagem)

  if (mini) {
    return (
      <div className={`sp-mini ${className}`} role="group" aria-label="Spotify minimizado">
        <SpotifyLogo size={16} label={null} />
        <span className="sp-mini-t" title={temFaixa ? `${a.faixa} · ${a.artistas}` : undefined}>
          {temFaixa ? a.faixa : 'Spotify'}
        </span>
        {a.tocando && (
          <span className="sp-eq sp-eq-s" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <button type="button" className="sp-b sp-b-s" aria-label={a.tocando ? 'Pausar' : 'Tocar'} disabled={busy} onClick={() => void cmd(a.tocando ? 'pause' : 'play')}>
          {a.tocando ? (
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 2v10l8-5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button type="button" className="sp-b sp-b-s" aria-label="Expandir o player" title="Expandir" onClick={() => alternarMini(false)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 7.5L6 4.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <section className={`sp panel ${className}`} aria-label="Tocando agora no Spotify">
      <button type="button" className="sp-b sp-min" aria-label="Minimizar o player" title="Minimizar" onClick={() => alternarMini(true)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5L6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="sp-top">
        {a.capa ? <img className="sp-cover" src={a.capa} alt="" width={52} height={52} /> : <Disco />}
        <div className="sp-meta">
          <span className="sp-track">{temFaixa ? a.faixa : 'Nada tocando'}</span>
          <span className="sp-sub">{temFaixa ? [a.artistas, contexto].filter(Boolean).join(' · ') : 'Abra o Spotify e toque algo'}</span>
        </div>
        {a.tocando && (
          <span className="sp-eq" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      {temFaixa && (
        <div className="sp-prog">
          <span>{mmss(prog)}</span>
          <span
            className="sp-bar"
            role="progressbar"
            aria-label="Progresso da faixa"
            aria-valuemin={0}
            aria-valuemax={Math.round(a.duracaoMs / 1000)}
            aria-valuenow={Math.round(prog / 1000)}
            aria-valuetext={`${mmss(prog)} de ${mmss(a.duracaoMs)}`}
          >
            <span style={{ width: `${pct}%` }} />
          </span>
          <span>{mmss(a.duracaoMs)}</span>
        </div>
      )}
      {mensagem && (
        <p className="sp-msg" role="status">
          {mensagem}
        </p>
      )}
      <div className="sp-ctl">
        <SpotifyLogo size={18} />
        <span className="sp-dev">{a.dispositivo ? `Spotify · ${a.dispositivo}` : 'Spotify'}</span>
        <button type="button" className="sp-b" aria-label="Faixa anterior" disabled={busy || !temFaixa} onClick={() => void cmd('previous')}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3v10M13 3L5 8l8 5z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="sp-play"
          aria-label={a.tocando ? 'Pausar' : 'Tocar'}
          disabled={busy}
          onClick={() => void cmd(a.tocando ? 'pause' : 'play')}
        >
          {a.tocando ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 2v10l8-5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button type="button" className="sp-b" aria-label="Próxima faixa" disabled={busy || !temFaixa} onClick={() => void cmd('next')}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13 3v10M3 3l8 5-8 5z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  )
}
