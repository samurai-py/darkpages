import { Extension, InputRule, type Editor } from '@tiptap/core'
import { inserirCena } from './extensions'

/**
 * Digitação de ficção: travessão de diálogo, aspas curvas, reticências,
 * espaços e pontuação, atalhos de teclado e limpeza do texto colado.
 * Substitui os atalhos de Markdown (listas, títulos), que num romance só atrapalham.
 */

export const TRAVESSAO = '— '

/** Atalhos mostrados na interface (mesma fonte da verdade da extensão). */
export const ATALHOS: Array<{ teclas: string; acao: string }> = [
  { teclas: '- ou -- no início + espaço', acao: 'Travessão de diálogo (— )' },
  { teclas: 'Ctrl+Enter', acao: 'Nova fala: novo parágrafo já com travessão' },
  { teclas: 'Enter', acao: 'Novo parágrafo (narração, sem travessão)' },
  { teclas: 'Shift+Enter', acao: 'Quebra de linha dentro do parágrafo' },
  { teclas: '-- no meio do texto', acao: 'Travessão (—), inclusive em inciso: “ele -- disse --”' },
  { teclas: '...', acao: 'Reticências (…)' },
  { teclas: '" e \'', acao: 'Aspas curvas (“ ” ‘ ’), abrindo ou fechando pelo contexto' },
  { teclas: 'Backspace logo após', acao: 'Desfaz a última substituição automática' },
  { teclas: 'Dois espaços', acao: 'Viram um só' },
  { teclas: 'Espaço antes de , . ; : ! ?', acao: 'Removido ao digitar a pontuação' },
  { teclas: 'Ctrl+I / Ctrl+B', acao: 'Itálico / negrito' },
  { teclas: 'Ctrl+Shift+B', acao: 'Citação (bloco recuado, em itálico)' },
  { teclas: 'Ctrl+Shift+Enter ou *** + espaço', acao: 'Quebra de cena (⁂)' },
  { teclas: 'Ctrl+V', acao: 'Cola só o texto, itálico e negrito, já com travessão e aspas curvas' },
  { teclas: 'Ctrl+Shift+V', acao: 'Cola como texto simples' },
  { teclas: 'Ctrl+Z / Ctrl+Shift+Z', acao: 'Desfazer / refazer' },
  { teclas: 'Ctrl+F', acao: 'Buscar' }
]

const LINHA_DE_CENA = /^\s*([-*_])(?:\s*\1){2,}\s*$/

/**
 * Corrige textos gravados antes desta extensão: linhas de lista criadas por
 * engano ("- fala") viram diálogo (cada uma no seu parágrafo), e "1984. Era..."
 * deixa de virar lista. Nenhum texto é descartado.
 */
