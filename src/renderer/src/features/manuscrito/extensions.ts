import { Extension, InputRule, Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Schema } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { WORD_RE, foldSameLength, radical } from './texto'
import { call } from '../../api'

/*
 * Extensões do editor do Manuscrito:
 *  - Nota: nota de rodapé inline, gravada em Markdown como ^[texto]
 *  - Cena: quebra de cena, gravada como *** e mostrada como ⁂
 *  - QuebraPagina: quebra de página manual, gravada como \pagebreak sozinho na linha
 *  - Figura: imagem do livro com legenda, gravada como ![legenda](assets/arquivo.png)
 *  - Marcas: decorações de palavras repetidas, busca e furos de continuidade
 */

// ---------------------------------------------------------------- markdown-it (tipagem mínima)

interface MdToken {
  content: string
}
interface MdInlineState {
  src: string
  pos: number
  posMax: number
  push(type: string, tag: string, nesting: number): MdToken
}
interface MdBlockState {
  src: string
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  line: number
  push(type: string, tag: string, nesting: number): MdToken & { map: [number, number] | null; meta: unknown }
}
type MdBlockRule = (s: MdBlockState, startLine: number, endLine: number, silent: boolean) => boolean
interface MdLike {
  inline: { ruler: { before(name: string, rule: string, fn: (s: MdInlineState, silent: boolean) => boolean): void } }
  block: { ruler: { before(name: string, rule: string, fn: MdBlockRule, opts?: { alt: string[] }): void } }
  renderer: { rules: Record<string, ((tokens: Array<MdToken & { meta?: unknown }>, idx: number) => string) | undefined> }
  utils: { escapeHtml(s: string): string }
}

const registrados = new WeakSet<object>()

/** Índice do `]` que fecha o `[` em `start`, respeitando escapes e aninhamento. */
export function fechaColchete(s: string, start: number, max = s.length): number {
  let depth = 0
  for (let i = start; i < max; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
      continue
    }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Escapa `]` sem par para que o texto da nota não feche a marcação antes da hora. */
export function textoNotaSeguro(t: string): string {
  let depth = 0
  let out = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (c === '\\') {
      out += c + (t[i + 1] ?? '')
      i++
      continue
    }
    if (c === '[') depth++
    if (c === ']') {
      if (depth === 0) {
        out += '\\]'
        continue
      }
      depth--
    }
    out += c
  }
  // colchetes abertos sem fechamento também são escapados
  if (depth > 0) out = out.replace(/(?<!\\)\[/g, '\\[')
  return out.replace(/\n+/g, ' ')
}

function setupNota(md: MdLike): void {
  if (registrados.has(md)) return
  registrados.add(md)
  md.inline.ruler.before('link', 'folio_nota', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5e /* ^ */ || state.src.charCodeAt(state.pos + 1) !== 0x5b /* [ */) return false
    const end = fechaColchete(state.src, state.pos + 1, state.posMax)
    if (end < 0) return false
    if (!silent) {
      const tok = state.push('folio_nota', 'sup', 0)
      tok.content = state.src.slice(state.pos + 2, end)
    }
    state.pos = end + 1
    return true
  })
  md.renderer.rules.folio_nota = (tokens, idx) => `<sup data-nota="${md.utils.escapeHtml(tokens[idx]?.content ?? '')}"></sup>`
}

/** Regra de bloco do markdown-it para uma linha inteira que casa com `re` (quebra de página, figura). */
function regraDeLinha(md: MdLike, nome: string, re: RegExp, render: (m: RegExpMatchArray) => string): void {
  md.block.ruler.before(
    'paragraph',
    nome,
    (state, startLine, _endLine, silent) => {
      const ini = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0)
      const fim = state.eMarks[startLine] ?? ini
      const m = state.src.slice(ini, fim).trim().match(re)
      if (!m) return false
      if (silent) return true
      state.line = startLine + 1
      const tok = state.push(nome, 'div', 0)
      tok.map = [startLine, state.line]
      tok.meta = m
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote'] }
  )
  md.renderer.rules[nome] = (tokens, idx) => render(tokens[idx]?.meta as RegExpMatchArray)
}

const registradosBloco = new WeakSet<object>()

function setupBlocos(md: MdLike): void {
  if (registradosBloco.has(md)) return
  registradosBloco.add(md)
  regraDeLinha(md, 'folio_quebra', /^\\(?:pagebreak|newpage)$/, () => '<div data-quebra-pagina=""></div>')
  regraDeLinha(
    md,
    'folio_figura',
    /^!\[((?:\\.|[^\]\\])*)\]\(\s*<?([^()\s>]+)>?\s*\)$/,
    (m) => `<figure data-figura="" data-src="${md.utils.escapeHtml(m[2] ?? '')}" data-legenda="${md.utils.escapeHtml(m[1] ?? '')}"></figure>`
  )
}

