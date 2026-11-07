import { useEffect, useState, type ReactElement } from 'react'
import { call, folio } from '../../api'
import type { ChapterContent } from '../../../../shared/types'
import { errText } from './model'

interface Props {
  dir: string
  file: string
  titulo: string
  /** depois de gravar (atualiza a prévia) */
  onSalvo: () => void
}

/**
 * Epígrafe de abertura de um capítulo. É conteúdo do capítulo: fica no
 * front-matter do arquivo (chave "epigrafe"), gravada só por
 * `diagramacao.epigrafe`, que não toca no resto do arquivo.
 */
export function EpigrafeCapitulo({ dir, file, titulo, onSalvo }: Props): ReactElement {
  const [texto, setTexto] = useState('')
  const [autor, setAutor] = useState('')
  const [salvo, setSalvo] = useState({ texto: '', autor: '' })
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    folio
      .readChapter(dir, file)
      .then((c) => {
        if (!vivo) return
        const t = c.epigrafe?.texto ?? ''
        const a = c.epigrafe?.autor ?? ''
        setTexto(t)
        setAutor(a)
        setSalvo({ texto: t, autor: a })
      })
      .catch((e) => vivo && setMsg(errText(e)))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [dir, file])

  const mudou = texto !== salvo.texto || autor !== salvo.autor

  const gravar = async (limpar = false): Promise<void> => {
    setMsg(null)
    try {
      const valor = limpar || !texto.trim() ? null : { texto, autor }
      const c = await call<ChapterContent>('diagramacao.epigrafe', dir, file, valor)
      const t = c.epigrafe?.texto ?? ''
      const a = c.epigrafe?.autor ?? ''
      setTexto(t)
      setAutor(a)
      setSalvo({ texto: t, autor: a })
      setMsg(valor ? 'Epígrafe salva.' : 'Epígrafe removida.')
      onSalvo()
    } catch (e) {
      setMsg(errText(e))
    }
  }

  return (
    <div className="dg-epi" aria-busy={carregando}>
      <label className="field">
        Epígrafe de “{titulo}”
        <textarea
          className="input"
          rows={3}
          value={texto}
          disabled={carregando}
          placeholder="Uma linha por verso; aceita *itálico*"
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <label className="field">
        Autor da citação
        <input className="input" value={autor} disabled={carregando} onChange={(e) => setAutor(e.target.value)} />
      </label>
      <span className="dg-actions">
        <button type="button" className="btn sm pri" disabled={carregando || !mudou} onClick={() => void gravar()}>
          Salvar
        </button>
        {salvo.texto && (
          <button type="button" className="btn sm" disabled={carregando} onClick={() => void gravar(true)}>
            Remover
          </button>
        )}
      </span>
      {msg && (
        <span className="label" role="status">
          {msg}
        </span>
      )}
    </div>
  )
}
