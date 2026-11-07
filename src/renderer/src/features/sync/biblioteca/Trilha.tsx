import { useEffect, useState, type ReactElement } from 'react'
import { folio } from '../../../api'
import { SpotifyLogo } from '../../spotify/SpotifyLogo'
import { errMsg, spotifyApi, type EstadoSpotify, type Playlist } from '../api'

/** Coleção "config" doc "trilha": playlist do livro. */
export interface TrilhaDoc {
  uri: string
  nome: string
  /** capa como data URL (as URLs do Spotify expiram em menos de um dia) */
  imagem: string | null
  faixas: number | null
}

/** Trilha do livro (X9): playlist escolhida e botão de tocar. */
export function Trilha({ dir, onAjustes }: { dir: string; onAjustes: () => void }): ReactElement {
  const [estado, setEstado] = useState<EstadoSpotify | null>(null)
  const [trilha, setTrilha] = useState<TrilhaDoc | null>(null)
  const [lista, setLista] = useState<Playlist[] | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  useEffect(() => {
    void spotifyApi.estado().then(setEstado, () => setEstado(null))
    void folio.docs.get<TrilhaDoc>(dir, 'config', 'trilha').then((t) => setTrilha(t), () => setTrilha(null))
  }, [dir])

  const abrirEscolha = async (): Promise<void> => {
    setEscolhendo(true)
    setMsg(null)
    if (lista) return
    setBusy(true)
    try {
      const l = await spotifyApi.playlists()
      setLista(l)
      setSel(trilha?.uri ?? l[0]?.uri ?? '')
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  const salvar = async (): Promise<void> => {
    const p = lista?.find((x) => x.uri === sel)
    if (!p) return
    setBusy(true)
    setMsg(null)
    try {
      const imagem = p.imagem ? await spotifyApi.imagem(p.imagem) : null
      const doc: TrilhaDoc = { uri: p.uri, nome: p.nome, imagem, faixas: p.faixas }
      await folio.docs.put(dir, 'config', 'trilha', doc)
      setTrilha(doc)
      setEscolhendo(false)
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  const tocar = async (): Promise<void> => {
    if (!trilha) return
    setBusy(true)
    setMsg(null)
    try {
      await spotifyApi.tocarPlaylist(trilha.uri)
      setMsg({ ok: true, t: `Tocando “${trilha.nome}”.` })
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  const conectado = Boolean(estado?.conectado)

  return (
    <div className="panel bib-card">
      <span className="bib-eb">Trilha deste livro</span>
      {trilha ? (
        <div className="bib-trilha">
          {trilha.imagem ? <img src={trilha.imagem} alt="" width={64} height={64} /> : <span className="ph" aria-hidden="true"><SpotifyLogo size={26} label={null} /></span>}
          <div>
            <strong>{trilha.nome}</strong>
            <span>Spotify{trilha.faixas !== null ? ` · ${trilha.faixas} faixas` : ''}</span>
          </div>
        </div>
      ) : (
        <p className="bib-empty">Escolha uma playlist do Spotify para tocar enquanto escreve este livro.</p>
      )}

      {!conectado ? (
        <button type="button" className="btn sm bib-self" onClick={onAjustes}>
          <SpotifyLogo size={14} label={null} />
          Conectar o Spotify em Ajustes
        </button>
      ) : escolhendo ? (
        <div className="bib-form">
          {lista && lista.length === 0 && <p className="bib-empty">Nenhuma playlist na sua conta.</p>}
          {lista && lista.length > 0 && (
            <select className="select" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Playlist do livro">
              {lista.map((p) => (
                <option key={p.uri} value={p.uri}>
                  {p.nome}
                  {p.faixas !== null ? ` (${p.faixas})` : ''}
                </option>
              ))}
            </select>
          )}
          <span className="bib-row">
            <button type="button" className="btn sm" disabled={busy || !sel} onClick={() => void salvar()}>{busy ? 'Carregando…' : 'Usar esta'}</button>
            <button type="button" className="btn sm" onClick={() => setEscolhendo(false)}>Cancelar</button>
          </span>
        </div>
      ) : (
        <span className="bib-row">
          {trilha && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => void tocar()}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="#1DB954" />
                <path d="M9.5 7.5v9l7-4.5z" fill="#0B0C11" />
              </svg>
              Tocar enquanto escrevo
            </button>
          )}
          <button type="button" className="btn sm" disabled={busy} onClick={() => void abrirEscolha()}>{trilha ? 'Trocar' : 'Escolher playlist'}</button>
        </span>
      )}
      {msg && <p className={msg.ok ? 'bib-empty' : 'err'} role="status">{msg.t}</p>}
    </div>
  )
}
