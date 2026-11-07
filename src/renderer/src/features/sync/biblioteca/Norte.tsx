import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio } from '../../../api'
import type { Marco } from '../../../../../shared/models'
import { errMsg } from '../api'
import { hojeLocal, novoId } from './util'

function dataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

/** Norte (X2): marcos até o lançamento, coleção "norte" (um doc por marco). */
export function Norte({ dir }: { dir: string }): ReactElement {
  const [marcos, setMarcos] = useState<Marco[]>([])
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(hojeLocal())
  const [adding, setAdding] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void folio.docs.list<Omit<Marco, 'id'>>(dir, 'norte').then(setMarcos, (e: unknown) => setErro(errMsg(e)))
  }, [dir])

  const sorted = [...marcos].sort((a, b) => a.data.localeCompare(b.data))
  const hoje = hojeLocal()
  const proximo = sorted.find((m) => !m.feito)

  const salvar = async (m: Marco): Promise<void> => {
    setErro(null)
    try {
      const { id, ...rest } = m
      const saved = await folio.docs.put(dir, 'norte', id, rest)
      setMarcos((list) => [...list.filter((x) => x.id !== id), saved])
    } catch (e) {
      setErro(errMsg(e))
    }
  }

  const add = (e: FormEvent): void => {
    e.preventDefault()
    if (!titulo.trim() || !data) return
    void salvar({ id: novoId('marco'), titulo: titulo.trim().slice(0, 200), data, feito: false }).then(() => {
      setTitulo('')
      setAdding(false)
    })
  }

  const remover = async (id: string): Promise<void> => {
    setErro(null)
    try {
      await folio.docs.delete(dir, 'norte', id)
      setMarcos((list) => list.filter((x) => x.id !== id))
    } catch (e) {
      setErro(errMsg(e))
    }
  }

  return (
    <div className="panel bib-card">
      <span className="bib-eb">Norte · até o lançamento</span>
      {sorted.length === 0 && !adding && <p className="bib-empty">Nenhum marco ainda. Ex.: “Primeiro rascunho”, “Revisão”, “Capa”, “Lançamento”.</p>}
      {sorted.length > 0 && (
        <ul className="bib-norte">
          {sorted.map((m) => {
            const atrasado = !m.feito && m.data < hoje
            return (
              <li key={m.id} className={m.feito ? 'feito' : m === proximo ? 'proximo' : ''}>
                <label>
                  <input type="checkbox" checked={m.feito} onChange={(e) => void salvar({ ...m, feito: e.target.checked })} />
                  <span className="t">{m.titulo}</span>
                </label>
                <span className={`d${atrasado ? ' late' : ''}`} title={atrasado ? 'Data já passou' : undefined}>
                  {dataCurta(m.data)}
                </span>
                <button type="button" className="bib-x" aria-label={`Remover marco ${m.titulo}`} onClick={() => void remover(m.id)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {adding ? (
        <form className="bib-form" onSubmit={add}>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Marco" aria-label="Nome do marco" autoFocus />
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data do marco" />
          <span className="bib-row">
            <button type="submit" className="btn sm" disabled={!titulo.trim()}>Adicionar</button>
            <button type="button" className="btn sm" onClick={() => setAdding(false)}>Cancelar</button>
          </span>
        </form>
      ) : (
        <button type="button" className="btn sm bib-self" onClick={() => setAdding(true)}>+ Marco</button>
      )}
      {erro && <p className="err">{erro}</p>}
    </div>
  )
}
