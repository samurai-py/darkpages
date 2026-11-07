import { ATALHOS, novaFala } from './escrita'
import type { Tela } from './ChapterEditor'
import { useEffect, useReducer, useRef, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/react'
import { inserirCena, inserirFigura, inserirQuebraPagina, marcasKey } from './extensions'
import { fileToDataUrl, folio } from '../../api'
import { Ico } from './icones'
import type { EscopoCorrecao } from './corrigir'

export interface Visual {
  corpoPx: number
  linha: number
}

interface Props {
  editor: Editor | null
  visual: Visual
  onVisual: (v: Visual) => void
  tela: Tela
  onTela: (t: Partial<Tela>) => void
  repeticoes: boolean
  onRepeticoes: (v: boolean) => void
  buscaAberta: boolean
  onBusca: (aberta: boolean) => void
  foco: boolean
  onFoco: (v: boolean) => void
  focoMin: number
  onFocoMin: (m: number) => void
  /** segundos restantes da ampulheta (null = parada) */
  restante: number | null
  onAmpulheta: () => void
  /** abre o painel de Versões do capítulo */
  onVersoes?: () => void
  /** abre a prévia do Corrigir no escopo escolhido */
  onCorrigir?: (escopo: EscopoCorrecao) => void
}

/** Re-renderiza quando o editor muda (seleção, marcas, decorações). */
function useTick(editor: Editor | null): void {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', force)
    return () => {
      editor.off('transaction', force)
    }
  }, [editor])
}

