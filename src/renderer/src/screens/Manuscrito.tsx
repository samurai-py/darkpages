import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/react'
import type { ScreenProps } from '../screen'
import { call, folio } from '../api'
import { countWords, type ChapterContent, type ChapterKind, type Project } from '../../../shared/types'
import type { CenaMeta, Conflito, Ficha, Insight, ProativoEstado } from '../../../shared/models'
import { ia } from '../features/ia/api'
import { aceitarRascunho, descartarRascunho, guardaRascunho, inserirRascunho, pontoDeInsercao, type PontoInsercao } from '../features/manuscrito/rascunho'
import type { RascunhoUI, Tela } from '../features/manuscrito/ChapterEditor'
import { insightsStore, useInsights } from '../features/insights/store'
import { ponte } from '../features/insights/ponte'
import { Icon } from '../icons'
import { useAutosave, type SaveState } from '../useAutosave'
import { ChapterEditor } from '../features/manuscrito/ChapterEditor'
import { ChapterList, rotuloLongo, type Metas } from '../features/manuscrito/ChapterList'
import { Toolbar, mmss, type Visual } from '../features/manuscrito/Toolbar'
import { Inspector } from '../features/manuscrito/Inspector'
import { Exportar, Importar } from '../features/manuscrito/ImportExport'
import { Ico } from '../features/manuscrito/icones'
import { fichasNoTexto, fmt, formatoCm, paginasCapitulo, tempoLeitura } from '../features/manuscrito/texto'
import type { Furo } from '../features/manuscrito/extensions'
import { SyncStatus } from '../features/sync/SyncStatus'
import { SpotifyPlayer } from '../features/spotify/Player'
import './manuscrito.css'

interface RascunhoEstado extends RascunhoUI {
  file: string
  ideia: { tipo: string; texto: string }
  ponto: PontoInsercao
}

interface Draft {
  file: string
  title: string
  body: string
}

interface CenaDraft {
  file: string
  cena: CenaMeta
}

type Toast =
  | { id: string; tipo: 'furo'; conflito: Conflito }
  | { id: string; tipo: 'info' | 'erro'; titulo: string; texto: string }

const VISUAL_KEY = 'folio.manuscrito.visual'
const VISUAL_PADRAO: Visual & Tela & { repeticoes: boolean; focoMin: number } = {
  corpoPx: 19,
  linha: 1.7,
  repeticoes: true,
  focoMin: 25,
  justificar: false,
  maquina: false,
  focoParagrafo: false
}
const METAS_PADRAO: Metas = { metaCapitulo: 3000, metaLivro: 80000 }

function lerVisual(): typeof VISUAL_PADRAO {
  try {
    const raw = localStorage.getItem(VISUAL_KEY)
    if (raw) return { ...VISUAL_PADRAO, ...(JSON.parse(raw) as Partial<typeof VISUAL_PADRAO>) }
  } catch {
    /* armazenamento indisponível: usa o padrão */
  }
  return VISUAL_PADRAO
}