// ---------------------------------------------------------------- nós

export const Nota = Node.create({
  name: 'nota',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      texto: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-nota') ?? '',
        renderHTML: (a: { texto?: string }) => ({ 'data-nota': a.texto ?? '' })
      }
    }
  },
  parseHTML() {
    return [{ tag: 'sup[data-nota]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    const t = String(node.attrs.texto ?? '')
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'nota', title: t || 'Nota vazia', 'aria-label': `Nota de rodapé: ${t}` })]
  },
  renderText({ node }) {
    return `^[${String(node.attrs.texto ?? '')}]`
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write(s: string): void }, node: PMNode) {
          state.write(`^[${textoNotaSeguro(String(node.attrs.texto ?? ''))}]`)
        },
        parse: {
          setup(md: MdLike) {
            setupNota(md)
          }
        }
      }
    }
  }
})

export const Cena = Node.create({
  name: 'cena',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr' }, { tag: 'div[data-cena]' }]
  },
  renderHTML() {
    return ['div', { class: 'cena', 'data-cena': '', role: 'separator', 'aria-label': 'Quebra de cena', contenteditable: 'false' }, '⁂']
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^(?:\*\*\*|⁂|\* \* \*)\s$/,
        handler: ({ state, range }) => {
          state.tr.delete(range.from, range.to)
          trCena(state.tr, state.schema)
        }
      })
    ]
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write(s: string): void; closeBlock(n: PMNode): void }, node: PMNode) {
          state.write('***')
          state.closeBlock(node)
        },
        parse: {}
      }
    }
  }
})

/**
 * Insere a quebra de cena no cursor e deixa o cursor num parágrafo logo abaixo:
 * parágrafo vazio vira cena + parágrafo; no fim do parágrafo, cena + parágrafo
 * novo depois dele; no início, a cena entra antes; no meio, o parágrafo é partido.
 */
export function trCena(tr: Transaction, schema: Schema): boolean {
  return trBloco(tr, schema, 'cena')
}

/** Insere um bloco atômico (cena, quebra de página, figura) no cursor, com o mesmo cuidado da quebra de cena. */
export function trBloco(tr: Transaction, schema: Schema, nome: string, attrs?: Record<string, unknown>): boolean {
  const tipo = schema.nodes[nome]
  const cena = tipo ? { create: () => tipo.create(attrs) } : undefined
  const par = schema.nodes.paragraph
  if (!cena || !par) return false
  if (!tr.selection.empty) tr.deleteSelection()
  const $p = tr.selection.$from
  if (!$p.parent.isTextblock) return false
  const d = $p.depth
  const pos = $p.pos
  if ($p.parent.content.size === 0) {
    const ini = $p.before(d)
    tr.replaceWith(ini, $p.after(d), [cena.create(), par.create()])
    tr.setSelection(TextSelection.create(tr.doc, ini + 2))
  } else if ($p.parentOffset === $p.parent.content.size) {
    const depois = $p.after(d)
    tr.insert(depois, [cena.create(), par.create()])
    tr.setSelection(TextSelection.create(tr.doc, depois + 2))
  } else if ($p.parentOffset === 0) {
    tr.insert($p.before(d), cena.create())
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  } else {
    tr.split(pos)
    tr.insert(pos + 1, cena.create())
    tr.setSelection(TextSelection.create(tr.doc, pos + 3))
  }
  return true
}

export function inserirCena(editor: Editor): boolean {
  const tr = editor.state.tr
  if (!trCena(tr, editor.state.schema)) return false
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}

export const QuebraPagina = Node.create({
  name: 'quebraPagina',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-quebra-pagina]' }]
  },
  renderHTML() {
    return ['div', { class: 'quebra-pagina', 'data-quebra-pagina': '', role: 'separator', 'aria-label': 'Quebra de página', contenteditable: 'false' }, 'quebra de página']
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write(s: string): void; closeBlock(n: PMNode): void }, node: PMNode) {
          state.write('\\pagebreak')
          state.closeBlock(node)
        },
        parse: {
          setup(md: MdLike) {
            setupBlocos(md)
          }
        }
      }
    }
  }
})

export function inserirQuebraPagina(editor: Editor): boolean {
  const tr = editor.state.tr
  if (!trBloco(tr, editor.state.schema, 'quebraPagina')) return false
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}

/** Legenda segura dentro de ![...]: escapa `]` e `\` soltos, sem quebra de linha. */
function legendaSegura(t: string): string {
  return textoNotaSeguro(t)
}

