import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { call, folio } from '../api'
import type { ScreenProps } from '../screen'
import { EditorMapa, type EditorHandle } from '../features/mapas/Editor'
import { IconeM } from '../features/mapas/icones'
import { mapaExemplo, novoMapa } from '../features/mapas/modelo'
import type { MapaResumo } from '../features/mapas/types'
import './mapas.css'

const LEMBRAR = 'folio.mapas.ultimo'

function lembrado(dir: string): string | null {
  try {
    return localStorage.getItem(`${LEMBRAR}:${dir}`)
  } catch {
    return null
  }
}
function lembrar(dir: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(`${LEMBRAR}:${dir}`, id)
    else localStorage.removeItem(`${LEMBRAR}:${dir}`)
  } catch {
    /* armazenamento indisponível */
  }
}

export function Mapas({ project, go }: ScreenProps): ReactElement {
  const dir = project.dir
  const [lista, setLista] = useState<MapaResumo[] | null>(null)
  const [ativo, setAtivo] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState('')
  const [exemplo, setExemplo] = useState(true)
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null)
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null)
  const editor = useRef<EditorHandle>(null)

  const recarregar = useCallback(async (): Promise<MapaResumo[]> => {
    const l = await call<MapaResumo[]>('mapas.listar', dir)
    setLista(l)
    return l
  }, [dir])

  useEffect(() => {
    recarregar()
      .then((l) => {
        const ult = lembrado(dir)
        setAtivo(l.find((m) => m.id === ult)?.id ?? l[0]?.id ?? null)
        setExemplo(l.length === 0)
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
  }, [dir, recarregar])

  const abrir = async (id: string): Promise<void> => {
    if (id === ativo) return
    await editor.current?.flush()
    setPopupsFechados()
    setAtivo(id)
    lembrar(dir, id)
  }
  const setPopupsFechados = (): void => {
    setRenomeando(null)
    setConfirmaExcluir(null)
  }

  const criar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const n = nome.trim() || 'Novo mapa'
    setCriando(true)
    setErro('')
    try {
      await editor.current?.flush()
      const doc = exemplo ? mapaExemplo(n) : novoMapa(n)
      await folio.docs.put(dir, 'mapas', doc.id, doc)
      await recarregar()
      setAtivo(doc.id)
      lembrar(dir, doc.id)
      setNome('')
      setExemplo(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setCriando(false)
    }
  }

  const renomear = async (id: string, novo: string): Promise<void> => {
    const n = novo.trim()
    setRenomeando(null)
    if (!n) return
    try {
      if (id === ativo && editor.current) {
        // o editor guarda o documento: renomeia por ele (autosave + lista via onResumo)
        editor.current.renomear(n)
      } else {
        await call('mapas.renomear', dir, id, n)
        await recarregar()
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  const duplicar = async (m: MapaResumo): Promise<void> => {
    try {
      if (m.id === ativo) await editor.current?.flush()
      const r = await call<{ id: string }>('mapas.duplicar', dir, m.id, `${m.nome} (cópia)`)
      await recarregar()
      setAtivo(r.id)
      lembrar(dir, r.id)
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  const excluir = async (id: string): Promise<void> => {
    setConfirmaExcluir(null)
    try {
      if (id === ativo) {
        await editor.current?.flush()
        setAtivo(null)
      }
      await folio.docs.delete(dir, 'mapas', id)
      const l = await recarregar()
      if (id === ativo) {
        const prox = l[0]?.id ?? null
        setAtivo(prox)
        lembrar(dir, prox)
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  const onResumo = useCallback((r: MapaResumo) => {
    setLista((l) => (l ? l.map((m) => (m.id === r.id ? r : m)) : l))
  }, [])

  return (
    <div className="screen mp-tela">
      <nav className="mp-lista" aria-label="Mapas do livro">
        <header>
          <span className="disp mp-titulo">Mapas</span>
          {lista && <span className="pill">{lista.length}</span>}
        </header>
        <ul className="mp-mapas">
          {(lista ?? []).map((m) => (
            <li key={m.id} className="mp-mapa-item">
              {renomeando?.id === m.id ? (
                <form
                  className="mp-renomear"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void renomear(m.id, renomeando.nome)
                  }}
                >
                  <input
                    className="input"
                    aria-label={`Novo nome para ${m.nome}`}
                    value={renomeando.nome}
                    maxLength={120}
                    autoFocus
                    onChange={(e) => setRenomeando({ id: m.id, nome: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                  />
                  <button type="submit" className="btn sm">
                    OK
                  </button>
                </form>
              ) : (
                <button type="button" className="mp-mapa" aria-current={m.id === ativo ? 'true' : undefined} onClick={() => void abrir(m.id)}>
                  <span className="mp-mapa-nome">{m.nome}</span>
                  <span className="mp-mapa-meta">
                    {m.estilo === 'pena' ? 'À pena' : 'Colorido'} · {m.itens} {m.itens === 1 ? 'item' : 'itens'}
                  </span>
                </button>
              )}
              {m.id === ativo && renomeando?.id !== m.id && (
                <div className="mp-mapa-acoes">
                  {confirmaExcluir === m.id ? (
                    <>
                      <span className="label">Excluir este mapa?</span>
                      <button type="button" className="btn sm" onClick={() => void excluir(m.id)}>
                        Excluir
                      </button>
                      <button type="button" className="btn sm" onClick={() => setConfirmaExcluir(null)}>
                        Manter
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="mp-acao" onClick={() => setRenomeando({ id: m.id, nome: m.nome })}>
                        Renomear
                      </button>
                      <button type="button" className="mp-acao" onClick={() => void duplicar(m)}>
                        Duplicar
                      </button>
                      <button type="button" className="mp-acao" onClick={() => setConfirmaExcluir(m.id)}>
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <form className="mp-novo" onSubmit={(e) => void criar(e)}>
          <label className="field">
            Novo mapa
            <input className="input" value={nome} maxLength={120} placeholder="Nome do mapa" onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={exemplo} onChange={(e) => setExemplo(e.target.checked)} />
            Começar de um exemplo
          </label>
          <button type="submit" className="btn sm" disabled={criando}>
            <IconeM nome="novo" size={16} />
            {criando ? 'Criando…' : 'Criar mapa'}
          </button>
          {erro && <p className="err">{erro}</p>}
        </form>
      </nav>

      {ativo ? (
        <EditorMapa key={ativo} ref={editor} dir={dir} mapaId={ativo} go={go} onResumo={onResumo} />
      ) : (
        <div className="empty">
          <span className="disp">{lista === null ? 'Mapas' : 'Nenhum mapa ainda'}</span>
          {lista === null
            ? 'Carregando…'
            : 'Crie o primeiro mapa do livro ao lado. Marque “Começar de um exemplo” para abrir um mapa pronto para editar.'}
        </div>
      )}
    </div>
  )
}
