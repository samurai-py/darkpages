import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { resolveRotulo, type RotuloCfg } from '../../../shared/rotulo'
import { rotuloLongo } from '../features/manuscrito/ChapterList'
import type { ScreenProps } from '../screen'
import type { ChapterInfo } from '../../../shared/types'
import { folio } from '../api'
import type { BetaLeitura, DecisaoRevisao, RitmoComparado, Sugestao, SugestaoCategoria } from '../../../shared/models'
import { decisaoPara, filtrarSugestoes } from '../../../shared/decisoes'
import { ia, type StatusIa } from '../features/ia/api'
import { Ico } from '../features/ia/icones'
import { Ritmo } from '../features/ia/Ritmo'
import './revisor.css'

type Estado = 'pendente' | 'aplicando' | 'aceita' | 'ignorada'
type Filtro = 'todas' | SugestaoCategoria

const CATS: Array<{ id: SugestaoCategoria; nome: string }> = [
  { id: 'ortografia', nome: 'Ortografia' },
  { id: 'gramatica', nome: 'Gramática' },
  { id: 'estilo', nome: 'Estilo' },
  { id: 'repeticao', nome: 'Repetição' },
  { id: 'continuidade', nome: 'Continuidade' }
]
const NOME_CAT = Object.fromEntries(CATS.map((c) => [c.id, c.nome])) as Record<SugestaoCategoria, string>

const TIPO_DECISAO: Record<DecisaoRevisao['tipo'], string> = {
  'manter-palavra': 'Palavra',
  'manter-trecho': 'Trecho',
  'ignorar-regra': 'Regra',
  continuidade: 'Continuidade'
}

/** Trecho com as ocorrências marcadas (repetição local). */
function ComMarcas({ texto, marcas }: { texto: string; marcas: Array<[number, number]> }): ReactElement {
  const partes: ReactElement[] = []
  let i = 0
  marcas.forEach(([a, b], k) => {
    if (a > i) partes.push(<span key={`t${k}`}>{texto.slice(i, a)}</span>)
    partes.push(<mark key={`m${k}`}>{texto.slice(a, b)}</mark>)
    i = b
  })
  if (i < texto.length) partes.push(<span key="fim">{texto.slice(i)}</span>)
  return <>{partes}</>
}

const NOTAS: Array<{ k: keyof BetaLeitura['notas']; nome: string }> = [
  { k: 'ritmo', nome: 'Ritmo' },
  { k: 'tensao', nome: 'Tensão' },
  { k: 'clareza', nome: 'Clareza' },
  { k: 'voz', nome: 'Voz' },
  { k: 'personagens', nome: 'Personagens' }
]

function rotuloCapitulo(chapters: ChapterInfo[], file: string, title: string, cfg: RotuloCfg): string {
  const r = rotuloLongo(chapters, file, cfg)
  return r && r !== title ? `${r} · ${title}` : title
}

/** Erro com dica de configuração: oferece atalho para Ajustes. */
function Erro({ msg, onAjustes }: { msg: string; onAjustes: () => void }): ReactElement {
  const precisaAjustes = /Ajustes|ollama|chave|LanguageTool|desligad/i.test(msg)
  return (
    <div className="rv-erro" role="alert">
      <Ico n="alerta" size={18} />
      <div>
        <p className="err">{msg}</p>
        {precisaAjustes && (
          <button type="button" className="btn sm" onClick={onAjustes}>
            Abrir Ajustes
          </button>
        )}
      </div>
    </div>
  )
}