/** Nome em assets/ a partir do src gravado ("assets/foto.png" → "foto.png"). */
function nomeAsset(src: string): string | null {
  const n = src.replace(/^\.?\/?assets\//, '')
  return /^[a-z0-9][a-z0-9-]{0,80}\.(png|jpe?g|webp|svg)$/.test(n) ? n : null
}

export interface FiguraOptions {
  /** pasta do livro, para mostrar a imagem (assets.get) e enviar novas */
  dir: string
}

export const Figura = Node.create<FiguraOptions>({
  name: 'figura',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addOptions() {
    return { dir: '' }
  },
  addAttributes() {
    return {
      src: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-src') ?? '' },
      legenda: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-legenda') ?? '' }
    }
  },
  parseHTML() {
    return [
      { tag: 'figure[data-figura]' },
      // imagem no meio do parágrafo (texto antigo ou importado) vira figura em vez de sumir
      {
        tag: 'img[src]',
        getAttrs: (el: HTMLElement | string) =>
          typeof el === 'string' ? false : { src: el.getAttribute('src') ?? '', legenda: el.getAttribute('alt') ?? '' }
      }
    ]
  },
  renderHTML({ node }) {
    return ['figure', { 'data-figura': '', 'data-src': String(node.attrs.src ?? ''), 'data-legenda': String(node.attrs.legenda ?? '') }]
  },
  renderText({ node }) {
    return `![${String(node.attrs.legenda ?? '')}](${String(node.attrs.src ?? '')})`
  },
  addStorage() {
    return {
      dir: this.options.dir,
      markdown: {
        serialize(state: { write(s: string): void; closeBlock(n: PMNode): void }, node: PMNode) {
          state.write(`![${legendaSegura(String(node.attrs.legenda ?? ''))}](${String(node.attrs.src ?? '')})`)
          state.closeBlock(node)
        },
        parse: {
          setup(md: MdLike) {
            setupBlocos(md)
          }
        }
      }
    }
  },
  addNodeView() {
    const dir = this.options.dir
    return ({ node, getPos, editor }) => {
      let atual = node
      const fig = document.createElement('figure')
      fig.className = 'ms-figura'
      fig.contentEditable = 'false'
      const img = document.createElement('img')
      img.alt = ''
      const falta = document.createElement('span')
      falta.className = 'ms-figura-falta'
      const legenda = document.createElement('input')
      legenda.className = 'ms-figura-legenda'
      legenda.placeholder = 'Legenda (opcional; aceita *itálico*)'
      legenda.setAttribute('aria-label', 'Legenda da imagem')
      fig.append(img, falta, legenda)
      const carregar = (src: string): void => {
        const nome = nomeAsset(src)
        img.removeAttribute('src')
        falta.textContent = ''
        if (!nome || !dir) {
          falta.textContent = `Imagem fora de assets/: ${src}`
          return
        }
        call<string | null>('assets.get', dir, nome)
          .then((d) => {
            if (d) img.src = d
            else falta.textContent = `Imagem não encontrada: ${nome}`
          })
          .catch(() => (falta.textContent = `Imagem não encontrada: ${nome}`))
      }
      carregar(String(node.attrs.src ?? ''))
      legenda.value = String(node.attrs.legenda ?? '')
      img.alt = legenda.value
      const gravar = (): void => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined || legenda.value === atual.attrs.legenda) return
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...atual.attrs, legenda: legenda.value.replace(/\n+/g, ' ') }))
      }
      legenda.addEventListener('change', gravar)
      legenda.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          gravar()
          editor.commands.focus()
        }
      })
      return {
        dom: fig,
        update: (n: PMNode) => {
          if (n.type.name !== 'figura') return false
          if (n.attrs.src !== atual.attrs.src) carregar(String(n.attrs.src ?? ''))
          if (document.activeElement !== legenda) legenda.value = String(n.attrs.legenda ?? '')
          img.alt = String(n.attrs.legenda ?? '')
          atual = n
          return true
        },
        stopEvent: (e: Event) => e.target === legenda,
        ignoreMutation: () => true
      }
    }
  }
})

/** Insere uma figura (imagem já gravada em assets/) no cursor. */
export function inserirFigura(editor: Editor, src: string): boolean {
  const tr = editor.state.tr
  if (!trBloco(tr, editor.state.schema, 'figura', { src, legenda: '' })) return false
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}

