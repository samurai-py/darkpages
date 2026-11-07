import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactElement
} from 'react'
import { folio } from '../../api'
import type { Cartao, EnredoBoard, Ficha } from '../../../../shared/models'
import type { NavParams, Screen } from '../../screen'
import { useAutosave } from '../../useAutosave'
import { Escolha, Faixa, Segmentos, type Passo } from './controles'
import { CARIMBO_FIXO, GRUPOS, TODAS, type Ferramenta, type ModoAgua, type ModoTerra, type TipoFloresta, type TipoMontanha } from './ferramentas'
import { clamp, decodeGrade, encodeGrade, novoId, pathAberto, pathRio, pintar, pintarSegmento, simplificar, type Pincel } from './geom'
import { IconeM } from './icones'
import {
  acharItem,
  acharPorId,
  ancoraItem,
  caixaRotulo,
  duplicarItem,
  ehSimboloCamada,
  itemEm,
  itensNoDisco,
  moverItem,
  nomeItem,
  removerItens,
  type ItemRef
} from './itens'
import { DialogoLigar, PopupLigacao } from './Ligacoes'
import { useHistorico } from './useHistorico'
import { contarItens, normalizar } from './modelo'
import { PainelLateral } from './Painel'
import { calcularTerreno, MapaConteudo, MapaDefs } from './render'
import { SIMBOLOS, SimboloMini, TIPOS, tamanho } from './simbolos'
import type { MapaDoc, MapaResumo, Ponto, Rotulo, RotuloEstilo, Simbolo, SimboloCamada, SimboloTipo } from './types'

export interface EditorHandle {
  flush: () => Promise<void>
  renomear: (nome: string) => void
}

interface Props {
  dir: string
  mapaId: string
  go: (screen: Screen, params?: NavParams) => void
  onResumo: (r: MapaResumo) => void
}

