import { useEffect, useRef, useState, type ReactElement } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EscritaLiteraria, corrigirMarkdownLegado, limparHtmlColado, limparTextoColado } from './escrita'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import type { EditorView } from '@tiptap/pm/view'
import { call } from '../../api'
import type { SinonimosResult } from '../../../../shared/models'
import { BlocoAtual, Cena, Figura, Marcas, Nota, QuebraPagina, marcasKey, type Furo } from './extensions'
import { analisarRepeticoes, contarRadical, fmt, manterCaixa, type Repeticao } from './texto'
import { Ico } from './icones'
import { RascunhoIa, docSemRascunho, markdownSemRascunho, temRascunho } from './rascunho'

/** Rascunho da IA mostrado no editor (ver rascunho.ts). */
/** Preferências de tela (por usuário, fora do arquivo do livro). */
export interface Tela {
  justificar: boolean
  maquina: boolean
  focoParagrafo: boolean
}

export interface RascunhoUI {
  id: string
  carregando: boolean
  erro: string | null
}

interface Props {
  /** pasta do livro (mostra e envia as imagens do texto) */
  dir?: string
  /** Markdown inicial do capítulo (o editor é recriado a cada capítulo via `key`) */
  inicial: string
  rotulo: string
  titulo: string
  onTitulo: (t: string) => void
  /** markdown e texto SEM o rascunho pendente da IA; `rascunho` diz se ainda há rascunho no editor */
  onChange: (markdown: string, texto: string, rascunho: boolean) => void
  onEditor: (e: Editor | null) => void
  repeticoes: boolean
  furos: Furo[]
  corpoPx: number
  linha: number
  tela: Tela
  rascunho: RascunhoUI | null
  onAceitar: () => void
  onRefazer: () => void
  onDescartar: () => void
}

interface PopRep {
  x: number
  y: number
  from: number
  to: number
  palavra: string
  frase: string
  info: Repeticao
  sinonimos: SinonimosResult | null
  carregando: boolean
  erro: string | null
}

interface PopNota {
  x: number
  y: number
  pos: number
  texto: string
}

/** Frase em volta de uma posição do texto (para a IA entender o sentido). */
function fraseEm(texto: string, i: number): string {
  const ini = Math.max(texto.lastIndexOf('.', i - 1), texto.lastIndexOf('!', i - 1), texto.lastIndexOf('?', i - 1), texto.lastIndexOf('\n', i - 1)) + 1
  const fins = ['.', '!', '?', '\n'].map((c) => texto.indexOf(c, i)).filter((x) => x >= 0)
  const fim = fins.length ? Math.min(...fins) + 1 : texto.length
  return texto.slice(ini, fim).trim().slice(0, 600)
}

