import { ATALHOS, novaFala } from './escrita'
import type { Tela } from './ChapterEditor'
import { useEffect, useReducer, useRef, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/react'
import { inserirCena, inserirFigura, inserirQuebraPagina, marcasKey } from './extensions'
import { fileToDataUrl, folio } from '../../api'
import { Ico } from './icones'

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

  const inserirNota = (): void => {
    if (!e) return
    e.chain().focus().insertContent({ type: 'nota', attrs: { texto: '' } }).run()
    const pos = e.state.selection.from - 1
    e.view.dom.dispatchEvent(new CustomEvent('folio:nota', { detail: pos }))
  }

  return (
    <div className="ms-toolbar-wrap">
      <div className="ms-toolbar" role="toolbar" aria-label="Formatação e visualização">
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
        <span className="ms-sep" />
        <button
          type="button"
          className="ms-chip ms-i"
          aria-label="Itálico (Ctrl+I)"
          aria-pressed={!!e?.isActive('italic')}
          disabled={!e}
          onClick={() => e?.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          className="ms-chip ms-b"
          aria-label="Negrito (Ctrl+B)"
          aria-pressed={!!e?.isActive('bold')}
          disabled={!e}
          onClick={() => e?.chain().focus().toggleBold().run()}
        >
          N
        </button>
        <button
          type="button"
          className="ms-chip"
          aria-label="Inserir quebra de cena"
          title="Quebra de cena (Ctrl+Shift+Enter, ou digite *** e espaço)"
          disabled={!e}
          onClick={() => e && inserirCena(e)}
        >
          ⁂
        </button>
        <button
          type="button"
          className="ms-chip"
          aria-label="Inserir quebra de página"
          title="Quebra de página: o texto seguinte começa numa página nova no PDF, no EPUB e no DOCX"
          disabled={!e}
          onClick={() => e && inserirQuebraPagina(e)}
        >
          ⤓ Página
        </button>
        <button
          type="button"
          className="ms-chip"
          disabled={!e || !dirLivro}
          title="Imagem com legenda (PNG ou JPEG; para impressão, 300 dpi na largura do texto)"
          onClick={() => arquivo.current?.click()}
        >
          ▣ Imagem
        </button>
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
        {imgErro && (
          <span className="err" role="alert" style={{ margin: 0, fontSize: 12 }}>
            {imgErro}
          </span>
        )}
        <button
          type="button"
          className="ms-chip"
          disabled={!e}
          title="Nova fala com travessão (Ctrl+Enter). Ou digite - e espaço no início do parágrafo."
          onClick={() => e && novaFala(e)}
        >
          — Fala
        </button>
        <button
          type="button"
          className="ms-chip"
          aria-pressed={!!e?.isActive('blockquote')}
          disabled={!e}
          title="Citação: bloco recuado para cartas, epígrafes, trechos lidos (Ctrl+Shift+B)"
          onClick={() => e?.chain().focus().toggleBlockquote().run()}
        >
          “ Citação
        </button>
        <details className="ms-atalhos">
          <summary className="ms-chip" title="Atalhos de escrita">Atalhos</summary>
          <div className="ms-atalhos-pop" role="dialog" aria-label="Atalhos de escrita">
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
        <details className="ms-atalhos ms-tela">
          <summary className="ms-chip" title="Opções de tela (só neste navegador)">Tela</summary>
          <div className="ms-atalhos-pop" role="group" aria-label="Opções de tela">
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
        <button type="button" className="ms-chip" disabled={!e} onClick={inserirNota} title="Nota de rodapé">
          <Ico n="nota" size={14} />
          Nota
        </button>
        {p.onVersoes && (
          <button type="button" className="ms-chip" onClick={p.onVersoes} title="Versões guardadas deste capítulo: comparar e restaurar">
            <Ico n="versoes" size={14} />
            Versões
          </button>
        )}
        <span className="ms-sep" />
        <button type="button" className="ms-chip" aria-pressed={p.buscaAberta} onClick={() => p.onBusca(!p.buscaAberta)} title="Buscar (Ctrl+F)">
          <Ico n="busca" size={14} />
          Buscar
        </button>
        <button
          type="button"
          className="ms-chip"
          aria-pressed={p.repeticoes}
          onClick={() => p.onRepeticoes(!p.repeticoes)}
          title="Destacar as palavras mais repetidas do capítulo"
        >
          <Ico n="eco" size={14} />
          Repetições
        </button>
        {p.foco ? (
          <>
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
            <select
              id="ms-foco-min"
              className="ms-mini-select"
              value={p.focoMin}
              onChange={(ev) => p.onFocoMin(Number(ev.target.value))}
            >
              {[15, 25, 45].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <button type="button" className="ms-chip" onClick={() => p.onFoco(false)}>
              <Ico n="sair" size={14} />
              Sair do foco
            </button>
          </>
        ) : (
          <button type="button" className="ms-chip ms-foco" onClick={() => p.onFoco(true)} title="Tela cheia sem painéis, com ampulheta">
            <Ico n="ampulheta" size={14} />
            Foco · {p.focoMin}:00
          </button>
        )}
      </div>
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
