import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react'
import { fileToDataUrl, folio } from '../../../api'
import { errMsg } from '../api'
import { novoId } from './util'

/** Coleção "inspiracoes": um doc por item do quadro. */
export interface Inspiracao {
  id: string
  tipo: 'imagem' | 'frase'
  /** nome do arquivo em assets/ (tipo imagem) */
  asset?: string
  texto: string
  criadoEm: string
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 15 * 1024 * 1024

/** Inspirações (X4): quadro de imagens e frases do livro. */
export function Inspiracoes({ dir }: { dir: string }): ReactElement {
  const [itens, setItens] = useState<Inspiracao[]>([])
  const [imgs, setImgs] = useState<Record<string, string>>({})
  const [frase, setFrase] = useState('')
  const [modo, setModo] = useState<'ver' | 'frase'>('ver')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const list = await folio.docs.list<Omit<Inspiracao, 'id'>>(dir, 'inspiracoes')
        if (!vivo) return
        setItens(list)
        for (const it of list) {
          if (it.tipo !== 'imagem' || !it.asset) continue
          const url = await folio.assets.get(dir, it.asset)
          if (vivo && url) setImgs((m) => ({ ...m, [it.id]: url }))
        }
      } catch (e) {
        if (vivo) setErro(errMsg(e))
      }
    })()
    return () => {
      vivo = false
    }
  }, [dir])

  const salvar = async (it: Inspiracao): Promise<void> => {
    const { id, ...rest } = it
    const saved = await folio.docs.put(dir, 'inspiracoes', id, rest)
    setItens((l) => [...l, saved])
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErro(null)
    const ext = EXT[f.type]
    if (!ext) return setErro('Use uma imagem PNG, JPG ou WebP.')
    if (f.size > MAX_BYTES) return setErro('Imagem grande demais (máximo 15 MB).')
    setBusy(true)
    try {
      const id = novoId('insp')
      const asset = `${id}.${ext}`
      const url = await fileToDataUrl(f)
      await folio.assets.put(dir, asset, url)
      await salvar({ id, tipo: 'imagem', asset, texto: f.name.replace(/\.[^.]+$/, '').slice(0, 200), criadoEm: new Date().toISOString() })
      setImgs((m) => ({ ...m, [id]: url }))
    } catch (err) {
      setErro(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const addFrase = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!frase.trim()) return
    setErro(null)
    try {
      await salvar({ id: novoId('insp'), tipo: 'frase', texto: frase.trim().slice(0, 600), criadoEm: new Date().toISOString() })
      setFrase('')
      setModo('ver')
    } catch (err) {
      setErro(errMsg(err))
    }
  }

  const remover = async (id: string): Promise<void> => {
    setErro(null)
    try {
      const asset = itens.find((x) => x.id === id)?.asset
      await folio.docs.delete(dir, 'inspiracoes', id)
      if (asset) await folio.assets.delete(dir, asset).catch(() => undefined)
      setItens((l) => l.filter((x) => x.id !== id))
    } catch (err) {
      setErro(errMsg(err))
    }
  }

  const ordenados = [...itens].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))

  return (
    <div className="panel bib-card">
      <span className="bib-eb">Inspirações</span>
      {ordenados.length === 0 && modo === 'ver' && <p className="bib-empty">Imagens, frases e referências que lembram o tom do livro.</p>}
      {ordenados.length > 0 && (
        <ul className="bib-insp">
          {ordenados.map((it) => (
            <li key={it.id} className={it.tipo}>
              {it.tipo === 'imagem' ? (
                imgs[it.id] ? <img src={imgs[it.id]} alt={it.texto || 'Inspiração'} /> : <span className="ph" aria-label="Carregando imagem" />
              ) : (
                <q>{it.texto}</q>
              )}
              <button type="button" className="bib-x" aria-label={`Remover inspiração ${it.texto.slice(0, 40)}`} onClick={() => void remover(it.id)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {modo === 'frase' ? (
        <form className="bib-form" onSubmit={(e) => void addFrase(e)}>
          <textarea className="input bib-ta" value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="“o silêncio também badala”" aria-label="Frase" autoFocus rows={2} />
          <span className="bib-row">
            <button type="submit" className="btn sm" disabled={!frase.trim()}>Guardar</button>
            <button type="button" className="btn sm" onClick={() => setModo('ver')}>Cancelar</button>
          </span>
        </form>
      ) : (
        <span className="bib-row">
          <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Enviando…' : '+ Imagem'}</button>
          <button type="button" className="btn sm" onClick={() => setModo('frase')}>+ Frase</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e)} />
        </span>
      )}
      {erro && <p className="err">{erro}</p>}
    </div>
  )
}