export function corrigirMarkdownLegado(md: string): string {
  const out: string[] = []
  for (const l of md.split('\n')) {
    if (LINHA_DE_CENA.test(l)) {
      out.push(l)
      continue
    }
    const lista = /^\s*[-–*+]\s+(?=\S)/.exec(l)
    if (lista) {
      if (out.length && out[out.length - 1]!.trim() !== '') out.push('')
      out.push(TRAVESSAO + l.slice(lista[0].length))
      continue
    }
    out.push(l.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4'))
  }
  return out.join('\n')
}

function aspa(antes: string, abre: string, fecha: string): string {
  return antes === '' || /[\s([{“‘—–-]$/.test(antes) ? abre : fecha
}

/** Tipografia de um trecho de texto; `antes` é o caractere que o precede. */
export function tipografar(t: string, antes = ''): string {
  let s = t
    .replace(/\.\.\./g, '…')
    .replace(/--/g, '—')
    .replace(/(\S) [-–] (?=\S)/g, '$1 — ')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
  let out = ''
  for (const c of s) {
    const prev = out ? out.slice(-1) : antes
    if (c === '"') out += aspa(prev, '“', '”')
    else if (c === "'") out += aspa(prev, '‘', '’')
    else out += c
  }
  s = out
  return s
}

/** Hífen ou meia-risca de diálogo no início do parágrafo → travessão. */
function falaNoInicio(s: string): string {
  return s.replace(/^\s*(?:--?|–)\s*(?=\S)/, TRAVESSAO)
}

/** Texto colado (PDF, e-mail, .txt): junta linhas soltas e acerta a tipografia. */
export function limparTextoColado(texto: string, simples: boolean): string {
  const pars = texto
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .map((p) => falaNoInicio(tipografar(p)))
  const md = pars.join('\n\n')
  return simples ? md : corrigirMarkdownLegado(md)
}

interface Trecho {
  t: string
  b: boolean
  i: boolean
}

const BLOCO = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|TR|TD|TH|PRE|SECTION|ARTICLE|UL|OL|TABLE|HEADER|FOOTER)$/
const IGNORAR = /^(STYLE|SCRIPT|META|TITLE|HEAD|LINK|NOSCRIPT)$/

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * HTML colado de Word / Google Docs / páginas: mantém só parágrafos, itálico e
 * negrito; o resto (fontes, cores, tamanhos, listas, títulos) vira texto corrido.
 * Conteúdo copiado do próprio editor passa intacto.
 */
export function limparHtmlColado(html: string): string {
  if (html.includes('data-pm-slice')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pars: Trecho[][] = []
  let atual: Trecho[] = []
  let br = false
  const fechar = (): void => {
    if (atual.some((x) => x.t.trim())) pars.push(atual)
    atual = []
    br = false
  }
  const andar = (n: Node, b: boolean, i: boolean): void => {
    if (n.nodeType === 3) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ')
      if (!t) return
      if (br) atual.push({ t: ' ', b, i })
      br = false
      atual.push({ t, b, i })
      return
    }
    if (n.nodeType !== 1) return
    const el = n as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (IGNORAR.test(tag)) return
    if (tag === 'BR') {
      // uma quebra solta junta as linhas; duas seguidas separam parágrafos
      if (br) fechar()
      else br = true
      return
    }
    let nb = b
    let ni = i
    if (tag === 'B' || tag === 'STRONG') nb = true
    if (tag === 'I' || tag === 'EM') ni = true
    const fw = el.style?.fontWeight
    if (fw) nb = fw === 'bold' || fw === 'bolder' || Number(fw) >= 600
    const fs = el.style?.fontStyle
    if (fs) ni = fs === 'italic' || fs === 'oblique'
    const bloco = BLOCO.test(tag)
    if (bloco) fechar()
    el.childNodes.forEach((c) => andar(c, nb, ni))
    if (bloco) fechar()
  }
  andar(doc.body, false, false)
  fechar()

  return pars
    .map((runs) => {
      // une trechos vizinhos de mesmo estilo e limpa as pontas
      const juntos: Trecho[] = []
      for (const r of runs) {
        const u = juntos[juntos.length - 1]
        if (u && u.b === r.b && u.i === r.i) u.t += r.t
        else juntos.push({ ...r })
      }
      juntos[0]!.t = juntos[0]!.t.replace(/^\s+/, '')
      juntos[juntos.length - 1]!.t = juntos[juntos.length - 1]!.t.replace(/\s+$/, '')
      let antes = ''
      const html = juntos
        .map((r, k) => {
          let t = tipografar(r.t, antes)
          if (k === 0) t = falaNoInicio(t)
          if (t) antes = t.slice(-1)
          let h = esc(t)
          if (r.i) h = `<em>${h}</em>`
          if (r.b) h = `<strong>${h}</strong>`
          return h
        })
        .join('')
      return `<p>${html}</p>`
    })
    .join('')
}

/** Nova fala: novo parágrafo já com travessão (no parágrafo vazio, só o travessão). */
export function novaFala(editor: Editor): boolean {
  const texto = editor.state.selection.$from.parent.textContent
  // já é uma fala vazia: não cria outra
  if (texto === TRAVESSAO || texto === TRAVESSAO.trim()) return editor.commands.focus()
  const vazio = texto.length === 0
  const c = editor.chain().focus()
  return (vazio ? c : c.splitBlock()).insertContent(TRAVESSAO).run()
}

function textoAntes(state: { doc: { textBetween(a: number, b: number, s?: string, l?: string): string } }, pos: number): string {
  return state.doc.textBetween(Math.max(0, pos - 1), pos, '\n', '\n')
}

export const EscritaLiteraria = Extension.create({
  name: 'escritaLiteraria',
  // acima do HardBreak do StarterKit, que também quer Ctrl+Enter
  priority: 1000,

  addInputRules() {
    return [
      // "- " ou "-- " ou "– " no início do parágrafo → travessão de diálogo
      new InputRule({
        find: /^(?:--?|–) $/,
        handler: ({ state, range }) => {
          state.tr.insertText(TRAVESSAO, range.from, range.to)
        }
      }),
      // "--" no meio do texto → — (o espaço antes, se houver, fica)
      new InputRule({
        find: /(\S ?)--$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${match[1] ?? ''}—`, range.from, range.to)
        }
      }),
      // ... → …
      new InputRule({
        find: /\.\.\.$/,
        handler: ({ state, range }) => {
          state.tr.insertText('…', range.from, range.to)
        }
      }),
      // espaço antes de pontuação some ao digitar a pontuação
      new InputRule({
        find: /(\S) +([,.;:!?])$/,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${match[1]}${match[2]}`, range.from, range.to)
        }
      }),
      // dois espaços → um
      new InputRule({
        find: / {2}$/,
        handler: ({ state, range }) => {
          state.tr.insertText(' ', range.from, range.to)
        }
      }),
      // aspas duplas e simples curvas, abrindo ou fechando conforme o contexto
      new InputRule({
        find: /"$/,
        handler: ({ state, range }) => {
          state.tr.insertText(aspa(textoAntes(state, range.from), '“', '”'), range.from, range.to)
        }
      }),
      new InputRule({
        find: /'$/,
        handler: ({ state, range }) => {
          state.tr.insertText(aspa(textoAntes(state, range.from), '‘', '’'), range.from, range.to)
        }
      })
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => novaFala(this.editor),
      'Mod-Shift-Enter': () => inserirCena(this.editor)
    }
  }
})
