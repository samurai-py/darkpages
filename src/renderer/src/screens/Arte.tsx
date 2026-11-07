import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { resolveRotulo } from '../../../shared/rotulo'
import { rotuloLongo } from '../features/manuscrito/ChapterList'
import type { ScreenProps } from '../screen'
import { folio } from '../api'
import type { ArteConfig, Ficha } from '../../../shared/models'
import { arte, chaveDe, duracao, NOME_PROVEDOR, type Alvo, type EstadoFila, type EstiloArte, type ItemFila, type PromptMontado } from '../features/arte/api'
import { Ic, PreviaEstilo } from '../features/arte/Previas'
import { Miniatura } from '../features/arte/Miniatura'
import { Visualizador } from '../features/arte/Visualizador'
import { EstiloEditor } from '../features/arte/EstiloEditor'
import './arte.css'

type Aba = 'aberturas' | 'retratos' | 'capa'

const ABAS: Array<[Aba, string]> = [
  ['aberturas', 'Aberturas'],
  ['retratos', 'Retratos'],
  ['capa', 'Capa']
]

const ORDEM_TIPO: Record<Ficha['tipo'], number> = { personagem: 0, divindade: 1, lugar: 2, objeto: 3, grupo: 4 }

function propNum(p: [number, number] | 'livro', livro: number): number {
  return p === 'livro' ? livro : p[0] / p[1]
}