export function ChapterEditor(p: Props): ReactElement {
  const pagina = useRef<HTMLElement>(null)
  const props = useRef(p)
  props.current = p
  const [rep, setRep] = useState<PopRep | null>(null)
  const [nota, setNota] = useState<PopNota | null>(null)

  const relPos = (el: Element): { x: number; y: number } => {
    const r = el.getBoundingClientRect()
    const base = pagina.current?.getBoundingClientRect()
    if (!base) return { x: 0, y: 0 }
    const x = Math.min(Math.max(8, r.left - base.left - 20), base.width - 316)
    return { x, y: r.bottom - base.top + 8 }
  }

  const abrirNota = (view: EditorView, pos: number): void => {
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'nota') return
    const dom = view.nodeDOM(pos)
    const el = dom instanceof Element ? dom : null
    const { x, y } = el ? relPos(el) : { x: 40, y: 40 }
    setRep(null)
    setNota({ x, y, pos, texto: String(node.attrs.texto ?? '') })
  }
  const abrirNotaRef = useRef(abrirNota)
  abrirNotaRef.current = abrirNota

  const abrirRep = (view: EditorView, span: HTMLElement): void => {
    const textNode = span.firstChild
    if (!textNode) return
    const from = view.posAtDOM(textNode, 0)
    const palavra = span.textContent ?? ''
    const to = from + palavra.length
    const textoTodo = view.state.doc.textBetween(0, view.state.doc.content.size, '\n', '￼')
    const $pos = view.state.doc.resolve(from)
    const bloco = $pos.parent.textContent
    const frase = fraseEm(bloco, Math.max(0, from - $pos.start()))
    const { x, y } = relPos(span)
    setNota(null)
    const pop: PopRep = { x, y, from, to, palavra, frase, info: contarRadical(textoTodo, palavra), sinonimos: null, carregando: true, erro: null }
    setRep(pop)
    call<SinonimosResult>('ia.sinonimos', palavra, frase)
      .then((s) => setRep((r) => (r && r.from === from ? { ...r, sinonimos: s, carregando: false } : r)))
      .catch((e: unknown) =>
        setRep((r) => (r && r.from === from ? { ...r, carregando: false, erro: e instanceof Error ? e.message : String(e) } : r))
      )
  }
  const abrirRepRef = useRef(abrirRep)
  abrirRepRef.current = abrirRep

  const editor = useEditor({
    extensions: [
      // tachado desligado: a diagramação não imprime tachado (texto antigo com ~~ sai sem os tis)
      StarterKit.configure({ horizontalRule: false, codeBlock: false, code: false, heading: false, bulletList: false, orderedList: false, listItem: false, strike: false }),
      EscritaLiteraria,
      Placeholder.configure({ placeholder: 'Comece a escrever…' }),
      Markdown.configure({ html: false, tightLists: true, linkify: false, breaks: false, transformPastedText: true }),
      Nota,
      Cena,
      QuebraPagina,
      Figura.configure({ dir: p.dir ?? '' }),
      Marcas,
      BlocoAtual,
      RascunhoIa
    ],
    content: corrigirMarkdownLegado(p.inicial),
    editorProps: {
      // colar: só parágrafos, itálico e negrito, com a tipografia do livro
      transformPastedHTML: (html) => limparHtmlColado(html),
      transformPastedText: (text, plain) => limparTextoColado(text, plain),
      attributes: { class: 'ms-texto', 'aria-label': 'Texto do capítulo', spellcheck: 'true', lang: 'pt-BR', role: 'textbox', 'aria-multiline': 'true' },
      handleClickOn: (view, _pos, node, nodePos) => {
        if (node.type.name === 'nota') {
          abrirNotaRef.current(view, nodePos)
          return true
        }
        return false
      },
      handleClick: (view, _pos, event) => {
        const t = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.rep') : null
        if (t) {
          abrirRepRef.current(view, t)
          return false
        }
        setRep(null)
        return false
      },
      handleKeyDown: (view, event) => {
        // Enter sobre uma nota selecionada abre a edição
        if (event.key === 'Enter') {
          const sel = view.state.selection as { node?: { type: { name: string } }; from: number }
          if (sel.node?.type.name === 'nota') {
            abrirNotaRef.current(view, sel.from)
            return true
          }
        }
        if (event.key === 'Escape') {
          setRep(null)
          setNota(null)
        }
        return false
      }
    },
    onUpdate: ({ editor: e }) => {
      // o rascunho da IA nunca vai para o arquivo enquanto não for aceito
      if (temRascunho(e.state.doc)) {
        const doc = docSemRascunho(e)
        props.current.onChange(markdownSemRascunho(e), doc.textBetween(0, doc.content.size, '\n\n', ' '), true)
        return
      }
      const md = (e.storage as { markdown: { getMarkdown(): string } }).markdown.getMarkdown()
      props.current.onChange(md, e.getText(), false)
    }
  })

  useEffect(() => {
    p.onEditor(editor)
    return () => p.onEditor(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // enquanto digita, repetições e furos somem; voltam ~2 s após a pausa
  useEffect(() => {
    if (!editor) return
    let t: ReturnType<typeof setTimeout> | undefined
    const digitando = (): void => {
      pagina.current?.classList.add('ms-digitando')
      clearTimeout(t)
      t = setTimeout(() => pagina.current?.classList.remove('ms-digitando'), 2000)
    }
    editor.on('update', digitando)
    return () => {
      clearTimeout(t)
      editor.off('update', digitando)
    }
  }, [editor])

  // máquina de escrever: mantém a linha do cursor no meio da tela
  const maquina = p.tela.maquina
  useEffect(() => {
    if (!editor || !maquina) return
    const centrar = (): void => {
      if (!editor.isFocused) return
      const scroller = pagina.current?.closest<HTMLElement>('.ms-scroll')
      if (!scroller) return
      let y: number
      try {
        const c = editor.view.coordsAtPos(editor.state.selection.head)
        y = (c.top + c.bottom) / 2
      } catch {
        return
      }
      const r = scroller.getBoundingClientRect()
      const delta = y - (r.top + r.height / 2)
      if (Math.abs(delta) > 2) scroller.scrollBy({ top: delta })
    }
    const agendar = (): void => {
      requestAnimationFrame(centrar)
    }
    editor.on('selectionUpdate', agendar)
    editor.on('update', agendar)
    editor.on('focus', agendar)
    agendar()
    return () => {
      editor.off('selectionUpdate', agendar)
      editor.off('update', agendar)
      editor.off('focus', agendar)
    }
  }, [editor, maquina])

  // palavras repetidas: reanalisa com atraso após digitar
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    if (!editor) return
    const bump = (): void => setVersao((v) => v + 1)
    editor.on('update', bump)
    return () => {
      editor.off('update', bump)
    }
  }, [editor])
  useEffect(() => {
    if (!editor) return
    const t = setTimeout(
      () => {
        const repetidas = p.repeticoes ? new Set(analisarRepeticoes(editor.getText()).map((r) => r.raiz)) : new Set<string>()
        const atual = marcasKey.getState(editor.state)?.repetidas
        if (atual && atual.size === repetidas.size && [...repetidas].every((r) => atual.has(r))) return
        editor.view.dispatch(editor.state.tr.setMeta(marcasKey, { repetidas }))
      },
      versao === 0 ? 0 : 700
    )
    return () => clearTimeout(t)
  }, [editor, versao, p.repeticoes])

  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(marcasKey, { furos: p.furos }))
  }, [editor, p.furos])

  const trocar = (nova: string): void => {
    if (!editor || !rep) return
    const atual = editor.state.doc.textBetween(rep.from, rep.to)
    if (atual !== rep.palavra) {
      setRep(null)
      return
    }
    editor.view.dispatch(editor.state.tr.insertText(manterCaixa(rep.palavra, nova), rep.from, rep.to))
    setRep(null)
    editor.commands.focus()
  }

  const salvarNota = (texto: string): void => {
    if (!editor || !nota) return
    const node = editor.state.doc.nodeAt(nota.pos)
    if (node?.type.name === 'nota') {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(nota.pos, undefined, { ...node.attrs, texto }))
    }
    setNota(null)
    editor.commands.focus()
  }

  const removerNota = (): void => {
    if (!editor || !nota) return
    const node = editor.state.doc.nodeAt(nota.pos)
    if (node?.type.name === 'nota') editor.view.dispatch(editor.state.tr.delete(nota.pos, nota.pos + node.nodeSize))
    setNota(null)
    editor.commands.focus()
  }

  // nota recém-inserida pela barra de ferramentas pede edição imediata
  useEffect(() => {
    if (!editor) return
    const onNova = (ev: Event): void => {
      const pos = (ev as CustomEvent<number>).detail
      abrirNotaRef.current(editor.view, pos)
    }
    const dom = editor.view.dom
    dom.addEventListener('folio:nota', onNova)
    return () => dom.removeEventListener('folio:nota', onNova)
  }, [editor])

  // posição da mini barra do rascunho (abaixo do último parágrafo do rascunho)
  const [barra, setBarra] = useState<{ x: number; y: number } | null>(null)
  const rascunhoId = p.rascunho?.id ?? null
  useEffect(() => {
    if (!rascunhoId) {
      setBarra(null)
      return
    }
    const t = setTimeout(() => {
      const base = pagina.current
      if (!base) return
      const els = base.querySelectorAll<HTMLElement>(`.ms-rascunho[data-rascunho="${CSS.escape(rascunhoId)}"]`)
      const ult = els[els.length - 1]
      if (!ult) {
        setBarra(null)
        return
      }
      const b = base.getBoundingClientRect()
      const r = ult.getBoundingClientRect()
      setBarra({ x: Math.max(8, Math.min(r.left - b.left, b.width - 330)), y: r.bottom - b.top + 10 })
    }, 30)
    return () => clearTimeout(t)
  }, [rascunhoId, versao, p.rascunho?.carregando, p.corpoPx, p.linha])

  const formas = rep ? Object.entries(rep.info.formas).sort((a, b) => b[1] - a[1]) : []

  return (
    <article
      ref={pagina}
      className={['ms-page', p.tela.justificar && 'ms-justificar', p.tela.maquina && 'ms-maquina', p.tela.focoParagrafo && 'ms-focopar']
        .filter(Boolean)
        .join(' ')}
      style={{ ['--ms-corpo' as string]: `${p.corpoPx}px`, ['--ms-linha' as string]: String(p.linha) }}
    >
      <header className="ms-cab">
        <span className="ms-rotulo">{p.rotulo}</span>
        <input
          className="ms-titulo disp"
          aria-label="Título do capítulo"
          value={p.titulo}
          onChange={(e) => p.onTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.commands.focus('start')
            }
          }}
        />
        <svg width="120" height="14" viewBox="0 0 120 14" className="ms-vinheta" aria-hidden="true">
          <path d="M0 7h46M74 7h46" strokeWidth=".8" opacity=".6" />
          <path d="M60 1l6 6-6 6-6-6z" fill="none" strokeWidth=".9" />
          <circle cx="60" cy="7" r="1.6" />
        </svg>
      </header>

      <EditorContent editor={editor} />

      {rep && (
        <div className="ms-pop" role="dialog" aria-label={`Palavra repetida: ${rep.palavra}`} style={{ left: rep.x, top: rep.y }}>
          <div className="ms-pop-h">
            <span className="disp">{rep.palavra}</span>
            {rep.sinonimos?.classe && <span className="ms-eb">{rep.sinonimos.classe}</span>}
            <button type="button" className="ms-ib" aria-label="Fechar" onClick={() => setRep(null)}>
              <Ico n="fechar" size={14} />
            </button>
          </div>
          <div className="ms-pop-conta">
            Você usou formas de <b>“{rep.palavra.toLowerCase()}”</b> {fmt(rep.info.total)}× neste capítulo
            {formas.length > 1 && <span className="ms-formas">{formas.map(([f, n]) => `${f} ${n}×`).join(' · ')}</span>}
          </div>
          {rep.carregando && <p className="ms-pop-msg">Buscando alternativas…</p>}
          {rep.erro && <p className="ms-pop-msg">Sinônimos indisponíveis: {rep.erro}</p>}
          {rep.sinonimos && rep.sinonimos.sinonimos.length > 0 && (
            <div className="ms-chips">
              {rep.sinonimos.sinonimos.map((s) => (
                <button key={s} type="button" className="ms-chip" onClick={() => trocar(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {rep.sinonimos && rep.sinonimos.fortes.length > 0 && (
            <>
              <div className="ms-eb ms-acc">Mais fortes</div>
              <div className="ms-chips">
                {rep.sinonimos.fortes.map((s) => (
                  <button key={s} type="button" className="ms-chip" onClick={() => trocar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          {rep.sinonimos && rep.sinonimos.sinonimos.length === 0 && rep.sinonimos.fortes.length === 0 && (
            <p className="ms-pop-msg">Nenhuma alternativa sugerida.</p>
          )}
        </div>
      )}

      {p.rascunho && barra && (
        <div className="ms-rbar" role="toolbar" aria-label="Rascunho da IA" style={{ left: barra.x, top: barra.y }}>
          <span className="ms-rbar-t">
            <Ico n="brilho" size={13} /> {p.rascunho.carregando ? 'Reescrevendo…' : 'Rascunho da IA'}
          </span>
          <button type="button" className="btn sm pri" disabled={p.rascunho.carregando} onClick={p.onAceitar} title="Vira texto normal do capítulo e é salvo">
            Aceitar
          </button>
          <button type="button" className="btn sm" disabled={p.rascunho.carregando} onClick={p.onRefazer} title="Pede outra versão do mesmo trecho">
            Refazer
          </button>
          <button type="button" className="btn sm" disabled={p.rascunho.carregando} onClick={p.onDescartar} title="Apaga o rascunho; nada foi salvo">
            Descartar
          </button>
          {p.rascunho.erro && (
            <span className="ms-rbar-e" role="alert">
              {p.rascunho.erro}
            </span>
          )}
        </div>
      )}

      {nota && <NotaPop key={nota.pos} nota={nota} onSalvar={salvarNota} onRemover={removerNota} onFechar={() => setNota(null)} />}
    </article>
  )
}

function NotaPop({
  nota,
  onSalvar,
  onRemover,
  onFechar
}: {
  nota: PopNota
  onSalvar: (t: string) => void
  onRemover: () => void
  onFechar: () => void
}): ReactElement {
  const [texto, setTexto] = useState(nota.texto)
  return (
    <form
      className="ms-pop"
      role="dialog"
      aria-label="Nota de rodapé"
      style={{ left: nota.x, top: nota.y }}
      onSubmit={(e) => {
        e.preventDefault()
        onSalvar(texto.trim())
      }}
    >
      <div className="ms-pop-h">
        <span className="ms-eb">Nota de rodapé</span>
        <button type="button" className="ms-ib" aria-label="Fechar" onClick={onFechar}>
          <Ico n="fechar" size={14} />
        </button>
      </div>
      <label className="field">
        <span className="ms-sr">Texto da nota</span>
        <textarea
          className="input ms-area"
          autoFocus
          rows={3}
          value={texto}
          placeholder="Texto da nota (aceita *itálico*)"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onSalvar(texto.trim())
            }
            if (e.key === 'Escape') onFechar()
          }}
        />
      </label>
      <div className="ms-row">
        <button type="button" className="btn sm" onClick={onRemover}>
          Remover nota
        </button>
        <button type="submit" className="btn sm pri">
          Salvar
        </button>
      </div>
    </form>
  )
}