/** Marca o bloco do cursor (para o modo "foco no parágrafo"). */
export const BlocoAtual = Extension.create({
  name: 'folioBlocoAtual',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('folioBlocoAtual'),
        props: {
          decorations: (state: EditorState) => {
            const $p = state.selection.$from
            if ($p.depth < 1) return DecorationSet.empty
            const ini = $p.before(1)
            const node = state.doc.nodeAt(ini)
            if (!node) return DecorationSet.empty
            return DecorationSet.create(state.doc, [Decoration.node(ini, ini + node.nodeSize, { class: 'ms-atual' })])
          }
        }
      })
    ]
  }
})

// ---------------------------------------------------------------- decorações

export interface Furo {
  trecho: string
  titulo: string
}

export interface MarcasState {
  repetidas: Set<string>
  busca: string
  atual: number
  furos: Furo[]
  hits: Array<{ from: number; to: number }>
  deco: DecorationSet
}

export const marcasKey = new PluginKey<MarcasState>('folioMarcas')

type Meta = Partial<Pick<MarcasState, 'repetidas' | 'busca' | 'atual' | 'furos'>>

/** Texto de cada bloco com o mapa índice → posição no documento. */
function blocos(doc: PMNode): Array<{ texto: string; pos: number[] }> {
  const out: Array<{ texto: string; pos: number[] }> = []
  doc.descendants((node, p) => {
    if (!node.isTextblock) return true
    let texto = ''
    const pos: number[] = []
    node.forEach((child, offset) => {
      const base = p + 1 + offset
      if (child.isText) {
        const t = child.text ?? ''
        for (let i = 0; i < t.length; i++) pos.push(base + i)
        texto += t
      } else {
        pos.push(base)
        texto += '￼'
      }
    })
    pos.push(p + 1 + node.content.size)
    out.push({ texto, pos })
    return false
  })
  return out
}

function calcular(doc: PMNode, s: Omit<MarcasState, 'deco' | 'hits'>): { deco: DecorationSet; hits: MarcasState['hits'] } {
  const decos: Decoration[] = []
  const hits: MarcasState['hits'] = []
  const agulha = foldSameLength(s.busca.trim())
  const furos = s.furos.map((f) => ({ ...f, k: foldSameLength(f.trecho.trim()) })).filter((f) => f.k.length >= 2)
  for (const b of blocos(doc)) {
    if (s.repetidas.size) {
      for (const m of b.texto.matchAll(WORD_RE)) {
        const r = radical(m[0])
        if (!s.repetidas.has(r)) continue
        const i = m.index ?? 0
        decos.push(Decoration.inline(b.pos[i]!, b.pos[i + m[0].length - 1]! + 1, { class: 'rep', 'data-raiz': r }))
      }
    }
    if (agulha || furos.length) {
      const f = foldSameLength(b.texto)
      if (agulha) {
        let i = f.indexOf(agulha)
        while (i >= 0) {
          hits.push({ from: b.pos[i]!, to: b.pos[i + agulha.length - 1]! + 1 })
          i = f.indexOf(agulha, i + agulha.length)
        }
      }
      for (const fu of furos) {
        let i = f.indexOf(fu.k)
        while (i >= 0) {
          decos.push(Decoration.inline(b.pos[i]!, b.pos[i + fu.k.length - 1]! + 1, { class: 'furo', title: fu.titulo }))
          i = f.indexOf(fu.k, i + fu.k.length)
        }
      }
    }
  }
  hits.forEach((h, i) => decos.push(Decoration.inline(h.from, h.to, { class: i === s.atual ? 'achado atual' : 'achado' })))
  return { deco: DecorationSet.create(doc, decos), hits }
}

export const Marcas = Extension.create({
  name: 'folioMarcas',
  addProseMirrorPlugins() {
    return [
      new Plugin<MarcasState>({
        key: marcasKey,
        state: {
          init: (_, state) => {
            const base = { repetidas: new Set<string>(), busca: '', atual: 0, furos: [] as Furo[] }
            return { ...base, ...calcular(state.doc, base) }
          },
          apply: (tr, prev, _old, state) => {
            const meta = tr.getMeta(marcasKey) as Meta | undefined
            if (!meta && !tr.docChanged) return prev
            const next = { repetidas: prev.repetidas, busca: prev.busca, atual: prev.atual, furos: prev.furos, ...(meta ?? {}) }
            const r = calcular(state.doc, next)
            const atual = r.hits.length ? Math.min(Math.max(0, next.atual), r.hits.length - 1) : 0
            if (atual !== next.atual) return { ...next, atual, ...calcular(state.doc, { ...next, atual }) }
            return { ...next, ...r }
          }
        },
        props: {
          decorations: (state: EditorState) => marcasKey.getState(state)?.deco ?? DecorationSet.empty
        }
      })
    ]
  }
})
