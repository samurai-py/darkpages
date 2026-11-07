import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { errMsg, relTime, syncApi, useVisiblePolling, type SyncStatus as Status } from './api'
import './sync.css'

type Estado = 'desconectado' | 'conflito' | 'offline' | 'erro' | 'enviando' | 'emdia' | 'carregando'

const ROTULO: Record<Estado, string> = {
  carregando: 'Verificando…',
  desconectado: 'Drive desconectado',
  conflito: 'Conflito no Drive',
  offline: 'Offline',
  erro: 'Erro no Drive',
  enviando: 'Enviando ao Drive',
  emdia: 'Drive em dia'
}

function estadoDe(s: Status | null): Estado {
  if (!s) return 'carregando'
  if (!s.conectado) return 'desconectado'
  if (s.conflitos.length) return 'conflito'
  if (s.offline) return 'offline'
  if (s.erro) return 'erro'
  if (s.enviando || s.pendentes > 0) return 'enviando'
  return 'emdia'
}

/** Nuvem com o selo do estado. */
export function CloudIcon({ estado, size = 18 }: { estado: Estado; size?: number }): ReactElement {
  const cloud = 'M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 8.6 5 5 0 0 0 7 18.5z'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={cloud} fill="currentColor" fillOpacity=".14" />
      <path d={cloud} />
      {estado === 'emdia' && <path d="M9.2 13.4l2 2 3.8-4" />}
      {estado === 'enviando' && <path d="M12 16v-5.5M9.6 12.6L12 10.2l2.4 2.4" />}
      {estado === 'offline' && <path d="M4 4l16 16" />}
      {(estado === 'conflito' || estado === 'erro') && (
        <>
          <path d="M12 10v3.4" />
          <circle cx="12" cy="15.8" r=".7" fill="currentColor" stroke="none" />
        </>
      )}
      {estado === 'desconectado' && <path d="M9.5 13.5h5" strokeDasharray="1.2 1.6" />}
    </svg>
  )
}

/** Indicador de sincronização com o Google Drive. DONO: Sync. Usado na barra de status do Manuscrito. */
export function SyncStatus({ dir }: { dir: string }): ReactElement | null {
  const [s, setS] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const load = async (): Promise<void> => {
    try {
      setS(await syncApi.status(dir))
    } catch (e) {
      setErro(errMsg(e))
    }
  }
  useVisiblePolling(load, open ? 4000 : 10000)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const act = async (fn: () => Promise<Status>): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      setS(await fn())
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const estado = estadoDe(s)
  const quando = s?.ultimaVerificacao ?? s?.ultimoEnvio ?? null

  return (
    <div className="sy" ref={box}>
      <button
        ref={btn}
        type="button"
        className={`sy-btn sy-${estado}`}
        aria-expanded={open}
        aria-controls={panelId}
        title={ROTULO[estado]}
        onClick={() => setOpen((o) => !o)}
      >
        <CloudIcon estado={estado} />
        <span className="sy-lbl">
          {estado === 'enviando' && s ? `Enviando ${s.pendentes || ''}`.trim() : ROTULO[estado]}
        </span>
      </button>
      <span className="sy-live" role="status" aria-live="polite">
        {estado === 'conflito' ? 'Há um conflito de sincronização' : ''}
      </span>
      {open && (
        <div id={panelId} className="sy-pop panel" role="dialog" aria-label="Sincronização com o Google Drive">
          <div className="sy-head">
            <span className={`sy-ico sy-${estado}`}>
              <CloudIcon estado={estado} size={22} />
            </span>
            <div>
              <strong>{ROTULO[estado]}</strong>
              <span className="muted">{s?.conectado ? s.conta : 'Salvamento automático no Drive desligado'}</span>
            </div>
          </div>

          {s && !s.conectado && (
            <p className="sy-p">
              O livro continua salvo neste computador. Para espelhar no Google Drive, conecte sua conta em <b>Ajustes</b>.
            </p>
          )}

          {s?.conectado && (
            <dl className="sy-dl">
              <dt>Última sincronização</dt>
              <dd>{relTime(quando)}</dd>
              <dt>Pendentes</dt>
              <dd>{s.pendentes === 0 ? 'nenhum' : `${s.pendentes} arquivo${s.pendentes > 1 ? 's' : ''}`}</dd>
              {s.proximaTentativa && (
                <>
                  <dt>Nova tentativa</dt>
                  <dd>{new Date(s.proximaTentativa).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</dd>
                </>
              )}
            </dl>
          )}

          {s?.offline && <p className="sy-p">Sem internet. As mudanças ficam na fila e sobem sozinhas quando a conexão voltar.</p>}
          {s?.erro && <p className="err sy-p">{s.erro}</p>}

          {s && s.conflitos.length > 0 && (
            <div className="sy-conf">
              <p className="sy-p">
                Este arquivo mudou aqui e no Drive. Nenhuma versão foi apagada: a do Drive está salva ao lado, com “conflito” no nome.
                Escolha qual fica como principal; a outra continua na cópia.
              </p>
              <ul>
                {s.conflitos.map((c) => (
                  <li key={c.arquivo}>
                    <code title={c.arquivo}>{c.arquivo}</code>
                    <span className="muted">cópia: {c.copia.split('/').pop()}</span>
                    <span className="sy-row">
                      <button type="button" className="btn sm" disabled={busy} onClick={() => void act(() => syncApi.resolver(dir, c.arquivo, 'local'))}>
                        Manter a deste computador
                      </button>
                      <button type="button" className="btn sm" disabled={busy} onClick={() => void act(() => syncApi.resolver(dir, c.arquivo, 'remoto'))}>
                        Usar a do Drive
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {erro && <p className="err sy-p">{erro}</p>}

          {s?.conectado && (
            <div className="sy-row">
              <button type="button" className="btn sm" disabled={busy} onClick={() => void act(() => syncApi.agora(dir))}>
                {busy ? 'Sincronizando…' : 'Sincronizar agora'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