function gravarVisual(v: typeof VISUAL_PADRAO): void {
  try {
    localStorage.setItem(VISUAL_KEY, JSON.stringify(v))
  } catch {
    /* ignora */
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function chaveConflito(c: Conflito): string {
  return `${c.fichaId}|${c.campo}|${c.trecho}`
}

function estadoSalvo(a: SaveState, b: SaveState): { text: string; cls: string } {
  const err = a.kind === 'error' ? a : b.kind === 'error' ? b : null
  if (err) return { text: `Erro ao salvar: ${err.message}`, cls: 'bad' }
  if (a.kind === 'saving' || b.kind === 'saving') return { text: 'Salvando…', cls: 'busy' }
  if (a.kind === 'dirty' || b.kind === 'dirty') return { text: 'Alterações não salvas', cls: 'busy' }
  const ts = [a, b].flatMap((s) => (s.kind === 'saved' ? [s.at] : []))
  if (ts.length) {
    const at = new Date(Math.max(...ts.map((d) => d.getTime())))
    return { text: `Salvo às ${at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, cls: '' }
  }
  return { text: 'Tudo salvo', cls: '' }
}

/** Toque curto ao fim da ampulheta (sem arquivo de áudio). */
function tocarAviso(): void {
  try {
    const ctx = new AudioContext()
    const notas = [660, 880]
    notas.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      o.type = 'sine'
      const t = ctx.currentTime + i * 0.22
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.55)
    })
    setTimeout(() => void ctx.close(), 1500)
  } catch {
    /* sem áudio */
  }
}

export function Manuscrito({ project, onProject, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const projectRef = useRef(project)
  projectRef.current = project

  const inicial = params.chapter && project.chapters.some((c) => c.file === params.chapter) ? params.chapter : (project.chapters[0]?.file ?? null)
  const [current, setCurrent] = useState<string | null>(inicial)
  const [chapter, setChapter] = useState<ChapterContent | null>(null)
  const [carga, setCarga] = useState(0)
  const [title, setTitle] = useState('')
  const [cena, setCena] = useState<CenaMeta>({})
  const [ignorados, setIgnorados] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [textoLento, setTextoLento] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [fichas, setFichas] = useState<Ficha[]>([])
  const [metas, setMetas] = useState<Metas>(METAS_PADRAO)
  const [visual, setVisualState] = useState(lerVisual)
  const [busca, setBusca] = useState(false)
  const [foco, setFoco] = useState(false)
  const [fimAmpulheta, setFimAmpulheta] = useState<number | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const palavrasInicioFoco = useRef(0)

  const [conflitos, setConflitos] = useState<Conflito[]>([])
  const [checando, setChecando] = useState(false)
  const [erroCont, setErroCont] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<'importar' | 'exportar' | null>(null)

  const root = useRef<HTMLDivElement>(null)
  const bodyRef = useRef('')

  // rascunho da IA (Escrever no texto) e modo proativo
  const [rascunho, setRascunho] = useState<RascunhoEstado | null>(null)
  const rascunhoRef = useRef<RascunhoEstado | null>(null)
  rascunhoRef.current = rascunho
  const [recarga, setRecarga] = useState(0)
  const [proativo, setProativo] = useState<ProativoEstado | null>(null)
  const currentRef = useRef(current)
  currentRef.current = current
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor
  const focoRef = useRef(false)
  focoRef.current = foco
  /** o editor já teve foco neste capítulo (o cursor vale como ponto de inserção) */
  const teveFoco = useRef(false)
  /** houve edição neste capítulo desde que foi aberto (para o gatilho de troca) */
  const editouCap = useRef(false)
  const pausaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const insState = useInsights()

  const setVisual = (v: Partial<typeof VISUAL_PADRAO>): void => {
    setVisualState((old) => {
      const n = { ...old, ...v }
      gravarVisual(n)
      return n
    })
  }

  const toast = useCallback((t: Toast): void => {
    setToasts((v) => [...v.filter((x) => x.id !== t.id), t].slice(-4))
  }, [])
  const fecharToast = (id: string): void => setToasts((v) => v.filter((x) => x.id !== id))

  // ------------------------------------------------------------ salvamento

  const persist = useCallback(
    async (d: Draft): Promise<void> => {
      const r = await folio.saveChapter(dir, d.file, d.title, d.body)
      const p = projectRef.current
      onProject({ ...p, chapters: p.chapters.map((c) => (c.file === d.file ? { ...c, title: d.title, words: r.words } : c)) })
    },
    [dir, onProject]
  )
  const corpo = useAutosave<Draft>(persist, 1000)

  const persistCena = useCallback(
    async (d: CenaDraft): Promise<void> => {
      await call<ChapterContent>('manuscrito.cena', dir, d.file, d.cena)
    },
    [dir]
  )
  const meta = useAutosave<CenaDraft>(persistCena, 1000)

  const flushAll = useCallback(async (): Promise<void> => {
    await Promise.all([corpo.flush(), meta.flush()])
  }, [corpo, meta])

  // ------------------------------------------------------------ carga

  useEffect(() => {
    if (!current) {
      setChapter(null)
      return
    }
    let alive = true
    setError(null)
    folio
      .readChapter(dir, current)
      .then((c) => {
        if (!alive) return
        bodyRef.current = c.body
        setChapter(c)
        setTitle(c.title)
        setCena(c.cena ?? {})
        setIgnorados(c.ignorados ?? [])
        setConflitos([])
        setErroCont(null)
        setToasts((v) => v.filter((t) => t.tipo !== 'furo'))
        setRascunho(null)
        teveFoco.current = false
        editouCap.current = false
        setCarga((n) => n + 1)
      })
      .catch((e: unknown) => alive && setError(msg(e)))
    return () => {
      alive = false
    }
  }, [current, dir, recarga])

  useEffect(() => {
    let alive = true
    folio.docs
      .list<Ficha>(dir, 'universo')
      .then((l) => alive && setFichas(l.filter((f) => f && typeof f.nome === 'string')))
      .catch(() => alive && setFichas([]))
    folio.docs
      .get<Metas>(dir, 'escrita', 'metas')
      .then((m) => alive && m && setMetas({ ...METAS_PADRAO, ...m }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [dir])

  // abrir capítulo pedido por outra tela (params.chapter)
  useEffect(() => {
    const alvo = params.chapter
    if (alvo && alvo !== current && projectRef.current.chapters.some((c) => c.file === alvo)) void switchTo(alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chapter])

  // o capítulo atual pode sumir (excluído em outra janela)
  useEffect(() => {
    if (current && !project.chapters.some((c) => c.file === current)) setCurrent(project.chapters[0]?.file ?? null)
  }, [project.chapters, current])

  // texto "lento" para análises mais pesadas (fichas na cena)
  useEffect(() => {
    const t = setTimeout(() => setTextoLento(texto), 800)
    return () => clearTimeout(t)
  }, [texto])

  const switchTo = async (file: string): Promise<void> => {
    if (file === current) return
    if (!guardaRascunho.confirmarSaida()) return
    setRascunho(null)
    await flushAll()
    if (pausaTimer.current) clearTimeout(pausaTimer.current)
    // gatilho "troca de capítulo" do modo proativo: analisa o capítulo que ficou para trás
    if (current && editouCap.current && proativo && proativo.config.modo !== 'off' && !foco) {
      call('insights.pausa', dir, current, { motivo: 'troca', foco: false }).catch(() => undefined)
    }
    setBusca(false)
    setCurrent(file)
  }

  const onEditor = useCallback((e: Editor | null): void => {
    setEditor(e)
    if (e) {
      const t = e.getText()
      setTexto(t)
      setTextoLento(t)
    }
  }, [])

  /** gatilho "pausa" do modo proativo: N s sem digitar, depois de salvar */
  const agendarPausa = (): void => {
    if (pausaTimer.current) clearTimeout(pausaTimer.current)
    if (!proativo || proativo.config.modo === 'off') return
    const file = currentRef.current
    pausaTimer.current = setTimeout(() => {
      if (focoRef.current || !file || file !== currentRef.current) return
      void corpo
        .flush()
        .then(() => call('insights.pausa', dir, file, { motivo: 'pausa', foco: focoRef.current }))
        .catch(() => undefined)
    }, proativo.config.pausaS * 1000)
  }

  const onChange = (md: string, t: string, temRascunho: boolean): void => {
    if (!current) return
    bodyRef.current = md
    setTexto(t)
    // o autor apagou o rascunho à mão: some a barra
    if (!temRascunho) setRascunho((r) => (r && !r.carregando ? null : r))
    corpo.schedule({ file: current, title: title.trim() || 'Sem título', body: md })
    editouCap.current = true
    agendarPausa()
  }

  // ------------------------------------------------------------ escrever no texto (rascunho da IA)

  useEffect(() => {
    if (!editor) return
    const onFocus = (): void => {
      teveFoco.current = true
    }
    editor.on('focus', onFocus)
    return () => {
      editor.off('focus', onFocus)
    }
  }, [editor])

  useEffect(() => {
    guardaRascunho.pendente = !!rascunho
    if (!rascunho) return
    const onUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [rascunho])
  useEffect(
    () => () => {
      guardaRascunho.pendente = false
      if (pausaTimer.current) clearTimeout(pausaTimer.current)
    },
    []
  )

  const mostrarRascunho = (id: string): void => {
    setTimeout(() => {
      document.querySelector(`.ms-rascunho[data-rascunho="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }

  const redigir = async (ideia: { tipo: string; texto: string }, usarCursor: boolean): Promise<void> => {
    const ed = editorRef.current
    const file = currentRef.current
    if (!ed || ed.isDestroyed || !file) throw new Error('Abra um capítulo primeiro.')
    const pend = rascunhoRef.current
    if (pend) {
      if (pend.carregando) throw new Error('Espere o rascunho atual terminar.')
      if (!window.confirm('Já há um rascunho da IA pendente neste capítulo. Descartar e escrever outro?')) return
      descartarRascunho(ed, pend.id)
      setRascunho(null)
    }
    const ponto = pontoDeInsercao(ed, usarCursor && teveFoco.current)
    await corpo.flush()
    toast({ id: 'redigir', tipo: 'info', titulo: 'Escrevendo no texto', texto: 'A IA está redigindo a ideia na sua voz. O texto entra como rascunho.' })
    try {
      const r = await ia.redigir(dir, file, ideia, { antes: ponto.antes, depois: ponto.depois })
      const atual = editorRef.current
      if (currentRef.current !== file || !atual || atual.isDestroyed) return
      const id = `r${Date.now().toString(36)}`
      // o autor pode ter digitado enquanto a IA escrevia: recalcula o ponto
      if (!inserirRascunho(atual, r.texto, id, pontoDeInsercao(atual, usarCursor && teveFoco.current))) throw new Error('A IA não devolveu texto aproveitável.')
      setRascunho({ id, file, ideia, ponto, carregando: false, erro: null })
      mostrarRascunho(id)
    } finally {
      fecharToast('redigir')
    }
  }

  const aceitar = (): void => {
    const ed = editorRef.current
    const r = rascunhoRef.current
    if (!ed || !r) return
    aceitarRascunho(ed, r.id)
    setRascunho(null)
  }

  const descartar = (): void => {
    const ed = editorRef.current
    const r = rascunhoRef.current
    if (!ed || !r) return
    descartarRascunho(ed, r.id)
    setRascunho(null)
  }

  const refazer = async (): Promise<void> => {
    const r = rascunhoRef.current
    if (!r || r.carregando) return
    setRascunho({ ...r, carregando: true, erro: null })
    try {
      const novo = await ia.redigir(dir, r.file, r.ideia, { antes: r.ponto.antes, depois: r.ponto.depois }, 'Escreva uma versão diferente da anterior, com outra abordagem, mantendo a ideia.')
      const ed = editorRef.current
      if (!ed || ed.isDestroyed || currentRef.current !== r.file) return
      inserirRascunho(ed, novo.texto, r.id, pontoDeInsercao(ed, false))
      setRascunho((x) => (x && x.id === r.id ? { ...x, carregando: false } : x))
      mostrarRascunho(r.id)
    } catch (e) {
      setRascunho((x) => (x && x.id === r.id ? { ...x, carregando: false, erro: msg(e) } : x))
    }
  }

  // "Escrever no texto" pedido pelo painel de Insights (go('manuscrito', { chapter, redigir: id }))
  const redigirFeito = useRef('')
  useEffect(() => {
    const id = params.redigir
    const chave = `${id ?? ''}|${params.n ?? ''}`
    if (!id || redigirFeito.current === chave || !editor || editor.isDestroyed || !chapter || chapter.file !== current) return
    if (params.chapter && params.chapter !== current) return
    redigirFeito.current = chave
    void (async () => {
      try {
        const ins = await folio.docs.get<Insight>(dir, 'insights', id)
        if (!ins) throw new Error('Esse insight não existe mais.')
        const ideia = ins.acao?.tipo === 'redigir' ? ins.acao.ideia : { tipo: ins.tipo, texto: ins.texto }
        await redigir(ideia, false)
      } catch (e) {
        toast({ id: 'redigir-erro', tipo: 'erro', titulo: 'Não deu para escrever no texto', texto: msg(e) })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.redigir, params.n, params.chapter, editor, chapter, current])

  // modo proativo: configuração (pausa, modo) e ponte para o painel de Insights
  useEffect(() => {
    ia.proativo()
      .then(setProativo)
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    ponte.atual = {
      file: current,
      flush: flushAll,
      recarregar: (f) => {
        if (f === currentRef.current) setRecarga((n) => n + 1)
      },
      rascunhoPendente: () => !!rascunhoRef.current
    }
    return () => {
      ponte.atual = null
    }
  }, [current, flushAll])
  const novosNoCap =
    !foco && current && insState.dir === dir ? insState.lista.filter((i) => i.capitulo === current && i.status === 'novo' && i.tipo !== 'resumo').length : 0

  const onTitulo = (t: string): void => {
    setTitle(t)
    if (current) corpo.schedule({ file: current, title: t.trim() || 'Sem título', body: bodyRef.current })
  }

  const onCena = (c: CenaMeta): void => {
    setCena(c)
    if (current) meta.schedule({ file: current, cena: c })
  }

  // ------------------------------------------------------------ estrutura

  const criar = async (t: string): Promise<void> => {
    await flushAll()
    const p = await folio.addChapter(dir, t)
    onProject(p)
    setCurrent(p.chapters.at(-1)?.file ?? null)
  }

  const renomear = async (file: string, t: string): Promise<void> => {
    await flushAll()
    onProject(await call<Project>('manuscrito.titulo', dir, file, t))
    if (file === current) setTitle(t)
  }

  const mover = async (ordem: string[]): Promise<void> => {
    await flushAll()
    const r = await call<{ project: Project; renomeados: Record<string, string> }>('manuscrito.reordenar', dir, ordem)
    onProject(r.project)
    if (current && r.renomeados[current]) setCurrent(r.renomeados[current]!)
  }

  const mudarTipo = async (file: string, k: ChapterKind): Promise<void> => {
    await flushAll()
    onProject(await call<Project>('manuscrito.tipo', dir, file, k))
  }

  const excluir = async (file: string): Promise<void> => {
    await flushAll()
    const caps = projectRef.current.chapters
    const i = caps.findIndex((c) => c.file === file)
    const p = await call<Project>('manuscrito.excluir', dir, file)
    onProject(p)
    if (file === current) setCurrent(p.chapters[Math.min(i, p.chapters.length - 1)]?.file ?? null)
    toast({ id: `del-${file}`, tipo: 'info', titulo: 'Capítulo excluído', texto: 'Ele foi para .arca/lixeira dentro da pasta do livro.' })
  }

  const salvarMetas = (m: Metas): void => {
    setMetas(m)
    folio.docs.put(dir, 'escrita', 'metas', m).catch((e: unknown) => toast({ id: 'metas', tipo: 'erro', titulo: 'Metas não salvas', texto: msg(e) }))
  }

  // ------------------------------------------------------------ continuidade

  const checar = async (): Promise<void> => {
    if (!current) return
    setChecando(true)
    setErroCont(null)
    try {
      await flushAll()
      const lista = await call<Conflito[]>('ia.continuidade', dir, current)
      const ign = new Set(ignorados)
      const novos = (Array.isArray(lista) ? lista : []).filter((c) => !ign.has(chaveConflito(c)))
      setConflitos(novos)
      setToasts((v) => v.filter((t) => t.tipo !== 'furo'))
      novos.slice(0, 2).forEach((c) => toast({ id: `furo-${chaveConflito(c)}`, tipo: 'furo', conflito: c }))
      if (novos.length === 0) toast({ id: 'cont-ok', tipo: 'info', titulo: 'Continuidade', texto: 'Nenhum furo encontrado neste capítulo.' })
    } catch (e) {
      setErroCont(msg(e))
    } finally {
      setChecando(false)
    }
  }

  const ignorar = async (c: Conflito): Promise<void> => {
    if (!current) return
    const k = chaveConflito(c)
    setConflitos((v) => v.filter((x) => chaveConflito(x) !== k))
    fecharToast(`furo-${k}`)
    try {
      await meta.flush()
      setIgnorados(await call<string[]>('manuscrito.ignorar', dir, current, k))
    } catch (e) {
      toast({ id: 'ign', tipo: 'erro', titulo: 'Não deu para lembrar', texto: msg(e) })
    }
  }

  const abrirFicha = async (id: string): Promise<void> => {
    await flushAll()
    go('universo', { ficha: id })
  }

  const furos: Furo[] = useMemo(
    () => conflitos.map((c) => ({ trecho: c.trecho, titulo: `${c.fichaNome} · ${c.campo}: na ficha “${c.esperado}”, aqui “${c.encontrado}”` })),
    [conflitos]
  )

  // ------------------------------------------------------------ foco e ampulheta

  const sairFoco = useCallback((): void => {
    setFoco(false)
    setFimAmpulheta(null)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }, [])

  const entrarFoco = (): void => {
    setFoco(true)
    setBusca(false)
    palavrasInicioFoco.current = countWords(texto)
    setFimAmpulheta(Date.now() + visual.focoMin * 60_000)
    setAgora(Date.now())
    const el = root.current
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => undefined)
  }

  useEffect(() => {
    const onFs = (): void => {
      if (!document.fullscreenElement && foco) sairFoco()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [foco, sairFoco])

  useEffect(() => {
    if (fimAmpulheta === null) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [fimAmpulheta])

  const restante = fimAmpulheta === null ? null : Math.max(0, Math.round((fimAmpulheta - agora) / 1000))

  useEffect(() => {
    if (restante !== 0 || fimAmpulheta === null) return
    setFimAmpulheta(null)
    tocarAviso()
    const escritas = Math.max(0, countWords(texto) - palavrasInicioFoco.current)
    toast({
      id: 'ampulheta',
      tipo: 'info',
      titulo: 'A ampulheta virou',
      texto: `${visual.focoMin} minutos de escrita · ${fmt(escritas)} palavras novas. Respire e, se quiser, comece outra rodada.`
    })
  }, [restante, fimAmpulheta, texto, visual.focoMin, toast])

  const alternarAmpulheta = (): void => {
    if (fimAmpulheta === null) {
      palavrasInicioFoco.current = countWords(texto)
      setFimAmpulheta(Date.now() + visual.focoMin * 60_000)
      setAgora(Date.now())
    } else setFimAmpulheta(null)
  }

  // Ctrl+F abre a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setBusca(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------ números

  const layout = project.meta.layout
  const palavrasCap = countWords(texto)
  const palavrasDe = (file: string, w: number): number => (file === current && editor ? palavrasCap : w)
  const totalLivro = project.chapters.reduce((s, c) => s + palavrasDe(c.file, c.words), 0)
  const paginasLivro = project.chapters.reduce((s, c) => s + paginasCapitulo(palavrasDe(c.file, c.words), layout), 0)
  const paginasCap = paginasCapitulo(palavrasCap, layout)
  const st = estadoSalvo(corpo.state, meta.state)
  const presentes = useMemo(() => fichasNoTexto(`${title}\n${textoLento}`, fichas), [textoLento, title, fichas])
  const rotulo = current ? rotuloLongo(project.chapters, current) : ''

  return (
    <div ref={root} className={`screen ms${foco ? ' ms-foco' : ''}`}>
      {!foco && (
        <ChapterList
          capitulos={project.chapters}
          atual={current}
          palavrasAtual={editor ? palavrasCap : (project.chapters.find((c) => c.file === current)?.words ?? 0)}
          metas={metas}
          onMetas={salvarMetas}
          onAbrir={(f) => void switchTo(f)}
          onCriar={criar}
          onRenomear={renomear}
          onMover={mover}
          onTipo={mudarTipo}
          onExcluir={excluir}
          onImportar={() => setModal('importar')}
          onExportar={() => setModal('exportar')}
        />
      )}

      <main className="ms-desk">
        {chapter && (
          <Toolbar
            editor={editor}
            visual={visual}
            onVisual={(v) => setVisual(v)}
            tela={{ justificar: visual.justificar, maquina: visual.maquina, focoParagrafo: visual.focoParagrafo }}
            onTela={(t) => setVisual(t)}
            repeticoes={visual.repeticoes}
            onRepeticoes={(r) => setVisual({ repeticoes: r })}
            buscaAberta={busca}
            onBusca={setBusca}
            foco={foco}
            onFoco={(v) => (v ? entrarFoco() : sairFoco())}
            focoMin={visual.focoMin}
            onFocoMin={(m) => {
              setVisual({ focoMin: m })
              if (fimAmpulheta !== null) setFimAmpulheta(Date.now() + m * 60_000)
            }}
            restante={restante}
            onAmpulheta={alternarAmpulheta}
          />
        )}

        <div className="ms-scroll">
          {error && <p className="err">{error}</p>}
          {chapter && current === chapter.file ? (
            <ChapterEditor
              key={`${chapter.file}#${carga}`}
              inicial={chapter.body}
              rotulo={rotulo}
              titulo={title}
              onTitulo={onTitulo}
              onChange={onChange}
              onEditor={onEditor}
              repeticoes={visual.repeticoes}
              furos={furos}
              corpoPx={visual.corpoPx}
              linha={visual.linha}
              tela={{ justificar: visual.justificar, maquina: visual.maquina, focoParagrafo: visual.focoParagrafo }}
              rascunho={rascunho && rascunho.file === chapter.file ? rascunho : null}
              onAceitar={aceitar}
              onRefazer={() => void refazer()}
              onDescartar={descartar}
            />
          ) : (
            !error &&
            project.chapters.length === 0 && (
              <div className="empty">
                <span className="disp">Nenhum capítulo</span>
                Crie o primeiro capítulo ou importe um manuscrito (.docx, .txt, .md).
                <div className="ms-row">
                  <button type="button" className="btn sm pri" onClick={() => void criar('Capítulo um')}>
                    Criar primeiro capítulo
                  </button>
                  <button type="button" className="btn sm" onClick={() => setModal('importar')}>
                    <Ico n="importar" size={15} /> Importar
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {novosNoCap > 0 && !insState.painel && (
          <button
            type="button"
            className="ms-ins-margem"
            onClick={() => insightsStore.abrir(current ?? '')}
            title="Abrir o painel de Insights deste capítulo"
          >
            <Icon name="sino" size={16} />
            <span>
              {novosNoCap} {novosNoCap === 1 ? 'observação nova' : 'observações novas'} neste capítulo
            </span>
          </button>
        )}

        <div className="ms-spotify">
          <SpotifyPlayer />
        </div>

        <div className="ms-toasts" aria-live="polite">
          {toasts.map((t) =>
            t.tipo === 'furo' ? (
              <div key={t.id} className="ms-toast furo" role="status">
                <span className="ms-toast-i" aria-hidden="true">
                  !
                </span>
                <div className="ms-toast-c">
                  <strong>Furo de continuidade</strong>
                  <span>
                    Na ficha, {t.conflito.fichaNome} tem <b>{t.conflito.campo.toLowerCase()} {t.conflito.esperado}</b>. Aqui:{' '}
                    <b className="ms-alerta">{t.conflito.encontrado}</b>.
                  </span>
                  <div className="ms-row ms-row-l">
                    <button type="button" className="btn sm" onClick={() => void abrirFicha(t.conflito.fichaId)}>
                      Abrir ficha
                    </button>
                    <button type="button" className="btn sm ms-quieto" onClick={() => void ignorar(t.conflito)}>
                      Foi de propósito
                    </button>
                  </div>
                </div>
                <button type="button" className="ms-ib" aria-label="Fechar aviso" onClick={() => fecharToast(t.id)}>
                  <Ico n="fechar" size={13} />
                </button>
              </div>
            ) : (
              <div key={t.id} className={`ms-toast ${t.tipo}`} role={t.tipo === 'erro' ? 'alert' : 'status'}>
                <div className="ms-toast-c">
                  <strong>{t.titulo}</strong>
                  <span>{t.texto}</span>
                </div>
                <button type="button" className="ms-ib" aria-label="Fechar aviso" onClick={() => fecharToast(t.id)}>
                  <Ico n="fechar" size={13} />
                </button>
              </div>
            )
          )}
        </div>

        <footer className="status ms-status">
          <span>
            <b>{fmt(palavrasCap)}</b> palavras no capítulo
          </span>
          <span>
            <b>{fmt(totalLivro)}</b> no livro
          </span>
          <span title="Estimativa pelo formato, corpo e entrelinha da Diagramação">
            ≈ {fmt(paginasCap)} p. · {fmt(paginasLivro)} páginas · {formatoCm(layout)}
          </span>
          <span>{tempoLeitura(palavrasCap)}</span>
          {foco && restante !== null && (
            <span>
              <Ico n="ampulheta" size={12} /> {mmss(restante)}
            </span>
          )}
          <span className="saved" role="status">
            <i className={`dot ${st.cls}`} />
            {st.text}
          </span>
          <SyncStatus dir={dir} />
        </footer>
      </main>

      {!foco && current && chapter && (
        <Inspector
          dir={dir}
          file={current}
          rotulo={rotulo}
          cena={cena}
          onCena={onCena}
          fichas={fichas}
          onFicha={(f) => setFichas((v) => v.map((x) => (x.id === f.id ? f : x)))}
          presentes={presentes}
          conflitos={conflitos}
          checando={checando}
          erroContinuidade={erroCont}
          onChecar={() => void checar()}
          onAbrirFicha={(id) => void abrirFicha(id)}
          onIgnorar={(c) => void ignorar(c)}
          antesDaIA={flushAll}
          onRedigir={(i) => redigir({ tipo: i.tipo, texto: i.ligadoA ? `${i.texto} (ligado a: ${i.ligadoA})` : i.texto }, true)}
          redigindo={!!rascunho?.carregando}
        />
      )}

      {modal === 'importar' && (
        <Importar
          dir={dir}
          onClose={() => setModal(null)}
          onFeito={(p, criados) => {
            void flushAll().then(() => {
              onProject(p)
              setModal(null)
              if (criados[0]) setCurrent(criados[0])
              toast({ id: 'imp', tipo: 'info', titulo: 'Importação concluída', texto: `${criados.length} ${criados.length === 1 ? 'capítulo entrou' : 'capítulos entraram'} no fim do livro.` })
            })
          }}
        />
      )}
      {modal === 'exportar' && (
        <Exportar
          dir={dir}
          onClose={() => setModal(null)}
          onFeito={(path) => {
            setModal(null)
            toast({ id: 'exp', tipo: 'info', titulo: 'Exportado', texto: path.split(/[\\/]/).pop() ?? path })
          }}
        />
      )}
    </div>
  )
}
