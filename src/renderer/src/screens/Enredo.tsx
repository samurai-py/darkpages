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
import { apagarImagemOrfa, esquecerImagemCartao } from '../features/enredo/imagem'
import { Memoria } from '../features/enredo/Memoria'
import { Leitor } from '../features/enredo/Leitor'
import { FILTROS_ESTADO, passaFiltro, type FiltroEstado } from '../features/enredo/Selo'
import './enredo.css'

/**
 * "Memória" fica no Enredo: é a história capítulo a capítulo do ponto de vista
 * da IA (o que ela lembra de cada um), ao lado do roteiro e do mural, que são
 * a mesma história do ponto de vista do plano do autor.
 */
type Visao = 'quadro' | 'roteiro' | 'mural' | 'leitor' | 'memoria'

const VISOES: Array<{ id: Visao; nome: string }> = [
  { id: 'quadro', nome: 'Quadro' },
  { id: 'roteiro', nome: 'Roteiro' },
  { id: 'mural', nome: 'Mural' },
  { id: 'leitor', nome: 'Leitor' },
  { id: 'memoria', nome: 'Memória' }
]

const ICONE_VISAO = { quadro: 'ligar', roteiro: 'cena', mural: 'capitulo', leitor: 'leitor', memoria: 'memoria' } as const

const ESPERA_SALVAR = 700

export function Enredo({ project, go, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const chapters = project.chapters
  const [board, setBoard] = useState<EnredoBoard | null>(null)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [erro, setErro] = useState('')
  const [visao, setVisao] = useState<Visao>(() => (VISOES.some((v) => v.id === params['visao']) ? (params['visao'] as Visao) : 'quadro'))
  const [sinopses, setSinopses] = useState<Record<string, string>>({})
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('vivos')
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

  // sinopse de cada capítulo (cabeçalhos do Mural e do Roteiro)
  useEffect(() => {
    let vivo = true
    call<Record<string, string>>('manuscrito.sinopses', dir)
      .then((s) => vivo && setSinopses(s ?? {}))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [dir, chapters])

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
  // quadro mais recente para as ações assíncronas (envio de imagem termina depois)
  const boardRef = useRef(b)
  boardRef.current = b
  // filtro de origem/estado: as visões só mostram; as mudanças vão para o quadro inteiro
  const bVisivel = useMemo((): EnredoBoard => {
    if (filtroEstado === 'todos') return b
    const cartoes = b.cartoes.filter((c) => passaFiltro(c, filtroEstado))
    const ids = new Set(cartoes.map((c) => c.id))
    return { cartoes, ligacoes: b.ligacoes.filter((l) => ids.has(l.de) && ids.has(l.para)) }
  }, [b, filtroEstado])
  const nProvisorios = b.cartoes.filter((c) => c.estado === 'provisorio').length

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

  /** Troca ou tira a imagem do cartão; a antiga sai de assets/ se nenhum cartão a usa. */
  const trocarImagem = (id: string, nome: string | undefined): void => {
    const antiga = boardRef.current.cartoes.find((c) => c.id === id)?.imagem
    if (antiga === nome) return
    mudar((bb) => ({
      ...bb,
      cartoes: bb.cartoes.map((c) => {
        if (c.id !== id) return c
        if (nome) return { ...c, imagem: nome }
        const { imagem: _i, ...resto } = c
        return resto
      })
    }))
    void apagarImagemOrfa(dir, boardRef.current, antiga, id)
  }

  const excluirCartao = (id: string): void => {
    const c = boardRef.current.cartoes.find((x) => x.id === id)
    mudar((bb) => removerCartoes(bb, [id]))
    setSel(null)
    // o arquivo sai de assets/ ao salvar (o servidor confere se ficou sem uso)
    if (c?.imagem && !boardRef.current.cartoes.some((x) => x.id !== id && x.imagem === c.imagem)) esquecerImagemCartao(dir, c.imagem)
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
        dir={dir}
        board={b}
        cartaoId={sel.tipo === 'cartao' ? sel.id : undefined}
        ligacaoId={sel.tipo === 'ligacao' ? sel.id : undefined}
        fichas={fichas}
        chapters={chapters}
        focar={focar === sel.id}
        onCartao={(c) => mudar((bb) => ({ ...bb, cartoes: bb.cartoes.map((x) => (x.id === c.id ? c : x)) }))}
        onMoverPara={(id, cap) => moverRoteiro(id, cap, null)}
        onLigacao={(l) => mudar((bb) => ({ ...bb, ligacoes: bb.ligacoes.map((x) => (x.id === l.id ? l : x)) }))}
        onImagem={trocarImagem}
        onExcluirCartao={excluirCartao}
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
              <Mini name={ICONE_VISAO[v.id]} />
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
        {visao !== 'memoria' && visao !== 'leitor' && (
          <label className="en-festado">
            <Mini name="provisorio" size={14} />
            <span className="en-sr">Mostrar cartões</span>
            <select className="select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}>
              {FILTROS_ESTADO.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                  {f.id === 'provisorios' && nProvisorios ? ` (${nProvisorios})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {visao !== 'memoria' && visao !== 'leitor' && nProvisorios > 0 && filtroEstado !== 'provisorios' && (
          <button type="button" className="pill en-pprov" onClick={() => setFiltroEstado('provisorios')}>
            <b>{nProvisorios}</b> {nProvisorios === 1 ? 'ideia provisória da IA' : 'ideias provisórias'}
          </button>
        )}
        <span className="en-status label" role="status">
          {status}
        </span>
      </div>
      {erro && <p className="err en-err">{erro}</p>}

      <div className="en-body">
        <div className="en-view" id="en-visao" role="tabpanel" aria-labelledby={`en-tab-${visao}`} aria-busy={!board}>
          {!board && visao !== 'memoria' && <div className="empty">Carregando enredo…</div>}
          {visao === 'memoria' && <Memoria dir={dir} chapters={chapters} onAbrirCapitulo={abrirCapitulo} />}
          {board && visao === 'quadro' && (
            <Quadro
              dir={dir}
              board={bVisivel}
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
              dir={dir}
              board={bVisivel}
              chapters={chapters}
              fichas={fichasMap}
              selId={selId}
              onSel={(id) => selecionarCartao(id)}
              onMover={moverRoteiro}
              onCriarCena={criarCena}
              onAbrirCapitulo={abrirCapitulo}
              sinopses={sinopses}
            />
          )}
          {board && visao === 'leitor' && (
            <Leitor board={b} chapters={chapters} fichas={fichasMap} selId={selId} onSel={(id) => selecionarCartao(id)} onAbrirCapitulo={abrirCapitulo} />
          )}
          {board && visao === 'mural' && (
            <Mural
              dir={dir}
              board={bVisivel}
              chapters={chapters}
              fichas={fichasMap}
              retratos={retratos}
              selId={selId}
              onSel={(id) => selecionarCartao(id)}
              onMover={moverRoteiro}
              onCriarCena={criarCena}
              onAbrirCapitulo={abrirCapitulo}
              sinopses={sinopses}
            />
          )}
        </div>
        {visao !== 'memoria' && painel}
      </div>
    </div>
  )
}