export function Arte({ project, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const livroProp = project.meta.layout.trim.widthMm / project.meta.layout.trim.heightMm
  const [aba, setAba] = useState<Aba>(params.ficha ? 'retratos' : 'aberturas')
  const [estilos, setEstilos] = useState<EstiloArte[]>([])
  const [config, setConfig] = useState<ArteConfig | null>(null)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [fila, setFila] = useState<EstadoFila | null>(null)
  const [alvo, setAlvo] = useState<Alvo | null>(() =>
    params.ficha
      ? { tipo: 'retrato', fichaId: params.ficha }
      : params.chapter
        ? { tipo: 'abertura', chapterFile: params.chapter }
        : project.chapters[0]
          ? { tipo: 'abertura', chapterFile: project.chapters[0].file }
          : null
  )
  const [pm, setPm] = useState<PromptMontado | null>(null)
  const [texto, setTexto] = useState('')
  const [montando, setMontando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [extra, setExtra] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ estilo?: EstiloArte; partida: EstiloArte } | null>(null)
  const pedidoPrompt = useRef(0)

  // ---------- carga ----------
  const recarregarEstilos = useCallback(async () => {
    const [e, c] = await Promise.all([arte.estilos(dir), arte.config(dir)])
    setEstilos(e)
    setConfig(c)
    setExtra(c.promptExtra)
  }, [dir])

  useEffect(() => {
    setErro('')
    void recarregarEstilos().catch((e: Error) => setErro(e.message))
    void folio.docs
      .list<Ficha>(dir, 'universo')
      .then((l) => setFichas(l.filter((f) => typeof f.nome === 'string').sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.nome.localeCompare(b.nome, 'pt-BR'))))
      .catch(() => setFichas([]))
  }, [dir, recarregarEstilos])

  // navegação vinda de outra tela (Universo → retrato, Diagramação → abertura)
  useEffect(() => {
    if (params.ficha) {
      setAba('retratos')
      setAlvo({ tipo: 'retrato', fichaId: params.ficha })
    } else if (params.chapter) {
      setAba('aberturas')
      setAlvo({ tipo: 'abertura', chapterFile: params.chapter })
    }
  }, [params.ficha, params.chapter])

  // ---------- fila: consulta periódica (mais rápida enquanto há trabalho) ----------
  const ativo = !!fila?.itens.some((i) => i.status === 'fila' || i.status === 'gerando')
  const atualizarFila = useCallback(async () => {
    try {
      setFila(await arte.fila(dir))
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [dir])
  useEffect(() => {
    void atualizarFila()
    const t = setInterval(() => void atualizarFila(), ativo ? 1500 : 8000)
    return () => clearInterval(t)
  }, [atualizarFila, ativo])

  const itemPorChave = useMemo(() => {
    const m = new Map<string, ItemFila>()
    for (const i of fila?.itens ?? []) m.set(i.chave, i)
    return m
  }, [fila])

  // ---------- prompt do alvo ----------
  const montar = useCallback(
    async (a: Alvo) => {
      const n = ++pedidoPrompt.current
      setMontando(true)
      setAviso('')
      try {
        const r = await arte.prompt(dir, a)
        if (n !== pedidoPrompt.current) return
        setPm(r)
        setTexto(r.prompt)
        setAviso(r.aviso ?? '')
      } catch (e) {
        if (n === pedidoPrompt.current) {
          setPm(null)
          setTexto('')
          setAviso((e as Error).message)
        }
      } finally {
        if (n === pedidoPrompt.current) setMontando(false)
      }
    },
    [dir]
  )

  const alvoChave = alvo ? chaveDe(alvo) : ''
  useEffect(() => {
    if (alvo && config) void montar(alvo)
    // remonta quando muda o alvo, o estilo, a semente ou o toque extra do livro (alvo entra pela chave)
  }, [alvoChave, config?.estilo, config?.promptExtra, config?.semente, montar])

  // alvo coerente com a aba
  const trocarAba = (a: Aba): void => {
    setAba(a)
    if (a === 'capa') setAlvo({ tipo: 'capa' })
    else if (a === 'retratos' && alvo?.tipo !== 'retrato') setAlvo(fichas[0] ? { tipo: 'retrato', fichaId: fichas[0].id } : null)
    else if (a === 'aberturas' && alvo?.tipo !== 'abertura') setAlvo(project.chapters[0] ? { tipo: 'abertura', chapterFile: project.chapters[0].file } : null)
  }
  useEffect(() => {
    if (aba === 'retratos' && !alvo && fichas[0]) setAlvo({ tipo: 'retrato', fichaId: fichas[0].id })
  }, [aba, alvo, fichas])

  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const prox = ABAS[(i + (e.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length]![0]
    trocarAba(prox)
    document.getElementById(`arte-aba-${prox}`)?.focus()
  }

  // ---------- ações ----------
  const provedor = fila?.provedor ?? 'off'
  const podeGerar = provedor !== 'off'

  const agir = async (f: () => Promise<unknown>): Promise<void> => {
    setErro('')
    try {
      await f()
    } catch (e) {
      setErro((e as Error).message)
    }
    await atualizarFila()
  }

  const gerar = (a: Alvo, opcoes: { variar?: boolean; prompt?: string } = {}): Promise<void> =>
    agir(() => arte.gerar(dir, a, opcoes.prompt, { variar: opcoes.variar }))

  const escolherEstilo = (id: string): void => {
    if (!config || id === config.estilo) return
    setConfig({ ...config, estilo: id })
    void agir(async () => setConfig(await arte.salvarConfig(dir, { estilo: id })))
  }

  const novaSemente = (): void => {
    if (!config) return
    if (!window.confirm('Sortear outra semente para o livro? As próximas artes deixam de combinar com as já geradas.')) return
    const semente = Math.floor(Math.random() * 2 ** 31)
    void agir(async () => setConfig(await arte.salvarConfig(dir, { semente })))
  }

  const salvarExtra = (): void => {
    if (!config || extra === config.promptExtra) return
    void agir(async () => setConfig(await arte.salvarConfig(dir, { promptExtra: extra })))
  }

  const salvarEstilo = async (e: Omit<EstiloArte, 'preset'>): Promise<void> => {
    await arte.salvarEstilo(dir, e)
    await arte.salvarConfig(dir, { estilo: e.id })
    await recarregarEstilos()
  }

  const excluirEstilo = (e: EstiloArte): void => {
    if (!window.confirm(`Excluir o estilo "${e.nome}"? As artes já geradas continuam no livro.`)) return
    void agir(async () => {
      await arte.excluirEstilo(dir, e.id)
      await recarregarEstilos()
    })
  }

  // ---------- dados derivados ----------
  const estiloAtual = estilos.find((e) => e.id === config?.estilo)
  const geradas = fila?.geradas ?? {}
  const itemAlvo = alvo ? itemPorChave.get(chaveDe(alvo)) : undefined
  const alvoOcupado = itemAlvo?.status === 'fila' || itemAlvo?.status === 'gerando'
  const metaAlvo = alvo ? geradas[chaveDe(alvo)] : undefined
  const editado = !!pm && texto.trim() !== pm.prompt.trim()
  const versaoAlvo = metaAlvo?.criadoEm
  const editadoRef = useRef(editado)
  editadoRef.current = editado
  const versaoVista = useRef<{ chave: string; versao?: string }>({ chave: '' })
  useEffect(() => {
    // só quando chega uma geração nova do MESMO alvo (trocar de alvo já remonta acima)
    const antes = versaoVista.current
    versaoVista.current = { chave: alvoChave, versao: versaoAlvo }
    if (antes.chave === alvoChave && antes.versao !== undefined && antes.versao !== versaoAlvo && versaoAlvo && alvo && !editadoRef.current) void montar(alvo)
  }, [alvoChave, versaoAlvo, alvo, montar])

  const caps = project.chapters
  const rotuloCfg = resolveRotulo(project.meta.layout)
  const rotuloCap = (file: string): string => rotuloLongo(caps, file, rotuloCfg)
  const capsProntos = caps.filter((c) => geradas[`abertura:${c.file}`]).length
  const capsPendentes = caps.filter((c) => {
    const s = itemPorChave.get(`abertura:${c.file}`)?.status
    return s === 'fila' || s === 'gerando'
  }).length
  const loteAtivo = capsPendentes > 0

  const propAbertura = estiloAtual ? propNum(estiloAtual.proporcoes.abertura, livroProp) : 1.6
  const propRetrato = estiloAtual ? propNum(estiloAtual.proporcoes.retrato, livroProp) : 0.75

  const abrirMeta = aberta ? geradas[aberta] : undefined
  const abrirItem = aberta ? itemPorChave.get(aberta) : undefined

  const destinoDe = (chave: string): { rotulo: string; ir(): void } | undefined => {
    if (chave.startsWith('abertura:')) return { rotulo: 'Ver na Diagramação', ir: () => go('diagramar', { chapter: chave.slice(9) }) }
    if (chave.startsWith('retrato:')) return { rotulo: 'Abrir ficha no Universo', ir: () => go('universo', { ficha: chave.slice(8) }) }
    return { rotulo: 'Ver na Diagramação', ir: () => go('diagramar') }
  }

  const rotuloDe = (chave: string): string => {
    if (chave === 'capa') return 'Capa'
    if (chave.startsWith('retrato:')) return fichas.find((f) => f.id === chave.slice(8))?.nome ?? 'Retrato'
    const c = caps.find((x) => `abertura:${x.file}` === chave)
    return c ? `${rotuloCap(c.file)} · ${c.title}` : chave
  }

  // ---------- render ----------
  return (
    <div className="screen">
      <div className="arte">
        <header className="arte-head">
          <h1 className="disp">Arte</h1>
          <span className="pill">
            <i className={`dot${podeGerar ? '' : ' bad'}`} aria-hidden="true" />
            {NOME_PROVEDOR[provedor]}
          </span>
          {!podeGerar && (
            <button type="button" className="btn sm" onClick={() => go('ajustes')}>
              Configurar gerador
            </button>
          )}
          <span className="arte-head-nota">Estilo e semente fixos por livro, para todas as artes combinarem.</span>
        </header>

        <div className="arte-abas" role="tablist" aria-label="Tipo de arte">
          {ABAS.map(([id, rot], i) => (
            <button
              key={id}
              id={`arte-aba-${id}`}
              type="button"
              role="tab"
              aria-selected={aba === id}
              aria-controls="arte-painel"
              tabIndex={aba === id ? 0 : -1}
              className="arte-aba"
              onClick={() => trocarAba(id)}
              onKeyDown={(e) => tabKey(e, i)}
            >
              {rot}
            </button>
          ))}
        </div>

        <div id="arte-painel" role="tabpanel" aria-labelledby={`arte-aba-${aba}`} className="arte-painel">
          {/* ---------- estilos ---------- */}
          <section aria-labelledby="arte-estilos-t" className="arte-sec">
            <div className="arte-sec-head">
              <h2 id="arte-estilos-t" className="arte-eb">
                Estilo do livro
              </h2>
              {config && (
                <span className="arte-semente">
                  <span className="pill">
                    <Ic nome="cadeado" tam={14} /> Semente <b>{config.semente}</b> · travada
                  </span>
                  <button type="button" className="btn sm" onClick={novaSemente}>
                    <Ic nome="dado" tam={14} /> Sortear outra
                  </button>
                </span>
              )}
            </div>
            <div className="arte-estilos" role="radiogroup" aria-label="Estilos de arte">
              {estilos.map((e) => (
                <div key={e.id} className="arte-estilo-wrap">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={config?.estilo === e.id}
                    className="arte-estilo"
                    onClick={() => escolherEstilo(e.id)}
                    title={e.descricao}
                  >
                    <PreviaEstilo estilo={e} />
                    <span className="arte-estilo-nome">{e.nome}</span>
                    <span className="arte-estilo-pal">{e.paleta === 'mono' ? 'preto e branco' : e.paleta === 'sepia' ? 'sépia' : 'cor'}</span>
                  </button>
                  <span className="arte-estilo-acoes">
                    {e.preset ? (
                      <button type="button" className="arte-ib" onClick={() => setEditor({ partida: e })} aria-label={`Criar estilo a partir de ${e.nome}`} title="Criar variação deste estilo">
                        <Ic nome="mais" tam={14} />
                      </button>
                    ) : (
                      <>
                        <button type="button" className="arte-ib" onClick={() => setEditor({ estilo: e, partida: e })} aria-label={`Editar estilo ${e.nome}`} title="Editar">
                          <Ic nome="lapis" tam={14} />
                        </button>
                        <button type="button" className="arte-ib" onClick={() => excluirEstilo(e)} aria-label={`Excluir estilo ${e.nome}`} title="Excluir">
                          <Ic nome="lixo" tam={14} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
              <button
                type="button"
                className="arte-estilo arte-estilo-novo"
                onClick={() => estiloAtual && setEditor({ partida: estiloAtual })}
                disabled={!estiloAtual}
              >
                <span className="arte-estilo-mais" aria-hidden="true">
                  <Ic nome="mais" tam={28} />
                </span>
                <span className="arte-estilo-nome">Novo estilo</span>
                <span className="arte-estilo-pal">a partir do atual</span>
              </button>
            </div>
            <label className="field arte-extra">
              Toque do livro (entra em todo prompt; ex.: “névoa, tons frios”)
              <input
                className="input"
                value={extra}
                maxLength={1000}
                onChange={(e) => setExtra(e.target.value)}
                onBlur={salvarExtra}
                onKeyDown={(e) => e.key === 'Enter' && salvarExtra()}
              />
            </label>
          </section>

          {erro && (
            <p className="err" role="alert">
              {erro}
            </p>
          )}

          {/* ---------- contexto + lote ---------- */}
          <div className="arte-linha">
            <section className="panel arte-ctx" aria-labelledby="arte-ctx-t" aria-busy={montando}>
              <div className="arte-sec-head">
                <h2 id="arte-ctx-t" className="arte-eb">
                  Contexto que vai para o gerador{pm ? ` · ${pm.rotulo}` : ''}
                </h2>
                {aba === 'aberturas' && (
                  <select
                    className="select arte-alvo-sel"
                    aria-label="Capítulo"
                    value={alvo?.tipo === 'abertura' ? alvo.chapterFile : ''}
                    onChange={(e) => setAlvo({ tipo: 'abertura', chapterFile: e.target.value })}
                  >
                    {caps.map((c) => (
                      <option key={c.file} value={c.file}>
                        {rotuloCap(c.file)} · {c.title}
                      </option>
                    ))}
                  </select>
                )}
                {aba === 'retratos' && fichas.length > 0 && (
                  <select
                    className="select arte-alvo-sel"
                    aria-label="Ficha"
                    value={alvo?.tipo === 'retrato' ? alvo.fichaId : ''}
                    onChange={(e) => setAlvo({ tipo: 'retrato', fichaId: e.target.value })}
                  >
                    {fichas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} ({f.tipo})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!alvo ? (
                <p className="muted arte-nada">
                  {aba === 'retratos' ? 'Nenhuma ficha no Universo ainda. Crie personagens e lugares para gerar retratos.' : 'Nenhum capítulo no livro.'}
                </p>
              ) : (
                <>
                  <div className="arte-chips" aria-live="polite">
                    {montando && <span className="pill">Lendo o livro…</span>}
                    {!montando && pm?.chips.map((c, i) => (
                      <span key={`${c.rotulo}-${i}`} className="pill">
                        <b>{c.rotulo}</b> {c.valor}
                      </span>
                    ))}
                  </div>
                  <label className="arte-prompt-l">
                    <span className="arte-sr">Prompt (editável)</span>
                    <textarea
                      className="arte-prompt"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      rows={4}
                      disabled={montando && !texto}
                      placeholder={montando ? 'Montando o prompt a partir do capítulo…' : 'Descreva a imagem'}
                    />
                  </label>
                  {aviso && <p className="arte-aviso">{aviso}</p>}
                  {itemAlvo?.status === 'erro' && itemAlvo.erro && (
                    <p className="err" role="alert">
                      Última tentativa falhou: {itemAlvo.erro}
                    </p>
                  )}
                  {pm?.negativo && (
                    <details className="arte-neg">
                      <summary>O que evitar</summary>
                      <p>{pm.negativo}</p>
                    </details>
                  )}
                  <div className="arte-ctx-pe">
                    {pm && (
                      <>
                        <span className="pill">
                          Semente <b>{provedor === 'openai' ? '—' : pm.semente}</b>
                          {pm.variacao ? ` · var. ${pm.variacao}` : ''}
                        </span>
                        <span className="pill">
                          Formato <b>{estiloAtual && alvo && estiloAtual.proporcoes[alvo.tipo] === 'livro' ? 'página do livro' : `${pm.proporcao[0]}×${pm.proporcao[1]}`}</b>
                        </span>
                        <span className="pill">
                          <b>{pm.largura}×{pm.altura}</b> px
                        </span>
                      </>
                    )}
                    <span className="arte-ctx-botoes">
                      {editado && (
                        <button type="button" className="btn sm" onClick={() => pm && setTexto(pm.prompt)}>
                          Desfazer edição
                        </button>
                      )}
                      <button type="button" className="btn sm" onClick={() => alvo && void montar(alvo)} disabled={montando}>
                        Reler contexto
                      </button>
                      {alvoOcupado ? (
                        <button type="button" className="btn sm" onClick={() => void agir(() => arte.cancelar(dir, alvoChave))}>
                          <Ic nome="parar" tam={14} /> {itemAlvo?.status === 'gerando' ? 'Parar' : 'Tirar da fila'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn sm pri"
                          disabled={!podeGerar || !texto.trim()}
                          onClick={() => alvo && void gerar(alvo, { variar: !!metaAlvo, prompt: editado ? texto : undefined })}
                        >
                          <Ic nome="faisca" tam={14} /> {metaAlvo ? 'Gerar nova variação' : 'Gerar só este'}
                        </button>
                      )}
                    </span>
                  </div>
                </>
              )}
            </section>

            {aba === 'aberturas' && (
              <section className="panel arte-lote" aria-labelledby="arte-lote-t">
                <h2 id="arte-lote-t" className="arte-eb">
                  Geração em lote
                </h2>
                <span className="disp arte-lote-n" aria-live="polite">
                  {capsProntos} de {caps.length} aberturas
                </span>
                <span
                  className="arte-barra"
                  role="progressbar"
                  aria-label="Aberturas prontas"
                  aria-valuemin={0}
                  aria-valuemax={caps.length}
                  aria-valuenow={capsProntos}
                >
                  <span style={{ width: `${caps.length ? (capsProntos / caps.length) * 100 : 0}%` }} />
                </span>
                <span className="arte-lote-nota">
                  {loteAtivo
                    ? `${capsPendentes} na fila${fila?.restanteMs ? ` · ${duracao(fila.restanteMs)} restantes` : ' · estimando…'}. Pode continuar escrevendo: a fila segue em segundo plano.`
                    : podeGerar
                      ? 'Usa o estilo e a semente do livro em todos os capítulos.'
                      : 'Ligue um gerador em Ajustes para gerar em lote.'}
                </span>
                <div className="arte-lote-botoes">
                  {loteAtivo ? (
                    <button type="button" className="btn" onClick={() => void agir(() => arte.cancelar(dir))}>
                      <Ic nome="parar" tam={16} /> Cancelar fila
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn pri"
                        disabled={!podeGerar || capsProntos === caps.length}
                        onClick={() => void agir(() => arte.lote(dir, caps.map((c) => c.file)))}
                      >
                        <Ic nome="camadas" tam={16} /> {capsProntos ? 'Gerar as que faltam' : 'Gerar aberturas de todos os capítulos'}
                      </button>
                      {capsProntos > 0 && (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={!podeGerar}
                          onClick={() =>
                            window.confirm(`Refazer as ${caps.length} aberturas com o estilo atual? As artes atuais serão substituídas.`) &&
                            void agir(() => arte.lote(dir, caps.map((c) => c.file), { refazer: true }))
                          }
                        >
                          Refazer todas
                        </button>
                      )}
                    </>
                  )}
                  {(fila?.itens.some((i) => i.status === 'erro' || i.status === 'cancelado') ?? false) && !loteAtivo && (
                    <button type="button" className="btn sm" onClick={() => void agir(() => arte.limpar(dir))}>
                      Limpar avisos
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* ---------- grade ---------- */}
          {aba === 'aberturas' && (
            <section aria-label="Aberturas dos capítulos" className="arte-grade">
              {caps.map((c) => {
                const a: Alvo = { tipo: 'abertura', chapterFile: c.file }
                const k = chaveDe(a)
                const it = itemPorChave.get(k)
                return (
                  <Miniatura
                    key={c.file}
                    dir={dir}
                    rotulo={c.title}
                    sub={rotuloCap(c.file)}
                    meta={geradas[k]}
                    status={it?.status === 'pronto' || it?.status === 'cancelado' ? undefined : it?.status}
                    erro={it?.erro}
                    proporcao={propAbertura}
                    selecionada={alvoChave === k}
                    onSelecionar={() => setAlvo(a)}
                    onAbrir={() => setAberta(k)}
                    onRegenerar={() => void gerar(a, { variar: !!geradas[k] })}
                    podeGerar={podeGerar}
                  />
                )
              })}
            </section>
          )}

          {aba === 'retratos' && (
            <section aria-label="Retratos das fichas" className="arte-grade arte-grade-retratos">
              {fichas.map((f) => {
                const a: Alvo = { tipo: 'retrato', fichaId: f.id }
                const k = chaveDe(a)
                const it = itemPorChave.get(k)
                return (
                  <Miniatura
                    key={f.id}
                    dir={dir}
                    rotulo={f.nome}
                    sub={f.tipo}
                    meta={geradas[k]}
                    status={it?.status === 'pronto' || it?.status === 'cancelado' ? undefined : it?.status}
                    erro={it?.erro}
                    proporcao={propRetrato}
                    selecionada={alvoChave === k}
                    onSelecionar={() => setAlvo(a)}
                    onAbrir={() => setAberta(k)}
                    onRegenerar={() => void gerar(a, { variar: !!geradas[k] })}
                    podeGerar={podeGerar}
                  />
                )
              })}
            </section>
          )}

          {aba === 'capa' && (
            <section aria-label="Capa" className="arte-grade arte-grade-capa">
              <Miniatura
                dir={dir}
                rotulo={project.meta.title}
                sub="Capa"
                meta={geradas.capa}
                status={(() => {
                  const s = itemPorChave.get('capa')?.status
                  return s === 'pronto' || s === 'cancelado' ? undefined : s
                })()}
                erro={itemPorChave.get('capa')?.erro}
                proporcao={livroProp}
                selecionada
                onSelecionar={() => setAlvo({ tipo: 'capa' })}
                onAbrir={() => setAberta('capa')}
                onRegenerar={() => void gerar({ tipo: 'capa' }, { variar: !!geradas.capa })}
                podeGerar={podeGerar}
              />
              <p className="muted arte-capa-nota">
                Arte da frente, na proporção do miolo ({project.meta.layout.trim.widthMm}×{project.meta.layout.trim.heightMm} mm), sem título escrito: o
                título e o nome entram na Diagramação.
              </p>
            </section>
          )}
        </div>
      </div>

      {aberta && abrirMeta && (
        <Visualizador
          dir={dir}
          rotulo={rotuloDe(aberta)}
          meta={abrirMeta}
          estilos={estilos}
          ocupada={abrirItem?.status === 'fila' || abrirItem?.status === 'gerando'}
          podeGerar={podeGerar}
          onFechar={() => setAberta(null)}
          onRegenerar={() => void gerar(abrirMeta.alvo, { variar: true })}
          destino={destinoDe(aberta)}
        />
      )}

      {editor && (
        <EstiloEditor
          estilo={editor.estilo}
          partida={editor.partida}
          presets={estilos.filter((e) => e.preset)}
          existentes={estilos.map((e) => e.id)}
          onSalvar={salvarEstilo}
          onFechar={() => setEditor(null)}
        />
      )}
    </div>
  )
}
