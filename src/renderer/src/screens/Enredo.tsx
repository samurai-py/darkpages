import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { call, folio } from '../api'
import type { Cartao, CartaoTipo, EnredoBoard, Ficha, Ligacao } from '../../../shared/models'
import { COLECAO_UNIVERSO, normalizarFicha } from '../features/universo/fichas'
import { useRetratos } from '../features/universo/Retrato'
import { Mini } from '../features/universo/icons'
import { BOARD_VAZIO, doCapitulo, mover, novoCartao, novoId, proximaOrdem, removerCartoes } from '../features/enredo/board'
import { Quadro, type Selecao } from '../features/enredo/Quadro'
import { Roteiro } from '../features/enredo/Roteiro'
import { Mural } from '../features/enredo/Mural'
import { CartaoPanel } from '../features/enredo/CartaoPanel'
import './enredo.css'

type Visao = 'quadro' | 'roteiro' | 'mural'

const VISOES: Array<{ id: Visao; nome: string }> = [
  { id: 'quadro', nome: 'Quadro' },
  { id: 'roteiro', nome: 'Roteiro' },
  { id: 'mural', nome: 'Mural' }
]

const ESPERA_SALVAR = 700

export function Enredo({ project, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const chapters = project.chapters
  const [board, setBoard] = useState<EnredoBoard | null>(null)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [erro, setErro] = useState('')
  const [visao, setVisao] = useState<Visao>('quadro')
  const [sel, setSel] = useState<Selecao>(null)
  const [focar, setFocar] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  // ---------- carga ----------
  useEffect(() => {
    let vivo = true
    Promise.all([
      call<EnredoBoard>('enredo.board', dir),
      folio.docs.list<Partial<Ficha>>(dir, COLECAO_UNIVERSO).catch(() => [])
    ])
      .then(([b, fs]) => {
        if (!vivo) return
        const carregado = b ?? BOARD_VAZIO
        setBoard(carregado)
        setFichas(fs.map(normalizarFicha))
        // chegou de outra tela (ex.: Mapas) pedindo um cartão específico
        const alvo = params['cartao']
        if (alvo && carregado.cartoes.some((c) => c.id === alvo)) setSel({ tipo: 'cartao', id: alvo })
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [dir])

  // ---------- autosave (debounce, uma gravação por vez) ----------
  const ultimo = useRef<EnredoBoard | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cadeia = useRef<Promise<void>>(Promise.resolve())
  const sujo = useRef(false)

  const gravar = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    cadeia.current = cadeia.current.then(async () => {
      if (!sujo.current || !ultimo.current) return
      sujo.current = false
      const b = ultimo.current
      setStatus('Salvando…')
      try {
        await call<EnredoBoard>('enredo.salvar', dir, b)
        setStatus(sujo.current ? 'Alterações pendentes…' : 'Salvo')
      } catch (e) {
        sujo.current = true
        setStatus(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
    return cadeia.current
  }, [dir])

  useEffect(() => () => void gravar(), [gravar])

  const mudar = useCallback(
    (fn: (b: EnredoBoard) => EnredoBoard): void => {
      setBoard((atual) => {
        if (!atual) return atual
        const novo = fn(atual)
        ultimo.current = novo
        sujo.current = true
        return novo
      })
      setStatus('Alterações pendentes…')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void gravar(), ESPERA_SALVAR)
    },
    [gravar]
  )

  const sair = async (fn: () => void): Promise<void> => {
    await gravar()
    fn()
  }

  // ---------- derivados ----------
  const fichasMap = useMemo(() => new Map(fichas.map((f) => [f.id, f])), [fichas])
  const retratos = useRetratos(dir, fichas)
  const b = board ?? BOARD_VAZIO

  // ---------- ações ----------
  const selecionarCartao = (id: string, novo = false): void => {
    setSel({ tipo: 'cartao', id })
    setFocar(novo ? id : null)
  }

  const criarNoQuadro = (tipo: CartaoTipo, x: number, y: number): void => {
    const c = novoCartao(tipo, x, y)
    mudar((bb) => ({ ...bb, cartoes: [...bb.cartoes, c] }))
    selecionarCartao(c.id, true)
  }

  const criarCena = (capitulo: string): void => {
    const ordem = proximaOrdem(b.cartoes, capitulo)
    const col = capitulo ? chapters.findIndex((ch) => ch.file === capitulo) + 1 : 0
    const extra: Partial<Cartao> = { ordem }
    if (capitulo) extra.capitulo = capitulo
    const c = novoCartao('cena', col * 280, doCapitulo(b.cartoes, capitulo).length * 170, extra)
    mudar((bb) => ({ ...bb, cartoes: [...bb.cartoes, c] }))
    selecionarCartao(c.id, true)
  }

  const conectar = (de: string, para: string): void => {
    const l: Ligacao = { id: novoId('lig'), de, para, rotulo: '', tipo: 'relacao' }
    mudar((bb) => ({ ...bb, ligacoes: [...bb.ligacoes, l] }))
    setSel({ tipo: 'ligacao', id: l.id })
  }

  const moverPosicoes = (pos: Array<{ id: string; x: number; y: number }>): void => {
    const m = new Map(pos.map((p) => [p.id, p]))
    mudar((bb) => ({
      ...bb,
      cartoes: bb.cartoes.map((c) => {
        const p = m.get(c.id)
        return p && (p.x !== c.x || p.y !== c.y) ? { ...c, x: p.x, y: p.y } : c
      })
    }))
  }

  const moverRoteiro = (id: string, capitulo: string, antesDe: string | null): void =>
    mudar((bb) => ({ ...bb, cartoes: mover(bb.cartoes, id, capitulo, antesDe) }))

  const removerLigacoes = (ids: string[]): void => {
    const fora = new Set(ids)
    mudar((bb) => ({ ...bb, ligacoes: bb.ligacoes.filter((l) => !fora.has(l.id)) }))
    if (sel?.tipo === 'ligacao' && fora.has(sel.id)) setSel(null)
  }

  const abrirCapitulo = (chapter: string): void => void sair(() => go('manuscrito', { chapter }))
  const abrirFicha = (ficha: string): void => void sair(() => go('universo', { ficha }))

  if (erro && !board) {
    return (
      <div className="screen">
        <div className="empty">
          <span className="disp">Enredo</span>
          <p className="err">{erro}</p>
        </div>
      </div>
    )
  }

  const selId = sel?.tipo === 'cartao' ? sel.id : null
  const painel =
    sel && sel.tipo !== 'multi' ? (
      <CartaoPanel
        board={b}
        cartaoId={sel.tipo === 'cartao' ? sel.id : undefined}
        ligacaoId={sel.tipo === 'ligacao' ? sel.id : undefined}
        fichas={fichas}
        chapters={chapters}
        focar={focar === sel.id}
        onCartao={(c) => mudar((bb) => ({ ...bb, cartoes: bb.cartoes.map((x) => (x.id === c.id ? c : x)) }))}
        onMoverPara={(id, cap) => moverRoteiro(id, cap, null)}
        onLigacao={(l) => mudar((bb) => ({ ...bb, ligacoes: bb.ligacoes.map((x) => (x.id === l.id ? l : x)) }))}
        onExcluirCartao={(id) => {
          mudar((bb) => removerCartoes(bb, [id]))
          setSel(null)
        }}
        onExcluirLigacao={(id) => removerLigacoes([id])}
        onSelCartao={(id) => selecionarCartao(id)}
        onSelLigacao={(id) => setSel({ tipo: 'ligacao', id })}
        onAbrirCapitulo={abrirCapitulo}
        onAbrirFicha={abrirFicha}
        onFechar={() => setSel(null)}
      />
    ) : null

  return (
    <div className="screen en">
      <div className="en-top">
        <h1 className="disp en-h1">Enredo</h1>
        <div className="en-tabs" role="tablist" aria-label="Visões do enredo">
          {VISOES.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`en-tab-${v.id}`}
              aria-controls="en-visao"
              aria-selected={visao === v.id}
              className="en-tab"
              onClick={() => setVisao(v.id)}
            >
              <Mini name={v.id === 'quadro' ? 'ligar' : v.id === 'roteiro' ? 'cena' : 'capitulo'} />
              {v.nome}
            </button>
          ))}
        </div>
        <span className="pill">
          <b>{b.cartoes.length}</b> {b.cartoes.length === 1 ? 'cartão' : 'cartões'}
        </span>
        <span className="pill">
          <b>{b.ligacoes.length}</b> {b.ligacoes.length === 1 ? 'ligação' : 'ligações'}
        </span>
        <span className="en-status label" role="status">
          {status}
        </span>
      </div>
      {erro && <p className="err en-err">{erro}</p>}

      <div className="en-body">
        <div className="en-view" id="en-visao" role="tabpanel" aria-labelledby={`en-tab-${visao}`} aria-busy={!board}>
          {!board && <div className="empty">Carregando enredo…</div>}
          {board && visao === 'quadro' && (
            <Quadro
              board={b}
              fichas={fichasMap}
              retratos={retratos}
              chapters={chapters}
              sel={sel}
              onSel={(s) => {
                setFocar(null)
                setSel(s)
              }}
              onMover={moverPosicoes}
              onConectar={conectar}
              onRemoverLigacoes={removerLigacoes}
              onCriar={criarNoQuadro}
            />
          )}
          {board && visao === 'roteiro' && (
            <Roteiro
              board={b}
              chapters={chapters}
              fichas={fichasMap}
              selId={selId}
              onSel={(id) => selecionarCartao(id)}
              onMover={moverRoteiro}
              onCriarCena={criarCena}
              onAbrirCapitulo={abrirCapitulo}
            />
          )}
          {board && visao === 'mural' && (
            <Mural
              board={b}
              chapters={chapters}
              fichas={fichasMap}
              retratos={retratos}
              selId={selId}
              onSel={(id) => selecionarCartao(id)}
              onMover={moverRoteiro}
              onCriarCena={criarCena}
              onAbrirCapitulo={abrirCapitulo}
            />
          )}
        </div>
        {painel}
      </div>
    </div>
  )
}
