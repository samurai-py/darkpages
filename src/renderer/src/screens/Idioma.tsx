import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { call } from '../api'
import { useAutosave } from '../useAutosave'
import { Alfabeto } from '../features/idioma/Alfabeto'
import { Gramatica } from '../features/idioma/Gramatica'
import { Ico } from '../features/idioma/icones'
import { Lexico } from '../features/idioma/Lexico'
import { completar, linguaVazia, novoIdEntrada, type Lingua } from '../features/idioma/model'
import { Gerador, Sons } from '../features/idioma/Sons'
import { Tradutor, type NovaEntrada } from '../features/idioma/TradutorPainel'
import { normalizar, traduzir } from '../features/idioma/tradutor'
import { velhari } from '../features/idioma/velhari'
import './idioma.css'

type Aba = 'tradutor' | 'lexico' | 'alfabeto' | 'gramatica'

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'tradutor', rotulo: 'Tradutor' },
  { id: 'lexico', rotulo: 'Léxico' },
  { id: 'alfabeto', rotulo: 'Alfabeto' },
  { id: 'gramatica', rotulo: 'Gramática' }
]

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function Idioma({ project, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const [linguas, setLinguas] = useState<Lingua[] | null>(null)
  const [atualId, setAtualId] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('tradutor')
  const [texto, setTexto] = useState('O sino calou e a cidade esqueceu.')
  const [nomeNova, setNomeNova] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useCallback(async (l: Lingua): Promise<void> => {
    await call('idioma.salvar', dir, l)
  }, [dir])
  const { state, schedule, flush } = useAutosave<Lingua>(salvar, 800)

  useEffect(() => {
    let vivo = true
    call<Lingua[]>('idioma.listar', dir)
      .then((ls) => {
        if (!vivo) return
        const todas = ls.map(completar)
        setLinguas(todas)
        setAtualId(todas.find((x) => x.id === params.lingua)?.id ?? todas[0]?.id ?? null)
      })
      .catch((e: unknown) => vivo && setErro(msg(e)))
    return () => {
      vivo = false
    }
  }, [dir, params.lingua])

  const l = linguas?.find((x) => x.id === atualId) ?? null

  const mudar = useCallback(
    (fn: (l: Lingua) => Lingua): void => {
      setLinguas((ls) => {
        if (!ls) return ls
        return ls.map((x) => {
          if (x.id !== atualId) return x
          const novo = { ...fn(x), atualizadoEm: new Date().toISOString() }
          schedule(novo)
          return novo
        })
      })
    },
    [atualId, schedule]
  )

  const adicionar = useCallback(
    (novas: NovaEntrada[]): void =>
      mudar((x) => {
        const tem = new Set(x.lexico.map((e) => `${normalizar(e.pt)}|${normalizar(e.termo)}`))
        const add = novas
          .filter((n) => !tem.has(`${normalizar(n.pt)}|${normalizar(n.termo)}`))
          .map((n) => ({ id: novoIdEntrada(), pt: n.pt, termo: n.termo, classe: n.classe, nota: n.nota ?? '' }))
        return { ...x, lexico: [...add, ...x.lexico] }
      }),
    [mudar]
  )

  const criar = async (exemplo: boolean): Promise<void> => {
    setCriando(true)
    setErro(null)
    try {
      await flush()
      const dados = exemplo ? velhari() : linguaVazia(nomeNova.trim() || 'Nova língua')
      const nova = completar(await call<Lingua>('idioma.criar', dir, dados))
      setLinguas((ls) => [...(ls ?? []), nova])
      setAtualId(nova.id)
      setNomeNova('')
      setAba(exemplo ? 'tradutor' : 'gramatica')
    } catch (e) {
      setErro(msg(e))
    } finally {
      setCriando(false)
    }
  }

  const trocar = async (id: string): Promise<void> => {
    await flush()
    setAtualId(id)
  }

  const excluir = async (): Promise<void> => {
    if (!l) return
    if (!window.confirm(`Excluir ${l.nome}, com léxico, alfabeto e fonte gerada? Não dá para desfazer.`)) return
    try {
      await flush()
      await call('idioma.excluir', dir, l.id)
      const resto = (linguas ?? []).filter((x) => x.id !== l.id)
      setLinguas(resto)
      setAtualId(resto[0]?.id ?? null)
    } catch (e) {
      setErro(msg(e))
    }
  }

  const traducao = useMemo(() => (l ? traduzir(l, texto).texto : ''), [l, texto])

  if (!linguas) {
    return (
      <div className="screen">
        <div className="empty">{erro ? <p className="err">{erro}</p> : 'Carregando idiomas…'}</div>
      </div>
    )
  }

  const novaLingua = (
    <form
      className="idi-nova"
      onSubmit={(e) => {
        e.preventDefault()
        void criar(false)
      }}
    >
      <label className="field">
        Nome da língua
        <input className="input" value={nomeNova} maxLength={80} onChange={(e) => setNomeNova(e.target.value)} placeholder="ex.: Alto Brumário" />
      </label>
      <button type="submit" className="btn sm pri" disabled={criando || !nomeNova.trim()}>
        <Ico n="mais" />
        Criar
      </button>
    </form>
  )

  if (!l) {
    return (
      <div className="screen">
        <div className="empty idi-vazio">
          <span className="disp">Idioma do livro</span>
          <p>Invente os sons, as palavras e o alfabeto de uma língua do seu mundo. Um livro pode ter várias.</p>
          <div className="panel idi-form">
            {novaLingua}
            <div className="idi-linha">
              <span className="idi-dica">ou comece pelo exemplo, com 17 glifos e 27 palavras:</span>
              <button type="button" className="btn sm" disabled={criando} onClick={() => void criar(true)}>
                Usar o Velhári
              </button>
            </div>
          </div>
          {erro && <p className="err" role="alert">{erro}</p>}
        </div>
      </div>
    )
  }

  const nGlifos = Object.values(l.glifos).filter((g) => g.tracos.length).length
  const status =
    state.kind === 'saving' || state.kind === 'dirty'
      ? { cls: 'dot busy', txt: state.kind === 'saving' ? 'Salvando…' : 'Alterado' }
      : state.kind === 'error'
        ? { cls: 'dot bad', txt: `Erro ao salvar: ${state.message}` }
        : state.kind === 'saved'
          ? { cls: 'dot', txt: 'Salvo' }
          : { cls: 'dot', txt: 'Em dia' }

  return (
    <div className="screen idi">
      <aside className="idi-side" aria-label="Sons do idioma">
        <div className="idi-cab">
          <span className="idi-eb acc">Idioma do livro</span>
          {linguas.length > 1 ? (
            <select className="select idi-escolha disp" aria-label="Língua" value={l.id} onChange={(e) => void trocar(e.target.value)}>
              {linguas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="disp idi-nome">{l.nome}</span>
          )}
          <span className="idi-dica">
            {l.lexico.length} palavra{l.lexico.length === 1 ? '' : 's'} · {nGlifos} glifo{nGlifos === 1 ? '' : 's'}
          </span>
        </div>
        <Sons l={l} mudar={mudar} />
        <Gerador l={l} mudar={mudar} onAdicionar={(e) => adicionar([e])} />
        <details className="idi-bloco">
          <summary className="idi-eb">Outra língua</summary>
          {novaLingua}
        </details>
      </aside>

      <main className="idi-main">
        <div className="idi-topo">
          <div className="idi-abas" role="tablist" aria-label="Seções do idioma">
            {ABAS.map((a) => (
              <button
                key={a.id}
                id={`idi-aba-${a.id}`}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                aria-controls="idi-painel"
                tabIndex={aba === a.id ? 0 : -1}
                className="idi-aba"
                onClick={() => setAba(a.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                  const i = ABAS.findIndex((x) => x.id === aba)
                  const prox = ABAS[(i + (e.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length] as (typeof ABAS)[number]
                  setAba(prox.id)
                  document.getElementById(`idi-aba-${prox.id}`)?.focus()
                }}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <span className="idi-salvo" role="status">
            <span className={status.cls} aria-hidden="true" />
            {status.txt}
          </span>
        </div>
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}
        <div id="idi-painel" role="tabpanel" aria-labelledby={`idi-aba-${aba}`} className="idi-painel">
          {aba === 'tradutor' && <Tradutor l={l} dir={dir} texto={texto} setTexto={setTexto} onAdicionar={adicionar} salvar={flush} />}
          {aba === 'lexico' && <Lexico l={l} mudar={mudar} />}
          {aba === 'alfabeto' && <Alfabeto l={l} dir={dir} mudar={mudar} previaPadrao={traducao} salvar={flush} />}
          {aba === 'gramatica' && <Gramatica l={l} mudar={mudar} onExcluir={() => void excluir()} />}
        </div>
      </main>
    </div>
  )
}
