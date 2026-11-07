import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call } from '../../api'
import type { Ficha } from '../../../../shared/models'
import { TIPO_ROTULO, porNome } from './fichas'
import { Mini } from './icons'

interface LivroDaSerie {
  dir: string
  title: string
  fichas: number
}

/** U3: traz fichas de outro livro da série (mesmo id: importar de novo atualiza). */
export function ImportarSerie({
  dir,
  existentes,
  onFechar,
  onImportado
}: {
  dir: string
  existentes: Set<string>
  onFechar: () => void
  onImportado: (msg: string) => void
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const [livros, setLivros] = useState<LivroDaSerie[] | null>(null)
  const [origem, setOrigem] = useState('')
  const [fichas, setFichas] = useState<Ficha[] | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
    call<LivroDaSerie[]>('universo.livros', dir)
      .then((l) => {
        setLivros(l)
        if (l[0]) setOrigem(l[0].dir)
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
  }, [dir])

  useEffect(() => {
    if (!origem) return
    let vivo = true
    setFichas(null)
    call<Ficha[]>('universo.fichasDe', origem)
      .then((f) => {
        if (!vivo) return
        const ord = [...f].sort(porNome)
        setFichas(ord)
        setMarcadas(new Set(ord.map((x) => x.id)))
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [origem])

  const alternar = (id: string): void =>
    setMarcadas((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const importar = async (): Promise<void> => {
    setOcupado(true)
    setErro('')
    try {
      const r = await call<{ importadas: number; atualizadas: number }>('universo.importar', dir, origem, [...marcadas])
      onImportado(`${r.importadas} importada(s), ${r.atualizadas} atualizada(s).`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <dialog ref={ref} className="uv-dialog panel" aria-labelledby="uv-imp-t" onClose={onFechar}>
      <header className="uv-dhead">
        <h2 id="uv-imp-t" className="disp">
          Fichas da série
        </h2>
        <button type="button" className="uv-ico" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <Mini name="fechar" />
        </button>
      </header>
      <p className="label">
        Copia fichas (e retratos) de outro livro que você já abriu. A ficha mantém o mesmo id, então importar de novo
        atualiza a cópia com a versão do outro livro.
      </p>
      {erro && <p className="err">{erro}</p>}
      {livros && livros.length === 0 && <p className="label">Nenhum outro livro aberto recentemente.</p>}
      {livros && livros.length > 0 && (
        <label className="field">
          Livro de origem
          <select className="select" value={origem} onChange={(e) => setOrigem(e.target.value)}>
            {livros.map((l) => (
              <option key={l.dir} value={l.dir}>
                {l.title} · {l.fichas} {l.fichas === 1 ? 'ficha' : 'fichas'}
              </option>
            ))}
          </select>
        </label>
      )}
      {origem && !fichas && !erro && <p className="label">Carregando fichas…</p>}
      {fichas && fichas.length === 0 && <p className="label">Esse livro não tem fichas.</p>}
      {fichas && fichas.length > 0 && (
        <>
          <div className="uv-row">
            <button type="button" className="btn sm" onClick={() => setMarcadas(new Set(fichas.map((f) => f.id)))}>
              Marcar todas
            </button>
            <button type="button" className="btn sm" onClick={() => setMarcadas(new Set())}>
              Desmarcar
            </button>
          </div>
          <ul className="uv-implist">
            {fichas.map((f) => (
              <li key={f.id}>
                <label className="check">
                  <input type="checkbox" checked={marcadas.has(f.id)} onChange={() => alternar(f.id)} />
                  <span>
                    {f.nome} <span className="label">· {TIPO_ROTULO[f.tipo]?.um ?? f.tipo}</span>
                    {existentes.has(f.id) && <span className="uv-tag">atualiza</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <footer className="uv-row uv-end">
        <button type="button" className="btn sm" onClick={() => ref.current?.close()}>
          Cancelar
        </button>
        <button type="button" className="btn sm pri" disabled={ocupado || marcadas.size === 0 || !origem} onClick={() => void importar()}>
          <Mini name="importar" /> Importar {marcadas.size || ''}
        </button>
      </footer>
    </dialog>
  )
}