/** Carrega o documento e monta o editor. */
export const EditorMapa = forwardRef<EditorHandle, Props>(function EditorMapa(props, ref) {
  const [doc, setDoc] = useState<MapaDoc | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    setDoc(null)
    setErro('')
    folio.docs
      .get<MapaDoc>(props.dir, 'mapas', props.mapaId)
      .then((d) => {
        if (!vivo) return
        if (!d) setErro('Este mapa não foi encontrado.')
        else setDoc(normalizar(d))
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [props.dir, props.mapaId])
  if (erro)
    return (
      <div className="empty">
        <p className="err">{erro}</p>
      </div>
    )
  if (!doc)
    return (
      <div className="empty" aria-busy="true">
        Abrindo o mapa…
      </div>
    )
  return <Editor ref={ref} {...props} inicial={doc} />
})

interface Vista {
  x: number
  y: number
  k: number
}

type Arrasto =
  | { modo: 'pan'; ultimo: { x: number; y: number } }
  | { modo: 'mover'; item: ItemRef; inicio: Ponto; ultimo: Ponto; moveu: boolean }
  | { modo: 'pintar'; ultimo: Ponto; pincel: Pincel }
  | { modo: 'carimbar'; ultimo: Ponto; tipo: SimboloTipo }
  | { modo: 'floresta'; ultimo: Ponto }
  | { modo: 'traco'; pontos: Ponto[] }
  | { modo: 'borracha' }

const ROTULO_PADRAO: Record<RotuloEstilo, { tam: number; espaco: number; texto: string }> = {
  mar: { tam: 30, espaco: 8, texto: 'Mar sem nome' },
  regiao: { tam: 20, espaco: 5, texto: 'Região' },
  cidade: { tam: 14, espaco: 1, texto: 'Lugar' }
}

const ehDigitando = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

const Editor = forwardRef<EditorHandle, Props & { inicial: MapaDoc }>(function Editor({ dir, go, onResumo, inicial }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const p = `m${uid}-`
  const hist = useHistorico(inicial)
  const doc = hist.atual
  const docRef = useRef(doc)
  docRef.current = doc

  // ---------- salvamento ----------
  const { state: salvo, schedule, flush } = useAutosave<MapaDoc>(
    async (d) => {
      await folio.docs.put(dir, 'mapas', d.id, { ...d, atualizadoEm: new Date().toISOString() })
    },
    900
  )
  const primeiro = useRef(true)
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false
      return
    }
    schedule(doc)
    onResumo({ id: doc.id, nome: doc.nome, estilo: doc.estilo, itens: contarItens(doc), atualizadoEm: new Date().toISOString() })
  }, [doc, schedule, onResumo])

  useImperativeHandle(ref, () => ({ flush, renomear: (nome: string) => hist.aplicar((d) => ({ ...d, nome })) }), [flush, hist.aplicar])

  // ---------- ferramenta e opções ----------
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar')
  const [raio, setRaio] = useState(40)
  const [escala, setEscala] = useState(1)
  const [modoTerra, setModoTerra] = useState<ModoTerra>('pintar')
  const [modoAgua, setModoAgua] = useState<ModoAgua>('lago')
  const [tipoMontanha, setTipoMontanha] = useState<TipoMontanha>('montanha')
  const [tipoFloresta, setTipoFloresta] = useState<TipoFloresta>('mista')
  const [tipoCidade, setTipoCidade] = useState<'cidade' | 'capital'>('cidade')
  const [carimbo, setCarimbo] = useState<SimboloTipo>('templo')
  const [larguraRio, setLarguraRio] = useState(8)
  const [tipoRota, setTipoRota] = useState<'trilha' | 'mar'>('trilha')
  const [estiloRotulo, setEstiloRotulo] = useState<RotuloEstilo>('regiao')

  const [sel, setSel] = useState<ItemRef | null>(null)
  const [focarNome, setFocarNome] = useState<string | null>(null)
  const [popup, setPopup] = useState<{ item: string } | null>(null)
  const [dialogo, setDialogo] = useState<ItemRef | null>(null)

  // nomes das fichas/cartões ligados (para o painel)
  const [alvos, setAlvos] = useState<{ fichas: Map<string, string>; cartoes: Map<string, string> }>({ fichas: new Map(), cartoes: new Map() })
  const carregarAlvos = useCallback(async () => {
    const [fichas, board] = await Promise.all([
      folio.docs.list<Ficha>(dir, 'universo').catch(() => [] as Ficha[]),
      folio.docs.get<EnredoBoard>(dir, 'enredo', 'board').catch(() => null)
    ])
    setAlvos({
      fichas: new Map(fichas.map((f) => [f.id, f.nome])),
      cartoes: new Map((board?.cartoes ?? []).map((c: Cartao) => [c.id, c.titulo || 'Sem título']))
    })
  }, [dir])
  useEffect(() => {
    void carregarAlvos()
  }, [carregarAlvos])

  // ---------- vista (zoom/pan) ----------
  const palcoRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, k: 0.5 })
  const ajustar = useCallback(() => {
    const el = palcoRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const d = docRef.current
    const k = Math.max(0.05, Math.min((r.width - 150) / d.largura, (r.height - 110) / d.altura))
    setVista({ k, x: (r.width - d.largura * k) / 2 + 40, y: (r.height - d.altura * k) / 2 + 20 })
  }, [])
  useEffect(() => {
    ajustar()
  }, [ajustar])

  const zoomEm = useCallback((fator: number, mx?: number, my?: number) => {
    const el = palcoRef.current
    const r = el?.getBoundingClientRect()
    const cx = mx ?? (r ? r.width / 2 : 0)
    const cy = my ?? (r ? r.height / 2 : 0)
    setVista((v) => {
      const k = clamp(v.k * fator, 0.05, 12)
      const f = k / v.k
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
    })
  }, [])

  useEffect(() => {
    const el = palcoRef.current
    if (!el) return
    const roda = (e: WheelEvent): void => {
      if (!(e.target instanceof Element) || !e.target.closest('.mp-svg')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomEm(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [zoomEm])

  // ---------- terreno vivo (enquanto pinta) ----------
  const gradeViva = useRef<Uint8Array | null>(null)
  const [tick, setTick] = useState(0)
  const quadro = useRef<number | null>(null)
  const pedirQuadro = (): void => {
    if (quadro.current !== null) return
    quadro.current = requestAnimationFrame(() => {
      quadro.current = null
      setTick((t) => t + 1)
    })
  }
  useEffect(() => () => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current)
  }, [])

  const calc = useMemo(
    () => calcularTerreno(gradeViva.current ?? decodeGrade(doc.terreno), doc.terreno, doc.estilo, doc.relevo, doc.vegetacao),
    // tick força o recálculo durante a pintura
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, doc.terreno, doc.estilo, doc.relevo, doc.vegetacao]
  )
  const conteudo = useMemo(() => <MapaConteudo doc={doc} calc={calc} p={p} />, [doc, calc, p])
  const defs = useMemo(() => <MapaDefs doc={doc} p={p} />, [doc.estilo, p]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- interação ----------
  const arrasto = useRef<Arrasto | null>(null)
  const espaco = useRef(false)
  const [espacoAtivo, setEspacoAtivo] = useState(false)
  const [cursor, setCursor] = useState<Ponto | null>(null)
  const [traco, setTraco] = useState<Ponto[]>([])

  const paraMapa = (e: { clientX: number; clientY: number }): Ponto => {
    const r = svgRef.current?.getBoundingClientRect()
    return { x: (e.clientX - (r?.left ?? 0) - vista.x) / vista.k, y: (e.clientY - (r?.top ?? 0) - vista.y) / vista.k }
  }

  const camadaDe = (tipo: SimboloTipo): SimboloCamada => SIMBOLOS[tipo].camada

  const novoSimbolo = (tipo: SimboloTipo, pt: Ponto, esc: number): Simbolo => ({
    id: novoId('s'),
    tipo,
    x: Math.round(pt.x * 10) / 10,
    y: Math.round(pt.y * 10) / 10,
    escala: Math.round(esc * 100) / 100,
    rot: 0
  })

  const tipoMontanhaAtual = (): SimboloTipo => tipoMontanha
  const tipoArvore = (): SimboloTipo => {
    if (tipoFloresta === 'mista') return Math.random() < 0.7 ? 'arvore' : 'pinheiro'
    return tipoFloresta
  }

  const espalharArvores = (c: Ponto): void => {
    const d = docRef.current
    const base = tamanho(tipoFloresta === 'mista' ? 'arvore' : tipoFloresta, escala).w
    const sp = base * 0.72
    const n = Math.max(1, Math.round(((raio * raio) / (sp * sp)) * 0.35))
    const perto = d.vegetacao.filter((s) => Math.abs(s.x - c.x) < raio + sp && Math.abs(s.y - c.y) < raio + sp)
    const novas: Simbolo[] = []
    for (let k = 0; k < n * 3 && novas.length < n; k++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * raio
      const pt = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
      if (pt.x < 0 || pt.y < 0 || pt.x > d.largura || pt.y > d.altura) continue
      if ([...perto, ...novas].some((s) => Math.hypot(s.x - pt.x, s.y - pt.y) < sp)) continue
      novas.push(novoSimbolo(tipoArvore(), pt, escala * (0.85 + Math.random() * 0.3)))
    }
    if (novas.length) hist.previa((x) => ({ ...x, vegetacao: [...x.vegetacao, ...novas] }))
  }

  const carimbar = (tipo: SimboloTipo, pt: Ponto, jitter: boolean): Simbolo => {
    const s = novoSimbolo(tipo, pt, escala * (jitter ? 0.85 + Math.random() * 0.3 : 1))
    const camada = camadaDe(tipo)
    hist.previa((x) => ({ ...x, [camada]: [...x[camada], s] }))
    return s
  }

  const apagarEm = (pt: Ponto): void => {
    const ids = itensNoDisco(docRef.current, pt.x, pt.y, raio)
    if (ids.size) {
      hist.previa((x) => removerItens(x, ids))
      if (sel && ids.has(sel.id)) setSel(null)
    }
  }

  const pincelAtual = (alt: boolean): Pincel => {
    if (ferramenta === 'terra') {
      const apagar = (modoTerra === 'apagar') !== alt
      return apagar ? 'mar' : 'terra'
    }
    if (alt) return modoAgua === 'secar' ? 'lago' : 'secar'
    return modoAgua === 'lago' ? 'lago' : modoAgua === 'mar' ? 'mar' : 'secar'
  }

  const comPincel = ferramenta === 'terra' || ferramenta === 'agua' || ferramenta === 'floresta' || ferramenta === 'borracha'

  const onDown = (e: RPointerEvent<SVGSVGElement>): void => {
    if (arrasto.current) return
    const alvo = e.currentTarget
    if (e.button === 1 || (e.button === 0 && espaco.current)) {
      e.preventDefault()
      alvo.setPointerCapture(e.pointerId)
      arrasto.current = { modo: 'pan', ultimo: { x: e.clientX, y: e.clientY } }
      return
    }
    if (e.button !== 0) return
    alvo.setPointerCapture(e.pointerId)
    const pt = paraMapa(e)
    const tol = 6 / vista.k
    const d = docRef.current
    setPopup(null)

    switch (ferramenta) {
      case 'selecionar': {
        const hit = itemEm(d, pt.x, pt.y, tol)
        if (hit) {
          setSel(hit)
          hist.iniciar()
          arrasto.current = { modo: 'mover', item: hit, inicio: pt, ultimo: pt, moveu: false }
        } else {
          setSel(null)
          arrasto.current = { modo: 'pan', ultimo: { x: e.clientX, y: e.clientY } }
        }
        return
      }
      case 'terra':
      case 'agua': {
        const g = decodeGrade(d.terreno)
        gradeViva.current = g
        const pincel = pincelAtual(e.altKey)
        pintar(g, d.terreno, pt.x, pt.y, raio, pincel)
        pedirQuadro()
        arrasto.current = { modo: 'pintar', ultimo: pt, pincel }
        return
      }
      case 'montanha': {
        hist.iniciar()
        carimbar(tipoMontanhaAtual(), pt, true)
        arrasto.current = { modo: 'carimbar', ultimo: pt, tipo: tipoMontanhaAtual() }
        return
      }
      case 'floresta': {
        hist.iniciar()
        espalharArvores(pt)
        arrasto.current = { modo: 'floresta', ultimo: pt }
        return
      }
      case 'cidade':
      case 'carimbo':
      case 'vila':
      case 'castelo':
      case 'ruina':
      case 'torre':
      case 'porto':
      case 'navio':
      case 'monstro': {
        const tipo = ferramenta === 'cidade' ? tipoCidade : ferramenta === 'carimbo' ? carimbo : (CARIMBO_FIXO[ferramenta] ?? 'cidade')
        hist.iniciar()
        const s = carimbar(tipo, pt, false)
        hist.concluir()
        setSel({ camada: camadaDe(tipo), id: s.id })
        if (camadaDe(tipo) === 'simbolos') setFocarNome(s.id)
        return
      }
      case 'rio':
      case 'rota': {
        arrasto.current = { modo: 'traco', pontos: [pt] }
        setTraco([pt])
        return
      }
      case 'texto': {
        const base = ROTULO_PADRAO[estiloRotulo]
        const r: Rotulo = { id: novoId('r'), texto: base.texto, x: pt.x, y: pt.y, tam: base.tam, espaco: base.espaco, curva: 0, rot: 0, estilo: estiloRotulo }
        hist.aplicar((x) => ({ ...x, rotulos: [...x.rotulos, r] }))
        setSel({ camada: 'rotulos', id: r.id })
        setFocarNome(r.id)
        return
      }
      case 'ligar': {
        const hit = itemEm(d, pt.x, pt.y, tol, (c) => c !== 'rios' && c !== 'rotas')
        if (hit) {
          setSel(hit)
          setDialogo(hit)
        }
        return
      }
      case 'borracha': {
        hist.iniciar()
        apagarEm(pt)
        arrasto.current = { modo: 'borracha' }
        return
      }
    }
  }

  const onMove = (e: RPointerEvent<SVGSVGElement>): void => {
    const pt = paraMapa(e)
    if (comPincel) setCursor(pt)
    const a = arrasto.current
    if (!a) return
    switch (a.modo) {
      case 'pan': {
        const dx = e.clientX - a.ultimo.x
        const dy = e.clientY - a.ultimo.y
        a.ultimo = { x: e.clientX, y: e.clientY }
        setVista((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
        return
      }
      case 'mover': {
        const dx = pt.x - a.ultimo.x
        const dy = pt.y - a.ultimo.y
        if (!a.moveu && Math.hypot(pt.x - a.inicio.x, pt.y - a.inicio.y) < 3 / vista.k) return
        a.moveu = true
        a.ultimo = pt
        const item = a.item
        hist.previa((x) => moverItem(x, item, dx, dy))
        return
      }
      case 'pintar': {
        const g = gradeViva.current
        if (g && pintarSegmento(g, docRef.current.terreno, a.ultimo, pt, raio, a.pincel)) pedirQuadro()
        a.ultimo = pt
        return
      }
      case 'carimbar': {
        const sp = tamanho(a.tipo, escala).w * 0.62
        if (Math.hypot(pt.x - a.ultimo.x, pt.y - a.ultimo.y) >= sp) {
          a.ultimo = pt
          carimbar(a.tipo, { x: pt.x, y: pt.y + (Math.random() - 0.5) * sp * 0.4 }, true)
        }
        return
      }
      case 'floresta': {
        if (Math.hypot(pt.x - a.ultimo.x, pt.y - a.ultimo.y) >= raio * 0.45) {
          a.ultimo = pt
          espalharArvores(pt)
        }
        return
      }
      case 'traco': {
        const u = a.pontos[a.pontos.length - 1]
        if (!u || Math.hypot(pt.x - u.x, pt.y - u.y) >= 4 / vista.k) {
          a.pontos.push(pt)
          setTraco(a.pontos.slice())
        }
        return
      }
      case 'borracha':
        apagarEm(pt)
        return
    }
  }

  const onUp = (e: RPointerEvent<SVGSVGElement>): void => {
    const a = arrasto.current
    arrasto.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!a) return
    switch (a.modo) {
      case 'mover': {
        hist.concluir()
        if (!a.moveu && docRef.current.ligacoes.some((l) => l.item === a.item.id)) setPopup({ item: a.item.id })
        return
      }
      case 'pintar': {
        const g = gradeViva.current
        gradeViva.current = null
        if (g) {
          const rle = encodeGrade(g)
          hist.aplicar((x) => (x.terreno.rle === rle ? x : { ...x, terreno: { ...x.terreno, rle } }))
        }
        setTick((t) => t + 1)
        return
      }
      case 'carimbar':
      case 'floresta':
      case 'borracha':
        hist.concluir()
        return
      case 'traco': {
        setTraco([])
        const pts = simplificar(a.pontos, 10).map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }))
        if (pts.length < 2) return
        if (ferramenta === 'rio') {
          const id = novoId('rio')
          hist.aplicar((x) => ({ ...x, rios: [...x.rios, { id, pontos: pts, largura: larguraRio }] }))
          setSel({ camada: 'rios', id })
        } else {
          const id = novoId('rota')
          hist.aplicar((x) => ({ ...x, rotas: [...x.rotas, { id, pontos: pts, tipo: tipoRota }] }))
          setSel({ camada: 'rotas', id })
        }
        return
      }
      case 'pan':
        return
    }
  }

  // ---------- teclado ----------
  const excluirSel = (): void => {
    if (!sel) return
    const id = sel.id
    hist.aplicar((x) => removerItens(x, new Set([id])))
    setSel(null)
    setPopup(null)
  }
  const duplicarSel = (): void => {
    if (!sel) return
    const atual = sel
    const r = duplicarItem(docRef.current, atual)
    if (!r) return
    hist.aplicar((x) => duplicarItem(x, atual)?.doc ?? x)
    setSel(r.novo)
  }

  const teclas = useRef<(e: KeyboardEvent, baixo: boolean) => void>(() => undefined)
  teclas.current = (e, baixo) => {
    if (e.code === 'Space' && !ehDigitando(e.target) && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) {
      e.preventDefault()
      espaco.current = baixo
      setEspacoAtivo(baixo)
      return
    }
    if (!baixo || ehDigitando(e.target)) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'z') {
      e.preventDefault()
      if (e.shiftKey) hist.refazer()
      else hist.desfazer()
      return
    }
    if (mod && k === 'y') {
      e.preventDefault()
      hist.refazer()
      return
    }
    if (mod && k === 'd') {
      e.preventDefault()
      duplicarSel()
      return
    }
    if (mod) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (sel) {
        e.preventDefault()
        excluirSel()
      }
      return
    }
    if (e.key === 'Escape') {
      setSel(null)
      setPopup(null)
      setDialogo(null)
      return
    }
    if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const passo = (e.shiftKey ? 10 : 1) / Math.max(0.25, vista.k)
      const dx = e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0
      const dy = e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0
      const item = sel
      hist.aplicar((x) => moverItem(x, item, dx, dy))
      return
    }
    if (e.key === '+' || e.key === '=') return zoomEm(1.25)
    if (e.key === '-') return zoomEm(0.8)
    if (e.key === '0') return ajustar()
    const f = TODAS.find((t) => t.tecla?.toLowerCase() === k)
    if (f) setFerramenta(f.id)
  }
  useEffect(() => {
    const d = (e: KeyboardEvent): void => teclas.current(e, true)
    const u = (e: KeyboardEvent): void => teclas.current(e, false)
    const blur = (): void => {
      espaco.current = false
      setEspacoAtivo(false)
    }
    window.addEventListener('keydown', d)
    window.addEventListener('keyup', u)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', d)
      window.removeEventListener('keyup', u)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // seleção que sumiu (desfazer, borracha)
  useEffect(() => {
    if (sel && !acharItem(doc, sel)) setSel(null)
    if (popup && !acharPorId(doc, popup.item)) setPopup(null)
  }, [doc, sel, popup])

  // ---------- passos de histórico para o painel ----------
  const passo: Passo = useMemo(() => ({ inicio: hist.iniciar, fim: hist.concluir }), [hist.iniciar, hist.concluir])

  // ---------- ligações ----------
  const ligarItem = (item: ItemRef, alvo: { fichaId?: string; cartaoId?: string; nomeFicha?: string }): void => {
    hist.aplicar((x) => {
      let y: MapaDoc = {
        ...x,
        ligacoes: [
          ...x.ligacoes.filter((l) => l.item !== item.id),
          { id: novoId('lig'), item: item.id, ...(alvo.fichaId ? { fichaId: alvo.fichaId } : {}), ...(alvo.cartaoId ? { cartaoId: alvo.cartaoId } : {}) }
        ]
      }
      if (alvo.nomeFicha && ehSimboloCamada(item.camada)) {
        const camada = item.camada
        y = { ...y, [camada]: y[camada].map((s) => (s.id === item.id && !s.nome ? { ...s, nome: alvo.nomeFicha } : s)) }
      }
      return y
    })
    setDialogo(null)
    void carregarAlvos()
  }
  const desligarItem = (item: ItemRef): void => {
    hist.aplicar((x) => ({ ...x, ligacoes: x.ligacoes.filter((l) => l.item !== item.id) }))
    setDialogo(null)
  }

  // ---------- sobreposições ----------
  const k = vista.k
  const sobreposicao: ReactElement[] = []
  if (sel) {
    const it = acharItem(doc, sel)
    if (it && ehSimboloCamada(sel.camada)) {
      const s = it as Simbolo
      const { w, h } = tamanho(s.tipo, s.escala)
      sobreposicao.push(
        <rect
          key="sel"
          className="mp-sel"
          x={-w / 2 - 4}
          y={-h / 2 - 4}
          width={w + 8}
          height={h + 8}
          transform={`translate(${s.x} ${s.y})${s.rot ? ` rotate(${s.rot})` : ''}`}
          vectorEffect="non-scaling-stroke"
        />
      )
    } else if (it && sel.camada === 'rotulos') {
      const r = it as Rotulo
      const { hw, hh } = caixaRotulo(r)
      sobreposicao.push(
        <rect
          key="sel"
          className="mp-sel"
          x={-hw}
          y={-hh}
          width={hw * 2}
          height={hh * 2}
          transform={`translate(${r.x} ${r.y})${r.rot ? ` rotate(${r.rot})` : ''}`}
          vectorEffect="non-scaling-stroke"
        />
      )
    } else if (it && (sel.camada === 'rios' || sel.camada === 'rotas')) {
      const pts = (it as { pontos: Ponto[] }).pontos
      sobreposicao.push(<path key="sel" className="mp-sel mp-sel-linha" d={pathAberto(pts)} vectorEffect="non-scaling-stroke" />)
    }
  }
  for (const l of doc.ligacoes) {
    const r = acharPorId(doc, l.item)
    if (!r || doc.ocultas.includes(r.camada)) continue
    const a = ancoraItem(doc, r)
    if (!a) continue
    sobreposicao.push(
      <g key={`lk-${l.id}`} transform={`translate(${a.x} ${a.y}) scale(${1 / k})`} className="mp-marca">
        <circle r={6} />
        <path d="M-2.4 .6l1.6-1.6a1.7 1.7 0 012.4 2.4l-.6.6M2.4 -.6l-1.6 1.6a1.7 1.7 0 01-2.4-2.4l.6-.6" />
      </g>
    )
  }
  if (traco.length > 1) {
    sobreposicao.push(
      ferramenta === 'rio' ? (
        <path key="traco" className="mp-traco-rio" d={pathRio(traco, larguraRio)} />
      ) : (
        <path key="traco" className="mp-traco" d={pathAberto(traco)} vectorEffect="non-scaling-stroke" />
      )
    )
  }
  if (comPincel && cursor) {
    sobreposicao.push(<circle key="cursor" className="mp-cursor" cx={cursor.x} cy={cursor.y} r={raio} vectorEffect="non-scaling-stroke" />)
  }

  // popup posicionado em coordenadas da tela
  const popupInfo = (() => {
    if (!popup) return null
    const r = acharPorId(doc, popup.item)
    const l = doc.ligacoes.find((q) => q.item === popup.item)
    if (!r || !l) return null
    const a = ancoraItem(doc, r)
    if (!a) return null
    const largura = palcoRef.current?.clientWidth ?? 0
    const x = clamp(a.x * k + vista.x + 10, 8, Math.max(8, largura - 296))
    const y = Math.max(a.y * k + vista.y, 150)
    return { l, x, y }
  })()

  const def = TODAS.find((t) => t.id === ferramenta)
  const cursorClasse = espacoAtivo ? 'is-pan' : ferramenta === 'selecionar' ? 'is-sel' : comPincel ? 'is-pincel' : 'is-cruz'

  const estadoSalvo =
    salvo.kind === 'saving' ? 'Salvando…' : salvo.kind === 'dirty' ? 'Alterado' : salvo.kind === 'error' ? `Erro ao salvar: ${salvo.message}` : 'Salvo'

  return (
    <div className="mp-editor">
      <div className="mp-centro">
        <div className="mp-opcoes" role="toolbar" aria-label={`Opções: ${def?.nome ?? ''}`}>
          <span className="mp-ferr-nome">
            <IconeM nome={def?.icone ?? 'selecionar'} size={18} />
            {def?.nome}
          </span>
          <OpcoesFerramenta
            ferramenta={ferramenta}
            estilo={doc.estilo}
            raio={raio}
            setRaio={setRaio}
            escala={escala}
            setEscala={setEscala}
            modoTerra={modoTerra}
            setModoTerra={setModoTerra}
            modoAgua={modoAgua}
            setModoAgua={setModoAgua}
            tipoMontanha={tipoMontanha}
            setTipoMontanha={setTipoMontanha}
            tipoFloresta={tipoFloresta}
            setTipoFloresta={setTipoFloresta}
            tipoCidade={tipoCidade}
            setTipoCidade={setTipoCidade}
            carimbo={carimbo}
            setCarimbo={setCarimbo}
            larguraRio={larguraRio}
            setLarguraRio={setLarguraRio}
            tipoRota={tipoRota}
            setTipoRota={setTipoRota}
            estiloRotulo={estiloRotulo}
            setEstiloRotulo={setEstiloRotulo}
          />
          <span className="mp-dica">{def?.dica}</span>
          <span className="mp-salvo" role="status" aria-live="polite">
            <span className={`dot${salvo.kind === 'saving' || salvo.kind === 'dirty' ? ' busy' : salvo.kind === 'error' ? ' bad' : ''}`} />
            {estadoSalvo}
          </span>
        </div>

        <div className={`mp-palco ${cursorClasse}`} ref={palcoRef}>
          <div className="mp-ferramentas" role="toolbar" aria-label="Ferramentas do mapa" aria-orientation="vertical">
            {GRUPOS.map((g, i) => (
              <div key={i} className="mp-grupo">
                {g.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="mp-tool"
                    aria-label={t.nome}
                    aria-pressed={ferramenta === t.id}
                    title={t.tecla ? `${t.nome} (${t.tecla})` : t.nome}
                    onClick={() => setFerramenta(t.id)}
                  >
                    <IconeM nome={t.icone} />
                  </button>
                ))}
              </div>
            ))}
          </div>

          <svg
            ref={svgRef}
            className="mp-svg"
            role="application"
            aria-label={`Tela do mapa ${doc.nome}. Ferramenta: ${def?.nome ?? ''}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setCursor(null)}
            onAuxClick={(e) => e.preventDefault()}
          >
            {defs}
            <defs>
              <clipPath id={`${p}clip`}>
                <rect width={doc.largura} height={doc.altura} />
              </clipPath>
            </defs>
            <g transform={`translate(${vista.x} ${vista.y}) scale(${k})`}>
              <rect className="mp-folha" x={-1} y={-1} width={doc.largura + 2} height={doc.altura + 2} vectorEffect="non-scaling-stroke" />
              <g clipPath={`url(#${p}clip)`}>{conteudo}</g>
              {sobreposicao}
            </g>
          </svg>

          <div className="mp-zoom" role="group" aria-label="Zoom e histórico">
            <button type="button" className="mp-tool" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!hist.podeDesfazer} onClick={hist.desfazer}>
              <IconeM nome="desfazer" />
            </button>
            <button type="button" className="mp-tool" aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)" disabled={!hist.podeRefazer} onClick={hist.refazer}>
              <IconeM nome="refazer" />
            </button>
            <span className="mp-zoom-sep" aria-hidden="true" />
            <button type="button" className="mp-tool" aria-label="Diminuir zoom" onClick={() => zoomEm(0.8)}>
              <IconeM nome="menos" />
            </button>
            <span className="mp-zoom-pct" aria-live="polite">
              {Math.round(k * 100)}%
            </span>
            <button type="button" className="mp-tool" aria-label="Aumentar zoom" onClick={() => zoomEm(1.25)}>
              <IconeM nome="mais" />
            </button>
            <button type="button" className="mp-tool" aria-label="Ajustar à tela (0)" title="Ajustar à tela (0)" onClick={ajustar}>
              <IconeM nome="ajustar" />
            </button>
          </div>

          {popupInfo && (
            <PopupLigacao
              dir={dir}
              ligacao={popupInfo.l}
              x={popupInfo.x}
              y={popupInfo.y}
              onFechar={() => setPopup(null)}
              onAbrirFicha={(id) => void flush().then(() => go('universo', { ficha: id }))}
              onAbrirCartao={(id) => void flush().then(() => go('enredo', { cartao: id }))}
            />
          )}

          {dialogo && (
            <DialogoLigar
              dir={dir}
              nomeItem={nomeItem(doc, dialogo)}
              atual={doc.ligacoes.find((l) => l.item === dialogo.id)}
              onLigar={(alvo) => ligarItem(dialogo, alvo)}
              onRemover={() => desligarItem(dialogo)}
              onFechar={() => setDialogo(null)}
            />
          )}
        </div>
      </div>

      <PainelLateral
        dir={dir}
        doc={doc}
        hist={hist}
        passo={passo}
        sel={sel}
        focarNome={focarNome}
        alvos={alvos}
        onSelecionar={(r) => {
          setSel(r)
          setPopup(null)
        }}
        onVerLigacao={(id) => {
          const r = acharPorId(doc, id)
          if (r) {
            setSel(r)
            setPopup({ item: id })
          }
        }}
        onLigar={(r) => setDialogo(r)}
        onExcluir={excluirSel}
        onDuplicar={duplicarSel}
        flush={flush}
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// barra de opções da ferramenta
// ---------------------------------------------------------------------------

function OpcoesFerramenta(o: {
  ferramenta: Ferramenta
  estilo: MapaDoc['estilo']
  raio: number
  setRaio: (v: number) => void
  escala: number
  setEscala: (v: number) => void
  modoTerra: ModoTerra
  setModoTerra: (v: ModoTerra) => void
  modoAgua: ModoAgua
  setModoAgua: (v: ModoAgua) => void
  tipoMontanha: TipoMontanha
  setTipoMontanha: (v: TipoMontanha) => void
  tipoFloresta: TipoFloresta
  setTipoFloresta: (v: TipoFloresta) => void
  tipoCidade: 'cidade' | 'capital'
  setTipoCidade: (v: 'cidade' | 'capital') => void
  carimbo: SimboloTipo
  setCarimbo: (v: SimboloTipo) => void
  larguraRio: number
  setLarguraRio: (v: number) => void
  tipoRota: 'trilha' | 'mar'
  setTipoRota: (v: 'trilha' | 'mar') => void
  estiloRotulo: RotuloEstilo
  setEstiloRotulo: (v: RotuloEstilo) => void
}): ReactElement | null {
  const tam = <Faixa rotulo="Tamanho" valor={o.raio} min={6} max={220} onMuda={o.setRaio} />
  const esc = <Faixa rotulo="Escala" valor={o.escala} min={0.4} max={3} passo={0.05} fmt={(v) => `${v.toFixed(2).replace('.', ',')}×`} onMuda={o.setEscala} />
  switch (o.ferramenta) {
    case 'terra':
      return (
        <>
          <Segmentos rotulo="Modo do pincel" valor={o.modoTerra} onMuda={o.setModoTerra} opcoes={[{ v: 'pintar', nome: 'Pintar' }, { v: 'apagar', nome: 'Apagar' }]} />
          {tam}
        </>
      )
    case 'agua':
      return (
        <>
          <Segmentos
            rotulo="Tipo de água"
            valor={o.modoAgua}
            onMuda={o.setModoAgua}
            opcoes={[
              { v: 'lago', nome: 'Lago' },
              { v: 'mar', nome: 'Mar' },
              { v: 'secar', nome: 'Secar lago' }
            ]}
          />
          {tam}
        </>
      )
    case 'montanha':
      return (
        <>
          <Segmentos
            rotulo="Tipo de relevo"
            valor={o.tipoMontanha}
            onMuda={o.setTipoMontanha}
            opcoes={[
              { v: 'montanha', nome: 'Montanha' },
              { v: 'pico', nome: 'Pico' },
              { v: 'colina', nome: 'Colina' },
              { v: 'vulcao', nome: 'Vulcão' }
            ]}
          />
          {esc}
        </>
      )
    case 'floresta':
      return (
        <>
          <Escolha
            rotulo="Vegetação"
            valor={o.tipoFloresta}
            onMuda={o.setTipoFloresta}
            opcoes={[
              { v: 'mista', nome: 'Mista' },
              { v: 'arvore', nome: 'Árvores' },
              { v: 'pinheiro', nome: 'Pinheiros' },
              { v: 'palmeira', nome: 'Palmeiras' },
              { v: 'arbusto', nome: 'Arbustos' },
              { v: 'pantano', nome: 'Pântano' }
            ]}
          />
          {tam}
          {esc}
        </>
      )
    case 'cidade':
      return (
        <>
          <Segmentos rotulo="Porte" valor={o.tipoCidade} onMuda={o.setTipoCidade} opcoes={[{ v: 'cidade', nome: 'Cidade' }, { v: 'capital', nome: 'Capital' }]} />
          {esc}
        </>
      )
    case 'carimbo':
      return (
        <>
          <div className="mp-biblioteca" role="radiogroup" aria-label="Biblioteca de símbolos">
            {TIPOS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={o.carimbo === t} title={SIMBOLOS[t].nome} aria-label={SIMBOLOS[t].nome} onClick={() => o.setCarimbo(t)}>
                <SimboloMini tipo={t} estilo={o.estilo} size={26} />
              </button>
            ))}
          </div>
          {esc}
        </>
      )
    case 'vila':
    case 'castelo':
    case 'ruina':
    case 'torre':
    case 'porto':
    case 'navio':
    case 'monstro':
      return esc
    case 'rio':
      return <Faixa rotulo="Largura na foz" valor={o.larguraRio} min={2} max={40} onMuda={o.setLarguraRio} />
    case 'rota':
      return <Segmentos rotulo="Tipo de rota" valor={o.tipoRota} onMuda={o.setTipoRota} opcoes={[{ v: 'trilha', nome: 'Por terra' }, { v: 'mar', nome: 'Marítima' }]} />
    case 'texto':
      return (
        <Segmentos
          rotulo="Estilo do rótulo"
          valor={o.estiloRotulo}
          onMuda={o.setEstiloRotulo}
          opcoes={[
            { v: 'mar', nome: 'Mar' },
            { v: 'regiao', nome: 'Região' },
            { v: 'cidade', nome: 'Cidade' }
          ]}
        />
      )
    case 'borracha':
      return tam
    default:
      return null
  }
}
