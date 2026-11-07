import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { fileToDataUrl, folio } from '../api'
import { ASSET_NAMES, type Ficha, type FichaTipo } from '../../../shared/models'
import {
  COLECAO_UNIVERSO,
  TIPOS,
  TIPO_ROTULO,
  agrupar,
  casaBusca,
  normalizarFicha,
  novaFicha
} from '../features/universo/fichas'
import { FichaPanel } from '../features/universo/FichaPanel'
import { ImportarSerie } from '../features/universo/ImportarSerie'
import { PerfilObra } from '../features/universo/PerfilObra'
import { Mini } from '../features/universo/icons'
import { Retrato, definirRetrato, esquecerRetratos, imagemParaPng, useRetratos } from '../features/universo/Retrato'
import { desligarDoEnredo } from '../features/universo/remover'
import './universo.css'

type Aba = FichaTipo | 'todos'

const ESPERA_SALVAR = 600

export function Universo({ project, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const [fichas, setFichas] = useState<Ficha[] | null>(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('personagem')
  const [busca, setBusca] = useState('')
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [recemCriada, setRecemCriada] = useState<string | null>(null)
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('')
  const [importando, setImportando] = useState(false)
  const [perfil, setPerfil] = useState(false)
  const [aviso, setAviso] = useState('')

  // ---------- autosave por ficha (debounce + fila por id) ----------
  const fila = useRef(new Map<string, Ficha>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const cadeias = useRef(new Map<string, Promise<void>>())

  const gravar = useCallback(
    (id: string): Promise<void> => {
      const t = timers.current.get(id)
      if (t) clearTimeout(t)
      timers.current.delete(id)
      const anterior = cadeias.current.get(id) ?? Promise.resolve()
      const prox = anterior.then(async () => {
        const f = fila.current.get(id)
        if (!f) return
        fila.current.delete(id)
        setStatus('Salvando…')
        try {
          const { id: _id, ...dados } = { ...f, atualizadoEm: new Date().toISOString() }
          await folio.docs.put(dir, COLECAO_UNIVERSO, id, dados)
          if (!fila.current.has(id)) {
            setPendentes((p) => {
              const n = new Set(p)
              n.delete(id)
              return n
            })
          }
          setStatus('Salvo')
        } catch (e) {
          setStatus(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      cadeias.current.set(id, prox)
      return prox
    },
    [dir]
  )

  const salvarTudo = useCallback(async (): Promise<void> => {
    await Promise.all([...fila.current.keys()].map((id) => gravar(id)))
  }, [gravar])

  useEffect(() => {
    return () => {
      void salvarTudo()
    }
  }, [salvarTudo])

  const atualizar = useCallback(
    (f: Ficha): void => {
      setFichas((lista) => (lista ? lista.map((x) => (x.id === f.id ? f : x)) : lista))
      fila.current.set(f.id, f)
      setPendentes((p) => (p.has(f.id) ? p : new Set(p).add(f.id)))
      const t = timers.current.get(f.id)
      if (t) clearTimeout(t)
      timers.current.set(
        f.id,
        setTimeout(() => void gravar(f.id), ESPERA_SALVAR)
      )
    },
    [gravar]
  )

  // ---------- carga ----------
  useEffect(() => {
    let vivo = true
    folio.docs
      .list<Partial<Ficha>>(dir, COLECAO_UNIVERSO)
      .then((docs) => vivo && setFichas(docs.map(normalizarFicha)))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [dir])

  // abrir direto pela navegação (params.ficha), e reler o retrato (pode ter vindo da Arte)
  const carregado = fichas !== null
  useEffect(() => {
    if (!carregado || !params.ficha) return
    const alvo = fichas?.find((f) => f.id === params.ficha)
    if (!alvo) return
    setAbertaId(alvo.id)
    setAba(alvo.tipo)
    setBusca('')
    const nome = ASSET_NAMES.retrato(alvo.id)
    folio.assets
      .get(dir, nome)
      .then((url) => {
        if (!url) return
        definirRetrato(dir, nome, url)
        if (alvo.retrato !== nome) atualizar({ ...alvo, retrato: nome })
      })
      .catch(() => undefined)
    // só quando chega um novo params.ficha ou a lista termina de carregar
  }, [params.ficha, carregado])

  const lista = fichas ?? []
  const retratos = useRetratos(dir, lista)
  const aberta = lista.find((f) => f.id === abertaId) ?? null

  const filtradas = useMemo(() => lista.filter((f) => casaBusca(f, busca)), [lista, busca])
  const contagem = useMemo(() => {
    const c: Record<Aba, number> = { todos: filtradas.length, personagem: 0, lugar: 0, objeto: 0, grupo: 0, divindade: 0 }
    for (const f of filtradas) c[f.tipo]++
    return c
  }, [filtradas])
  const visiveis = aba === 'todos' ? filtradas : filtradas.filter((f) => f.tipo === aba)
  const grupos = useMemo(() => agrupar(visiveis), [visiveis])
  const nomesGrupos = useMemo(
    () => [...new Set(lista.map((f) => f.grupo.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lista]
  )

  // ---------- ações ----------
  const criar = async (tipo: FichaTipo, grupo = ''): Promise<void> => {
    const f = novaFicha(tipo, grupo)
    try {
      const { id: _id, ...dados } = f
      await folio.docs.put(dir, COLECAO_UNIVERSO, f.id, dados)
      setFichas((l) => [...(l ?? []), f])
      setBusca('')
      if (aba !== 'todos' && aba !== tipo) setAba(tipo)
      setRecemCriada(f.id)
      setAbertaId(f.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const excluir = async (f: Ficha): Promise<void> => {
    const t = timers.current.get(f.id)
    if (t) clearTimeout(t)
    timers.current.delete(f.id)
    fila.current.delete(f.id)
    await cadeias.current.get(f.id)
    await folio.docs.delete(dir, COLECAO_UNIVERSO, f.id)
    await folio.assets.delete(dir, ASSET_NAMES.retrato(f.id)).catch(() => undefined)
    const citantes = lista.filter((o) => o.id !== f.id && o.relacoes.some((r) => r.alvo === f.id))
    const limpas = citantes.map((o) => ({ ...o, relacoes: o.relacoes.filter((r) => r.alvo !== f.id) }))
    for (const o of limpas) {
      fila.current.set(o.id, o)
      await gravar(o.id)
    }
    await desligarDoEnredo(dir, f.id)
    setFichas((l) =>
      (l ?? []).filter((x) => x.id !== f.id).map((x) => limpas.find((o) => o.id === x.id) ?? x)
    )
    setPendentes((p) => {
      const n = new Set(p)
      n.delete(f.id)
      return n
    })
    setAbertaId(null)
    setStatus(`“${f.nome}” excluída.`)
  }

  const enviarRetrato = async (f: Ficha, file: File): Promise<void> => {
    if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem')
    const png = await imagemParaPng(await fileToDataUrl(file))
    const nome = ASSET_NAMES.retrato(f.id)
    await folio.assets.put(dir, nome, png)
    definirRetrato(dir, nome, png)
    atualizar({ ...f, retrato: nome })
  }

  const sair = async (fn: () => void): Promise<void> => {
    await salvarTudo()
    fn()
  }

  if (erro && !fichas) {
    return (
      <div className="screen">
        <div className="empty">
          <span className="disp">Universo</span>
          <p className="err">{erro}</p>
        </div>
      </div>
    )
  }

  const abas: Aba[] = ['todos', ...TIPOS]

  return (
    <div className="screen uv">
      <main className="uv-main" aria-busy={!fichas}>
        <div className="uv-head">
          <h1 className="disp uv-h1">Universo</h1>
          <div className="uv-tabs" role="tablist" aria-label="Tipos de ficha">
            {abas.map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={aba === a}
                className="uv-tab"
                onClick={() => setAba(a)}
              >
                {a === 'todos' ? 'Tudo' : TIPO_ROTULO[a].varios}
                <span className="uv-n">{contagem[a]}</span>
              </button>
            ))}
          </div>
          <label className="uv-search">
            <Mini name="busca" />
            <input
              type="search"
              aria-label="Buscar no universo"
              placeholder="Buscar por nome, apelido, traço…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <button type="button" className="btn" onClick={() => setPerfil(true)} title="Como a IA deve ler este livro">
            <Mini name="faisca" /> Perfil da obra
          </button>
          <button type="button" className="btn" onClick={() => setImportando(true)}>
            <Mini name="importar" /> Da série
          </button>
          <button type="button" className="btn pri" onClick={() => void criar(aba === 'todos' ? 'personagem' : aba)}>
            <Mini name="mais" /> Nova ficha
          </button>
        </div>

        {aviso && (
          <p className="uv-aviso" role="status">
            {aviso}
          </p>
        )}
        {erro && <p className="err">{erro}</p>}

        {!fichas && <p className="label">Carregando fichas…</p>}

        {fichas && lista.length === 0 && (
          <div className="empty uv-empty">
            <span className="disp">Nenhuma ficha ainda</span>
            Personagens, lugares, objetos, grupos e divindades do seu livro moram aqui.
            <div className="uv-row">
              <button type="button" className="btn pri" onClick={() => void criar('personagem')}>
                <Mini name="mais" /> Primeiro personagem
              </button>
              <button type="button" className="btn" onClick={() => setImportando(true)}>
                <Mini name="importar" /> Trazer da série
              </button>
            </div>
          </div>
        )}

        {fichas && lista.length > 0 && visiveis.length === 0 && (
          <div className="empty uv-empty">
            {busca ? `Nada encontrado para “${busca}”.` : `Nenhum(a) ${aba === 'todos' ? 'ficha' : TIPO_ROTULO[aba].um.toLowerCase()} ainda.`}
            {!busca && aba !== 'todos' && (
              <button type="button" className="btn pri" onClick={() => void criar(aba)}>
                <Mini name="mais" /> {TIPO_ROTULO[aba].novo}
              </button>
            )}
          </div>
        )}

        {grupos.map((g, gi) => (
          <section key={g.grupo || '__sem'} className="uv-group" aria-label={g.grupo || 'Sem grupo'}>
            <div className="uv-ghead">
              <h2 className="disp">{g.grupo || 'Sem grupo'}</h2>
              <span className="pill uv-gcount">{g.fichas.length}</span>
              <span className="uv-rule" aria-hidden="true" />
            </div>
            <div className="uv-cards">
              {g.fichas.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  className="uv-card"
                  aria-current={f.id === abertaId ? 'true' : undefined}
                  style={{ animationDelay: `${Math.min(gi * 3 + i, 12) * 0.04}s` }}
                  onClick={() => {
                    setRecemCriada(null)
                    setAbertaId(f.id)
                  }}
                >
                  <Retrato className="uv-card-img" ficha={f} url={retratos[f.id]} />
                  <span className="uv-card-txt">
                    <span className="disp uv-card-n">{f.nome || 'Sem nome'}</span>
                    <span className="uv-card-r">
                      {aba === 'todos' ? `${TIPO_ROTULO[f.tipo].um}${f.papel ? ` · ${f.papel}` : ''}` : f.papel || ' '}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="uv-add"
                onClick={() => void criar(aba === 'todos' ? 'personagem' : aba, g.grupo)}
                aria-label={`Nova ficha${g.grupo ? ` em ${g.grupo}` : ''}`}
              >
                <Mini name="mais" size={20} />
                {aba === 'todos' ? 'Ficha' : TIPO_ROTULO[aba].um}
              </button>
            </div>
          </section>
        ))}
      </main>

      {aberta && (
        <FichaPanel
          dir={dir}
          ficha={aberta}
          todas={lista}
          grupos={nomesGrupos}
          retratoUrl={retratos[aberta.id]}
          pendente={pendentes.has(aberta.id)}
          status={pendentes.has(aberta.id) ? 'Alterações pendentes…' : status}
          focarNome={recemCriada === aberta.id}
          onChange={atualizar}
          onEnviarRetrato={(file) => enviarRetrato(aberta, file)}
          onGerarRetrato={() => void sair(() => go('arte', { ficha: aberta.id }))}
          onExcluir={() => excluir(aberta)}
          onAbrirFicha={(id) => {
            setRecemCriada(null)
            setAbertaId(id)
          }}
          onAbrirCapitulo={(chapter) => void sair(() => go('manuscrito', { chapter }))}
          onFechar={() => setAbertaId(null)}
        />
      )}

      {perfil && <PerfilObra dir={dir} onFechar={() => setPerfil(false)} />}

      {importando && (
        <ImportarSerie
          dir={dir}
          existentes={new Set(lista.map((f) => f.id))}
          onFechar={() => setImportando(false)}
          onImportado={(msg) => {
            setImportando(false)
            setAviso(`Fichas da série: ${msg}`)
            esquecerRetratos(dir)
            salvarTudo()
              .then(() => folio.docs.list<Partial<Ficha>>(dir, COLECAO_UNIVERSO))
              .then((docs) => setFichas(docs.map(normalizarFicha)))
              .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
          }}
        />
      )}
    </div>
  )
}