export function Revisor({ project, onProject, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const chapters = project.chapters
  const rotuloCfg = resolveRotulo(project.meta.layout)
  const [file, setFile] = useState<string>(() =>
    params.chapter && chapters.some((c) => c.file === params.chapter) ? params.chapter : (chapters[0]?.file ?? '')
  )
  const [status, setStatus] = useState<StatusIa | null>(null)
  const [statusErr, setStatusErr] = useState('')
  const [sugs, setSugs] = useState<Sugestao[] | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [estados, setEstados] = useState<Record<string, Estado>>({})
  const [falhas, setFalhas] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [revisando, setRevisando] = useState(false)
  const [erro, setErro] = useState('')
  const [beta, setBeta] = useState<BetaLeitura | null>(null)
  const [betaLoad, setBetaLoad] = useState(false)
  const [betaErr, setBetaErr] = useState('')
  const [anuncio, setAnuncio] = useState('')
  /** card com a escolha "Só agora" × "Sempre manter" aberta */
  const [escolha, setEscolha] = useState<string | null>(null)
  const [decisoes, setDecisoes] = useState<DecisaoRevisao[]>([])
  const [verDecisoes, setVerDecisoes] = useState(false)
  const [ritmo, setRitmo] = useState<RitmoComparado | null>(null)
  const atual = useRef(file)
  atual.current = file

  const ajustes = useCallback(() => go('ajustes'), [go])

  useEffect(() => {
    ia.status().then(setStatus, (e: Error) => setStatusErr(e.message))
  }, [])

  useEffect(() => {
    ia.decisoes(dir).then(setDecisoes, () => undefined)
  }, [dir])

  // ao trocar de capítulo: recupera a última revisão (se o texto não mudou) e a última leitura beta
  useEffect(() => {
    if (!file) return
    setSugs(null)
    setAvisos([])
    setEstados({})
    setFalhas({})
    setErro('')
    setBeta(null)
    setBetaErr('')
    setFiltro('todas')
    setEscolha(null)
    setRitmo(null)
    ia.ritmo(dir, file).then(
      (r) => {
        if (atual.current === file) setRitmo(r)
      },
      () => undefined
    )
    ia.revisaoGet(dir, file).then(
      (r) => {
        if (atual.current !== file || !r) return
        setSugs(r.sugestoes)
        setAvisos(r.avisos)
      },
      () => undefined
    )
    ia.betaGet(dir, file).then(
      (b) => {
        if (atual.current === file) setBeta(b)
      },
      () => undefined
    )
  }, [dir, file])

  const revisar = async (): Promise<void> => {
    if (!file) return
    setRevisando(true)
    setErro('')
    setAnuncio('Revisando o capítulo…')
    try {
      const r = await ia.revisarDetalhado(dir, file)
      if (atual.current !== file) return
      setSugs(r.sugestoes)
      setAvisos(r.avisos)
      setEstados({})
      setFalhas({})
      setAnuncio(`${r.sugestoes.length} sugestões encontradas.`)
    } catch (e) {
      setErro((e as Error).message)
      setAnuncio('A revisão falhou.')
    } finally {
      setRevisando(false)
    }
  }

  const atualizarProjeto = async (): Promise<void> => {
    try {
      onProject(await folio.open(dir))
    } catch {
      /* contagem de palavras atualiza na próxima abertura */
    }
  }

  /** `alternativa`: troca escolhida entre as que o LanguageTool ofereceu (uma sugestão por vez) */
  const aceitar = async (lista: Sugestao[], alternativa?: string): Promise<void> => {
    lista = lista.filter((x) => !x.soAviso)
    if (!lista.length) return
    setEstados((s) => ({ ...s, ...Object.fromEntries(lista.map((x) => [x.id, 'aplicando' as Estado])) }))
    try {
      const alvo = lista.map((x) => (alternativa !== undefined && lista.length === 1 ? { id: x.id, substituto: alternativa } : x.id))
      const r = await ia.aplicar(dir, file, alvo)
      const falhou = new Map(r.falhas.map((f) => [f.original, f.motivo]))
      const novos: Record<string, Estado> = {}
      const novasFalhas: Record<string, string> = {}
      for (const s of lista) {
        const m = falhou.get(s.original)
        if (m) {
          novos[s.id] = 'pendente'
          novasFalhas[s.id] = m
          falhou.delete(s.original)
        } else novos[s.id] = 'aceita'
      }
      setEstados((s) => ({ ...s, ...novos }))
      setFalhas((f) => {
        const out = { ...f, ...novasFalhas }
        for (const s of lista) if (novos[s.id] === 'aceita') delete out[s.id]
        return out
      })
      setAnuncio(`${r.aplicadas} ${r.aplicadas === 1 ? 'sugestão aplicada' : 'sugestões aplicadas'} no texto.`)
      if (r.aplicadas) void atualizarProjeto()
    } catch (e) {
      const msg = (e as Error).message
      setEstados((s) => ({ ...s, ...Object.fromEntries(lista.map((x) => [x.id, 'pendente' as Estado])) }))
      setFalhas((f) => ({ ...f, ...Object.fromEntries(lista.map((x) => [x.id, msg])) }))
    }
  }

  /** "Só agora": esconde nesta tela; volta na próxima revisão. */
  const ignorar = (s: Sugestao): void => {
    setEscolha(null)
    setEstados((e) => ({ ...e, [s.id]: e[s.id] === 'ignorada' ? 'pendente' : 'ignorada' }))
  }

  /** "Sempre manter": grava a decisão do livro; some daqui e das próximas revisões (e dos insights). */
  const manterSempre = async (s: Sugestao): Promise<void> => {
    setEscolha(null)
    const d = decisaoPara(s)
    try {
      const nova = await ia.decidir(dir, {
        tipo: d.tipo,
        valor: d.valor,
        rotulo: d.rotulo,
        ...(d.soCapitulo && cap?.id ? { capitulo: cap.id } : {})
      })
      setDecisoes(nova)
      setEstados((e) => ({ ...e, [s.id]: 'ignorada' }))
      setAnuncio('Decisão guardada: não volta nas próximas revisões.')
    } catch (e) {
      setFalhas((f) => ({ ...f, [s.id]: (e as Error).message }))
    }
  }

  const esquecer = async (d: DecisaoRevisao): Promise<void> => {
    try {
      setDecisoes(await ia.esquecerDecisao(dir, d.id))
      setAnuncio('Decisão removida. Vale a partir da próxima revisão.')
    } catch (e) {
      setAnuncio((e as Error).message)
    }
  }

  const pedirBeta = async (): Promise<void> => {
    setBetaLoad(true)
    setBetaErr('')
    setAnuncio('Pedindo leitura ao beta-reader…')
    try {
      const b = await ia.beta(dir, file)
      if (atual.current === file) setBeta(b)
      setAnuncio('Leitura pronta.')
    } catch (e) {
      setBetaErr((e as Error).message)
    } finally {
      setBetaLoad(false)
    }
  }

  // decisões novas valem na hora (sem revisar de novo)
  const lista = useMemo(() => filtrarSugestoes(sugs ?? [], decisoes, undefined, chapters.find((c) => c.file === file)?.id), [sugs, decisoes, chapters, file])
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: sugs?.length ?? 0 }
    for (const s of lista) c[s.categoria] = (c[s.categoria] ?? 0) + 1
    c.todas = lista.length
    return c
  }, [sugs, lista])
  const resolvidas = lista.filter((s) => estados[s.id] === 'aceita' || estados[s.id] === 'ignorada').length
  const visiveis = filtro === 'todas' ? lista : lista.filter((s) => s.categoria === filtro)
  // ortografia e gramática (LanguageTool): aceitar em lote, com versão guardada antes (ia.aplicar)
  const ltPendentes = lista.filter((s) => (s.categoria === 'ortografia' || s.categoria === 'gramatica') && !s.soAviso && (estados[s.id] ?? 'pendente') === 'pendente')
  const idx = chapters.findIndex((c) => c.file === file)
  const cap = chapters[idx]

  if (!chapters.length) {
    return (
      <div className="screen">
        <div className="empty">
          <span className="disp">Revisor</span>
          Este livro ainda não tem capítulos.
        </div>
      </div>
    )
  }

  return (
    <div className="screen rv">
      <p className="rv-sr" aria-live="polite">
        {anuncio}
      </p>

      <aside className="rv-cats" aria-label="Capítulo e categorias">
        <label className="field">
          Capítulo
          <select className="select" value={file} onChange={(e) => setFile(e.target.value)}>
            {chapters.map((c) => (
              <option key={c.file} value={c.file}>
                {rotuloCapitulo(chapters, c.file, c.title, rotuloCfg)}
              </option>
            ))}
          </select>
        </label>

        <span className="rv-eb">{sugs ? `${lista.length} ${lista.length === 1 ? 'sugestão' : 'sugestões'}` : 'Ainda não revisado'}</span>
        <div className="rv-catlist" role="group" aria-label="Filtrar por categoria">
          {(['todas', ...CATS.map((c) => c.id)] as Filtro[]).map((id) => (
            <button
              key={id}
              type="button"
              className="rv-cat"
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
              disabled={id !== 'todas' && !contagem[id]}
            >
              <span className={`rv-dot c-${id}`} aria-hidden="true" />
              <span className="rv-catn">{id === 'todas' ? 'Todas' : NOME_CAT[id]}</span>
              <span className="rv-num">{contagem[id] ?? 0}</span>
            </button>
          ))}
        </div>

        {ritmo && <Ritmo r={ritmo} />}

        <div className="rv-decs">
          <button type="button" className="rv-cat" aria-expanded={verDecisoes} onClick={() => setVerDecisoes((v) => !v)}>
            <Ico n="manter" size={15} />
            <span className="rv-catn">Sempre manter</span>
            <span className="rv-num">{decisoes.length}</span>
          </button>
          {verDecisoes && (
            <div className="rv-declist">
              {decisoes.length === 0 && <p className="rv-decvazio">Nada ainda. Em “Ignorar › Sempre manter”, a escolha fica guardada para o livro todo.</p>}
              <ul>
                {decisoes.map((d) => {
                  const capD = d.capitulo ? chapters.find((c) => c.id === d.capitulo) : undefined
                  return (
                    <li key={d.id}>
                      <span className="rv-dect">{TIPO_DECISAO[d.tipo]}</span>
                      <span className="rv-decv" title={d.valor}>
                        {d.tipo === 'continuidade' ? (d.rotulo ?? d.valor).replace(/^continuidade: /, '') : d.tipo === 'ignorar-regra' ? (d.rotulo ?? d.valor).replace(/^regra: /, '') : d.valor}
                        {capD && <em> · {capD.title}</em>}
                      </span>
                      <button type="button" className="rv-decx" aria-label={`Esquecer: ${d.valor}`} onClick={() => void esquecer(d)}>
                        <Ico n="x" size={13} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="panel rv-motor">
          <span className="rv-eb">Motor</span>
          {statusErr && <span className="err">{statusErr}</span>}
          {status && (
            <>
              <span className="rv-mline">
                <i className={`rv-led ${status.lt.modo === 'off' ? 'off' : ''}`} aria-hidden="true" />
                {status.lt.modo === 'off'
                  ? 'LanguageTool desligado'
                  : `LanguageTool · ${status.lt.modo === 'publico' ? 'servidor público' : 'servidor próprio'}`}
              </span>
              <span className="rv-mline">
                <i className={`rv-led ${status.provedor === 'off' ? 'off' : ''}`} aria-hidden="true" />
                {status.provedor === 'off' ? 'IA desligada' : `${status.nomeProvedor} · ${status.modelo}`}
              </span>
              <span className={`rv-priv ${status.externo || status.lt.externo ? 'fora' : ''}`}>
                <Ico n={status.externo || status.lt.externo ? 'nuvem' : 'local'} size={15} />
                {status.externo || status.lt.externo
                  ? `O texto sai da máquina: ${[status.lt.externo ? 'languagetool.org' : '', status.externo ? status.nomeProvedor : ''].filter(Boolean).join(' e ')}.`
                  : 'O texto não sai da sua máquina (ou da sua rede).'}
              </span>
              <button type="button" className="btn sm" onClick={ajustes}>
                Configurar
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="rv-main">
        <div className="rv-head">
          <h1 className="disp">Revisor</h1>
          {sugs && (
            <span className="pill">
              <b>{resolvidas}</b> de {lista.length} resolvidas
            </span>
          )}
          <span className="rv-acts">
            <button
              type="button"
              className="btn"
              disabled={!ltPendentes.length || revisando}
              title="Aplica de uma vez as sugestões pendentes de ortografia e gramática. Antes, uma versão do capítulo fica guardada em Versões."
              onClick={() => void aceitar(ltPendentes)}
            >
              <Ico n="check" /> Aceitar ortografia e gramática{ltPendentes.length ? ` (${ltPendentes.length})` : ''}
            </button>
            <button type="button" className="btn pri" disabled={revisando} onClick={() => void revisar()}>
              <Ico n="refazer" /> {revisando ? 'Revisando…' : sugs ? 'Revisar de novo' : 'Revisar capítulo'}
            </button>
          </span>
        </div>

        {erro && <Erro msg={erro} onAjustes={ajustes} />}
        {avisos.length > 0 && (
          <ul className="rv-avisos">
            {avisos.map((a) => (
              <li key={a}>
                <Ico n="alerta" size={14} /> <span>{a}</span>
              </li>
            ))}
          </ul>
        )}

        {revisando && (
          <div className="rv-loading" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rv-skel" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}

        {!revisando && !sugs && !erro && (
          <div className="empty rv-vazio">
            <span className="disp">{cap ? cap.title : 'Revisor'}</span>
            Revise o capítulo para ver ortografia, gramática, estilo, repetições e continuidade. Nada muda no texto sem você aceitar.
          </div>
        )}

        {!revisando && sugs && !lista.length && (
          <div className="empty rv-vazio">
            <span className="disp">Nada a corrigir</span>
            Nenhuma sugestão para este capítulo.
          </div>
        )}

        {!revisando &&
          visiveis.map((s, i) => {
            const st = estados[s.id] ?? 'pendente'
            return (
              <article key={s.id} className={`rv-card st-${st}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                <div className="rv-cardh">
                  <span className={`rv-tag c-${s.categoria}`}>{NOME_CAT[s.categoria]}</span>
                  <span className="rv-why">{s.motivo}</span>
                </div>
                {s.soAviso ? (
                  <p className="rv-diff">
                    {s.antes && <span className="rv-ctx">{s.antes}</span>}
                    <span className="rv-marcas">
                      <ComMarcas texto={s.original} marcas={s.marcas ?? []} />
                    </span>
                    {s.depois && <span className="rv-ctx">{s.depois}</span>}
                  </p>
                ) : (
                  <p className="rv-diff">
                    {s.antes && <span className="rv-ctx">{s.antes}</span>}
                    <del>
                      <span className="rv-sr">trecho original: </span>
                      {s.original}
                    </del>
                    <ins>
                      <span className="rv-sr">sugestão: </span>
                      {s.substituto || <em>(remover)</em>}
                    </ins>
                    {s.depois && <span className="rv-ctx">{s.depois}</span>}
                  </p>
                )}
                {!s.soAviso && (s.alternativas?.length ?? 0) > 0 && st !== 'aceita' && (
                  <div className="rv-alts" role="group" aria-label="Outras trocas possíveis">
                    <span className="rv-altsl">ou</span>
                    {s.alternativas?.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        className="rv-alt"
                        disabled={st === 'aplicando'}
                        onClick={() => void aceitar([s], alt)}
                        aria-label={`Aceitar com outra troca: "${alt}"`}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
                {falhas[s.id] && <p className="err rv-falha">{falhas[s.id]}</p>}
                <div className="rv-cardb">
                  {!s.soAviso && (
                    <button
                      type="button"
                      className={`btn sm rv-ok ${st === 'aceita' ? 'feito' : ''}`}
                      disabled={st === 'aceita' || st === 'aplicando'}
                      onClick={() => void aceitar([s])}
                      aria-label={`Aceitar: trocar "${s.original}" por "${s.substituto || 'nada'}"`}
                    >
                      <Ico n="check" /> {st === 'aceita' ? 'Aceita' : st === 'aplicando' ? 'Aplicando…' : 'Aceitar'}
                    </button>
                  )}
                  {st === 'ignorada' ? (
                    <button type="button" className="btn sm" aria-pressed="true" onClick={() => ignorar(s)}>
                      <Ico n="x" /> Ignorada
                    </button>
                  ) : escolha === s.id ? (
                    <span className="rv-escolha" role="group" aria-label="Ignorar">
                      <button type="button" className="btn sm" autoFocus onClick={() => ignorar(s)}>
                        Só agora
                      </button>
                      <button type="button" className="btn sm rv-manter" onClick={() => void manterSempre(s)} title="Guarda a decisão no livro: não volta nas próximas revisões nem nos insights.">
                        <Ico n="manter" /> Sempre manter · {decisaoPara(s).acao}
                      </button>
                      <button type="button" className="rv-decx" aria-label="Cancelar" onClick={() => setEscolha(null)}>
                        <Ico n="x" size={13} />
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn sm" disabled={st === 'aceita' || st === 'aplicando'} onClick={() => setEscolha(s.id)}>
                      <Ico n="x" /> Ignorar
                    </button>
                  )}
                </div>
              </article>
            )
          })}
      </main>

      <aside className="rv-beta" aria-label="Beta-reader" aria-busy={betaLoad}>
        <div className="rv-betah">
          <span className="rv-eb acc">
            <Ico n="brilho" size={14} /> Beta-reader
          </span>
          <span className="disp rv-betat">{cap ? `Leitura · ${String(idx + 1).padStart(2, '0')}` : 'Leitura'}</span>
          {beta && (
            <span className="label">
              {new Date(beta.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {betaErr && <Erro msg={betaErr} onAjustes={ajustes} />}

        {betaLoad && (
          <div className="rv-loading" aria-hidden="true">
            {NOTAS.map((n, i) => (
              <div key={n.k} className="rv-skel fino" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}

        {!betaLoad && beta && (
          <>
            <dl className="rv-notas" key={beta.geradoEm}>
              {NOTAS.map((n, i) => (
                <div key={n.k} className="rv-nota">
                  <dt>{n.nome}</dt>
                  <dd>
                    <b>{beta.notas[n.k]}</b>
                    <span
                      className="rv-bar"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={beta.notas[n.k]}
                      aria-label={`${n.nome}: ${beta.notas[n.k]} de 100`}
                    >
                      <span style={{ width: `${beta.notas[n.k]}%`, animationDelay: `${0.15 + i * 0.1}s` }} />
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {beta.funciona && (
              <section className="rv-bloco">
                <h2 className="rv-eb">O que funciona</h2>
                <p>{beta.funciona}</p>
              </section>
            )}
            {beta.melhorar && (
              <section className="rv-bloco">
                <h2 className="rv-eb">Pode melhorar</h2>
                <p>{beta.melhorar}</p>
              </section>
            )}
            {beta.citacao && <blockquote className="rv-cit">“{beta.citacao}”</blockquote>}
            {(beta.avisos?.length ?? 0) > 0 && (
              <ul className="rv-avisos">
                {beta.avisos?.map((a) => (
                  <li key={a}>
                    <Ico n="alerta" size={14} /> <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!betaLoad && !beta && !betaErr && (
          <p className="rv-betavazio">Um leitor crítico lê o capítulo e dá notas de ritmo, tensão, clareza, voz e personagens.</p>
        )}

        <button type="button" className="btn" disabled={betaLoad || !file} onClick={() => void pedirBeta()}>
          <Ico n="brilho" /> {betaLoad ? 'Lendo…' : beta ? 'Pedir outra leitura' : 'Pedir leitura'}
        </button>
      </aside>
    </div>
  )
}
