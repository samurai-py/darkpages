import { Mark, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Rascunho da IA ("Escrever no texto").
 *
 * Decisão: o rascunho só existe na sessão do editor. Enquanto não for
 * aceito, ele NÃO entra no autosave nem no arquivo: o Markdown salvo é
 * gerado de uma cópia do documento sem os trechos marcados. Aceitar remove
 * a marca (vira texto normal e é salvo); Descartar apaga o trecho. Assim o
 * .md do capítulo nunca recebe HTML nem marcação estranha, e um rascunho
 * esquecido não vira texto do livro sem o autor decidir.
 *
 * A marca também nunca é lida de HTML/Markdown (parseHTML vazio) e, por
 * segurança, serializa sem nenhum símbolo.
 */

export const RascunhoIa = Mark.create({
  name: 'rascunhoIa',
  inclusive: false,
  addAttributes() {
    return { id: { default: null } }
  },
  parseHTML() {
    return []
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ class: 'ms-rascunho', 'data-rascunho': String(HTMLAttributes.id ?? '') }),
      0
    ]
  },
  addStorage() {
    return { markdown: { serialize: { open: '', close: '' } } }
  }
})

interface Faixa {
  from: number
  to: number
}

/** Blocos de topo inteiramente marcados como rascunho (o que "Escrever no texto" insere). */
function blocosRascunho(doc: PMNode, id?: string): Faixa[] {
  const out: Faixa[] = []
  doc.forEach((node, offset) => {
    if (!node.isTextblock || !node.textContent) return
    let todo = true
    node.descendants((n) => {
      if (n.isText && !n.marks.some((m) => m.type.name === 'rascunhoIa' && (!id || m.attrs.id === id))) todo = false
      return true
    })
    if (todo) out.push({ from: offset, to: offset + node.nodeSize })
  })
  return out
}

/** Trechos soltos de texto marcado (caso o autor tenha mexido no meio do rascunho). */
function textosRascunho(doc: PMNode, id?: string): Faixa[] {
  const out: Faixa[] = []
  doc.descendants((n, pos) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'rascunhoIa' && (!id || m.attrs.id === id))) out.push({ from: pos, to: pos + n.nodeSize })
    return true
  })
  return out
}

export function temRascunho(doc: PMNode): boolean {
  return textosRascunho(doc).length > 0
}

/** Documento sem nenhum rascunho (para salvar). */
export function docSemRascunho(editor: Editor): PMNode {
  const doc = editor.state.doc
  if (!temRascunho(doc)) return doc
  const tr = editor.state.tr
  for (const f of blocosRascunho(doc).reverse()) tr.delete(f.from, f.to)
  for (const f of textosRascunho(tr.doc).reverse()) tr.delete(f.from, f.to)
  return tr.doc
}

/** Markdown do capítulo sem o rascunho pendente. */
export function markdownSemRascunho(editor: Editor): string {
  const md = (editor.storage as unknown as { markdown: { serializer: { serialize(d: PMNode): string } } }).markdown
  return md.serializer.serialize(docSemRascunho(editor))
}

export interface PontoInsercao {
  /** posição (entre blocos de topo) onde os parágrafos entram */
  pos: number
  /** se o bloco atual é um parágrafo vazio, ele é substituído */
  substitui: Faixa | null
  antes: string
  depois: string
}

/**
 * Onde inserir: depois do bloco onde está o cursor (ou no fim do capítulo se
 * o editor ainda não teve foco). O texto antes/depois vai como contexto.
 */
export function pontoDeInsercao(editor: Editor, usarCursor: boolean): PontoInsercao {
  const { state } = editor
  let pos = state.doc.content.size
  let substitui: Faixa | null = null
  if (usarCursor) {
    const $p = state.selection.$from
    if ($p.depth >= 1) {
      const ini = $p.before(1)
      const node = state.doc.child($p.index(0))
      pos = ini + node.nodeSize
      if (node.type.name === 'paragraph' && !node.textContent.trim()) substitui = { from: ini, to: pos }
    }
  } else {
    const ult = state.doc.lastChild
    if (ult && ult.type.name === 'paragraph' && !ult.textContent.trim()) substitui = { from: pos - ult.nodeSize, to: pos }
  }
  const antes = state.doc.textBetween(0, substitui ? substitui.from : pos, '\n\n', ' ')
  const depois = state.doc.textBetween(substitui ? substitui.to : pos, state.doc.content.size, '\n\n', ' ')
  return { pos, substitui, antes: antes.slice(-3000), depois: depois.slice(0, 1500) }
}

/** Markdown simples (parágrafos, *itálico*, **negrito**) → nós do TipTap com a marca de rascunho. */
export function paragrafosDeMarkdown(md: string, id: string): JSONContent[] {
  const marca = { type: 'rascunhoIa', attrs: { id } }
  return md
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((p) => {
      const content: JSONContent[] = []
      const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g
      let ult = 0
      for (const m of p.matchAll(re)) {
        const i = m.index ?? 0
        if (i > ult) content.push({ type: 'text', text: p.slice(ult, i), marks: [marca] })
        const negrito = m[2] ?? m[3]
        const italico = m[4] ?? m[5]
        if (negrito) content.push({ type: 'text', text: negrito, marks: [{ type: 'bold' }, marca] })
        else if (italico) content.push({ type: 'text', text: italico, marks: [{ type: 'italic' }, marca] })
        ult = i + m[0].length
      }
      if (ult < p.length) content.push({ type: 'text', text: p.slice(ult), marks: [marca] })
      return { type: 'paragraph', content }
    })
}

/** Insere o rascunho (substitui o anterior com o mesmo id, se houver). Devolve false se nada entrou. */
export function inserirRascunho(editor: Editor, md: string, id: string, ponto: PontoInsercao): boolean {
  const nos = paragrafosDeMarkdown(md, id)
  if (!nos.length) return false
  const existentes = blocosRascunho(editor.state.doc, id)
  if (existentes.length) {
    const from = existentes[0]!.from
    const to = existentes.at(-1)!.to
    return editor.chain().insertContentAt({ from, to }, nos).run()
  }
  const alvo = ponto.substitui ?? { from: ponto.pos, to: ponto.pos }
  return editor.chain().insertContentAt(alvo, nos).run()
}

/** Aceitar: tira a marca (o trecho vira texto normal e passa a ser salvo). */
export function aceitarRascunho(editor: Editor, id: string): void {
  const tipo = editor.schema.marks.rascunhoIa
  if (!tipo) return
  const tr = editor.state.tr
  for (const f of textosRascunho(editor.state.doc, id)) tr.removeMark(f.from, f.to, tipo)
  editor.view.dispatch(tr)
}

/** Descartar: apaga o trecho do rascunho. */
export function descartarRascunho(editor: Editor, id: string): void {
  const tr = editor.state.tr
  for (const f of blocosRascunho(editor.state.doc, id).reverse()) tr.delete(f.from, f.to)
  for (const f of textosRascunho(tr.doc, id).reverse()) tr.delete(f.from, f.to)
  editor.view.dispatch(tr)
}

/** Guarda de saída: a tela do Manuscrito registra aqui se há rascunho pendente. */
export const guardaRascunho = {
  pendente: false,
  /** true = pode sair */
  confirmarSaida(): boolean {
    if (!this.pendente) return true
    return window.confirm('Há um rascunho da IA ainda não aceito neste capítulo. Ele não foi salvo.\n\nSair e descartar o rascunho?')
  }
}