export function mmss(s: number): string {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function Toolbar(p: Props): ReactElement {
  useTick(p.editor)
  const e = p.editor
  const passo = (campo: keyof Visual, delta: number): void => {
    const v = { ...p.visual }
    if (campo === 'corpoPx') v.corpoPx = Math.min(30, Math.max(13, v.corpoPx + delta))
    else v.linha = Math.round(Math.min(2.4, Math.max(1.1, v.linha + delta)) * 100) / 100
    p.onVisual(v)
  }

  const arquivo = useRef<HTMLInputElement>(null)
  const [imgErro, setImgErro] = useState<string | null>(null)
  const dirLivro = (e?.storage as { figura?: { dir?: string } } | undefined)?.figura?.dir ?? ''

  /** Envia a imagem para <livro>/assets/ e insere a figura no cursor. */
  const enviarImagem = async (file: File): Promise<void> => {
    if (!e || !dirLivro) return
    setImgErro(null)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null
    if (!ext) {
      setImgErro('Use PNG ou JPEG.')
      return
    }
    const base =
      file.name
        .replace(/\.[^.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'imagem'
    const nome = `figura-${base}-${Date.now().toString(36)}.${ext}`
    try {
      await folio.assets.put(dirLivro, nome, await fileToDataUrl(file))
      inserirFigura(e, `assets/${nome}`)
    } catch (err) {
      setImgErro(err instanceof Error ? err.message : String(err))
    }
  }

  const inserirRef = useRef<HTMLDetailsElement>(null)
  /** Executa a ação do menu Inserir e fecha o menu. */
  const fecharInserir = (fn: () => void): void => {
    inserirRef.current?.removeAttribute('open')
    fn()
  }

  const corrigirRef = useRef<HTMLDetailsElement>(null)
  const corrigir = (escopo: EscopoCorrecao): void => {
    corrigirRef.current?.removeAttribute('open')
    p.onCorrigir?.(escopo)
  }
  const temSelecao = !!e && !e.state.selection.empty

  const inserirNota = (): void => {
    if (!e) return
    e.chain().focus().insertContent({ type: 'nota', attrs: { texto: '' } }).run()
    const pos = e.state.selection.from - 1
    e.view.dom.dispatchEvent(new CustomEvent('folio:nota', { detail: pos }))
  }

  return (
    <div className="ms-toolbar-wrap">
      <div className="ms-toolbar" role="toolbar" aria-label="Escrever, revisar e ver">
        {/* ---- escrever ---- */}
        <div className="ms-tg" role="group" aria-label="Escrever">
          <button
            type="button"
            className="ms-chip ms-sq ms-i"
            aria-label="Itálico (Ctrl+I)"
            title="Itálico (Ctrl+I)"
            aria-pressed={!!e?.isActive('italic')}
            disabled={!e}
            onClick={() => e?.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            type="button"
            className="ms-chip ms-sq ms-b"
            aria-label="Negrito (Ctrl+B)"
            title="Negrito (Ctrl+B)"
            aria-pressed={!!e?.isActive('bold')}
            disabled={!e}
            onClick={() => e?.chain().focus().toggleBold().run()}
          >
            N
          </button>
          <button
            type="button"
            className="ms-chip ms-lbl2"
            disabled={!e}
            title="Nova fala com travessão (Ctrl+Enter). Ou digite - e espaço no início do parágrafo."
            onClick={() => e && novaFala(e)}
          >
            <Ico n="fala" size={14} />
            Fala
          </button>
          <button
            type="button"
            className="ms-chip ms-lbl2"
            aria-pressed={!!e?.isActive('blockquote')}
            disabled={!e}
            title="Citação: bloco recuado para cartas, epígrafes, trechos lidos (Ctrl+Shift+B)"
            onClick={() => e?.chain().focus().toggleBlockquote().run()}
          >
            <Ico n="citacao" size={14} />
            Citação
          </button>
          <details className="ms-atalhos ms-ins" ref={inserirRef}>
            <summary className="ms-chip ms-lbl1" title="Inserir no texto">
              <Ico n="inserir" size={14} />
              Inserir
              <Ico n="descer" size={12} />
            </summary>
            <div className="ms-atalhos-pop ms-ins-pop" role="menu" aria-label="Inserir no texto">
              <button type="button" role="menuitem" className="ms-mi" disabled={!e} onClick={() => fecharInserir(() => e && inserirCena(e))}>
                <Ico n="cena" size={15} />
                <span><b>Quebra de cena</b><small>⁂ · Ctrl+Shift+Enter ou *** e espaço</small></span>
              </button>
              <button type="button" role="menuitem" className="ms-mi" disabled={!e} onClick={() => fecharInserir(inserirNota)}>
                <Ico n="nota" size={15} />
                <span><b>Nota de rodapé</b><small>Sai no pé da página do PDF</small></span>
              </button>
              <button type="button" role="menuitem" className="ms-mi" disabled={!e} onClick={() => fecharInserir(() => e && inserirQuebraPagina(e))}>
                <Ico n="pagina" size={15} />
                <span><b>Quebra de página</b><small>O que vem depois começa numa página nova</small></span>
              </button>
              <button type="button" role="menuitem" className="ms-mi" disabled={!e || !dirLivro} onClick={() => fecharInserir(() => arquivo.current?.click())}>
                <Ico n="imagem" size={15} />
                <span><b>Imagem com legenda</b><small>PNG ou JPEG; 300 dpi para impressão</small></span>
              </button>
            </div>
          </details>
          <input
            ref={arquivo}
            type="file"
            accept="image/png,image/jpeg"
            className="ms-sr"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(ev) => {
              const f = ev.target.files?.[0]
              ev.target.value = ''
              if (f) void enviarImagem(f)
            }}
          />
        </div>

        <span className="ms-sep" />

        {/* ---- revisar ---- */}
        <div className="ms-tg" role="group" aria-label="Revisar">
          <button type="button" className="ms-chip ms-lbl2" aria-pressed={p.buscaAberta} onClick={() => p.onBusca(!p.buscaAberta)} title="Buscar (Ctrl+F)">
            <Ico n="busca" size={14} />
            Buscar
          </button>
          <button
            type="button"
            className="ms-chip ms-lbl2"
            aria-pressed={p.repeticoes}
            onClick={() => p.onRepeticoes(!p.repeticoes)}
            title="Destacar as palavras mais repetidas do capítulo"
          >
            <Ico n="eco" size={14} />
            Repetições
          </button>
          {p.onCorrigir && (
            <details className="ms-atalhos ms-ins ms-corr" ref={corrigirRef}>
              <summary className="ms-chip ms-lbl1" title="Corrigir tipografia, espaços, ortografia e gramática, com prévia (Ctrl+Alt+F)">
                <Ico n="corrigir" size={14} />
                Corrigir
                <Ico n="descer" size={12} />
              </summary>
              <div className="ms-atalhos-pop ms-ins-pop" role="menu" aria-label="Corrigir">
                <button type="button" role="menuitem" className="ms-mi" disabled={!temSelecao} onClick={() => corrigir('selecao')}>
                  <Ico n="selecao" size={15} />
                  <span><b>Seleção</b><small>{temSelecao ? 'Só o trecho selecionado · Ctrl+Alt+F' : 'Selecione um trecho primeiro'}</small></span>
                </button>
                <button type="button" role="menuitem" className="ms-mi" disabled={!e} onClick={() => corrigir('paragrafo')}>
                  <Ico n="paragrafo" size={15} />
                  <span><b>Parágrafo atual</b><small>Onde está o cursor · Ctrl+Alt+F sem seleção</small></span>
                </button>
                <button type="button" role="menuitem" className="ms-mi" disabled={!e} onClick={() => corrigir('capitulo')}>
                  <Ico n="pagina" size={15} />
                  <span><b>Capítulo inteiro</b><small>Guarda uma versão antes de aplicar</small></span>
                </button>
              </div>
            </details>
          )}
          {p.onVersoes && (
            <button type="button" className="ms-chip ms-lbl2" onClick={p.onVersoes} title="Versões guardadas deste capítulo: comparar e restaurar">
              <Ico n="versoes" size={14} />
              Versões
            </button>
          )}
        </div>

        <span className="ms-sep" />

        {/* ---- ver ---- */}
        <div className="ms-tg" role="group" aria-label="Ver">
          <details className="ms-atalhos ms-tela">
            <summary className="ms-chip ms-lbl1" title="Tamanho do texto e modos de tela (só neste navegador)">
              <Ico n="texto" size={15} />
              Tela
              <Ico n="descer" size={12} />
            </summary>
            <div className="ms-atalhos-pop" role="group" aria-label="Opções de tela">
              <div className="ms-tela-steps">
                <span className="ms-step" title="Corpo do texto na tela (px)">
                  <span className="ms-step-l">Corpo</span>
                  <button type="button" className="ms-ib" aria-label="Diminuir corpo" onClick={() => passo('corpoPx', -1)}>
                    <Ico n="menos" size={13} />
                  </button>
                  <b aria-live="polite">{p.visual.corpoPx}</b>
                  <button type="button" className="ms-ib" aria-label="Aumentar corpo" onClick={() => passo('corpoPx', 1)}>
                    <Ico n="mais" size={13} />
                  </button>
                </span>
                <span className="ms-step" title="Entrelinha na tela">
                  <span className="ms-step-l">Linha</span>
                  <button type="button" className="ms-ib" aria-label="Diminuir entrelinha" onClick={() => passo('linha', -0.05)}>
                    <Ico n="menos" size={13} />
                  </button>
                  <b aria-live="polite">{p.visual.linha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  <button type="button" className="ms-ib" aria-label="Aumentar entrelinha" onClick={() => passo('linha', 0.05)}>
                    <Ico n="mais" size={13} />
                  </button>
                </span>
              </div>
              {(
                [
                  ['justificar', 'Justificar enquanto escrevo', 'Texto justificado e com hifenização'],
                  ['maquina', 'Máquina de escrever', 'A linha do cursor fica no meio da tela'],
                  ['focoParagrafo', 'Foco no parágrafo', 'Os outros parágrafos ficam esmaecidos']
                ] as Array<[keyof Tela, string, string]>
              ).map(([k, rot, dica]) => (
                <label key={k} className="ms-tela-op">
                  <input type="checkbox" checked={p.tela[k]} onChange={(ev) => p.onTela({ [k]: ev.target.checked })} />
                  <span>
                    <b>{rot}</b>
                    <small>{dica}</small>
                  </span>
                </label>
              ))}
            </div>
          </details>
          {p.foco ? (
            <span className="ms-foco-grp">
              <button
                type="button"
                className="ms-chip ms-foco on"
                onClick={p.onAmpulheta}
                aria-label={p.restante === null ? `Iniciar ampulheta de ${p.focoMin} minutos` : 'Parar ampulheta'}
              >
                <Ico n="ampulheta" size={14} />
                {p.restante === null ? `${p.focoMin}:00` : mmss(p.restante)}
              </button>
              <label className="ms-sr" htmlFor="ms-foco-min">
                Duração da ampulheta
              </label>
              <select id="ms-foco-min" className="ms-mini-select" value={p.focoMin} onChange={(ev) => p.onFocoMin(Number(ev.target.value))}>
                {[15, 25, 45].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <button type="button" className="ms-chip ms-sq" onClick={() => p.onFoco(false)} aria-label="Sair do foco" title="Sair do foco">
                <Ico n="sair" size={14} />
              </button>
            </span>
          ) : (
            <button type="button" className="ms-chip ms-foco ms-lbl1" onClick={() => p.onFoco(true)} title="Tela cheia sem painéis, com ampulheta de escrita">
              <Ico n="ampulheta" size={14} />
              Foco
            </button>
          )}
          <details className="ms-atalhos">
            <summary className="ms-chip ms-sq" title="Atalhos de escrita" aria-label="Atalhos de escrita">
              <Ico n="teclado" size={15} />
            </summary>
            <div className="ms-atalhos-pop ms-pop-dir" role="dialog" aria-label="Atalhos de escrita">
              <dl>
                {ATALHOS.map((a) => (
                  <div key={a.teclas}>
                    <dt>{a.teclas}</dt>
                    <dd>{a.acao}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        </div>
      </div>
      {imgErro && (
        <span className="err" role="alert" style={{ margin: 0, fontSize: 12 }}>
          {imgErro}
        </span>
      )}
      {p.buscaAberta && <Busca editor={e} onFechar={() => p.onBusca(false)} />}
    </div>
  )
}

function Busca({ editor, onFechar }: { editor: Editor | null; onFechar: () => void }): ReactElement {
  const [termo, setTermo] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useTick(editor)
  const st = editor ? marcasKey.getState(editor.state) : undefined
  const hits = st?.hits ?? []
  const atual = st?.atual ?? 0

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const enviar = (meta: { busca?: string; atual?: number }): void => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(marcasKey, meta))
  }

  // mostra o achado atual sem tirar o foco do campo
  useEffect(() => {
    if (!editor || !hits[atual]) return
    const { node } = editor.view.domAtPos(hits[atual]!.from)
    const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, hits.length, termo])

  useEffect(
    () => () => {
      if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(marcasKey, { busca: '', atual: 0 }))
    },
    [editor]
  )

  const ir = (d: number): void => {
    if (!hits.length) return
    enviar({ atual: (atual + d + hits.length) % hits.length })
  }

  const fechar = (): void => {
    const h = hits[atual]
    if (editor && h) editor.chain().focus().setTextSelection({ from: h.from, to: h.to }).run()
    onFechar()
  }

  return (
    <div className="ms-busca" role="search">
      <Ico n="busca" size={14} />
      <label className="ms-sr" htmlFor="ms-busca-in">
        Buscar no capítulo
      </label>
      <input
        id="ms-busca-in"
        ref={input}
        value={termo}
        placeholder="Buscar no capítulo…"
        onChange={(ev) => {
          setTermo(ev.target.value)
          enviar({ busca: ev.target.value, atual: 0 })
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault()
            ir(ev.shiftKey ? -1 : 1)
          }
          if (ev.key === 'Escape') {
            ev.preventDefault()
            fechar()
          }
        }}
      />
      <span className="ms-busca-n" aria-live="polite">
        {termo.trim() ? (hits.length ? `${atual + 1} de ${hits.length}` : 'nada encontrado') : ''}
      </span>
      <button type="button" className="ms-ib" aria-label="Anterior (Shift+Enter)" onClick={() => ir(-1)} disabled={!hits.length}>
        <Ico n="subir" size={14} />
      </button>
      <button type="button" className="ms-ib" aria-label="Próximo (Enter)" onClick={() => ir(1)} disabled={!hits.length}>
        <Ico n="descer" size={14} />
      </button>
      <button type="button" className="ms-ib" aria-label="Fechar busca (Esc)" onClick={fechar}>
        <Ico n="fechar" size={14} />
      </button>
    </div>
  )
}
