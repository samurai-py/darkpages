import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { SugestaoCorrigir } from '../../../../shared/corrigir'

/**
 * "Corrigir": tipografia e espaços do texto (local, instantâneo) e, se o
 * LanguageTool estiver ligado, ortografia e gramática. Tudo aqui é puro (sem
 * React, sem a ponte com o main) para ser testado.
 *
 * Mesmas regras de escrita.ts (tipografar, falaNoInicio), aplicadas a texto
 * já escrito: cada parágrafo vira uma string em que nós que não são texto
 * (nota de rodapé, quebra de linha) ocupam exatamente uma posição; as regras
 * nunca tocam nesses marcadores. A diferença entre o texto antigo e o
 * corrigido sai em edições pequenas (Myers por caractere), cada uma com a sua
 * posição no documento: as marcas (itálico, negrito) de cada trecho ficam.
 */

/** Marcador de nó inline que não é texto (nota de rodapé etc.). */
export const OBJ = '￼'
/** Quebra de linha dentro do parágrafo (Shift+Enter). */
export const QUEBRA = '\n'
const TRAVESSAO = '— '

export type TipoCorrecao =
  | 'reticencias'
  | 'travessao'
  | 'dialogo'
  | 'aspas'
  | 'espacos'
  | 'pontuacao'
  | 'vazios'
  | 'ortografia'
  | 'gramatica'

export const ROTULO_CORRECAO: Record<TipoCorrecao, string> = {
  reticencias: 'Reticências',
  travessao: 'Travessão',
  dialogo: 'Fala',
  aspas: 'Aspas e apóstrofos',
  espacos: 'Espaços',
  pontuacao: 'Espaço antes da pontuação',
  vazios: 'Parágrafos vazios',
  ortografia: 'Ortografia',
  gramatica: 'Gramática'
}

export type EscopoCorrecao = 'selecao' | 'paragrafo' | 'capitulo'

export interface Correcao {
  id: string
  tipo: TipoCorrecao
  /** intervalo no documento ([de, ate)) */
  de: number
  ate: number
  original: string
  por: string
  /** contexto para mostrar */
  antes: string
  depois: string
  /** remove nós inteiros (parágrafos vazios) em vez de trocar texto */
  bloco?: boolean
  /** explicação (LanguageTool) */
  motivo?: string
}

// ------------------------------------------------------------- texto puro

function aspa(antes: string, abre: string, fecha: string): string {
  return antes === '' || /[\s([{“‘—–-]/.test(antes) ? abre : fecha
}

const DIGITO = /\d/

/**
 * Tipografia e espaços de um parágrafo inteiro (idempotente):
 * espaços nas pontas e duplicados, espaço antes de , . ; : ! ?, "..." → …,
 * "--" → —, " - " entre palavras → " — ", hífen ou meia-risca de fala no
 * início → "— ", aspas e apóstrofos retos → curvos pelo contexto.
 * Números (1.000, 10 - 5) e marcadores de nota/quebra ficam intactos.
 */
export function corrigirTipografia(s: string): string {
  let t = s
    .replace(/\t/g, ' ')
    .replace(/^ +/, '')
    .replace(/ +(?=\n|$)/g, '')
    // espaços repetidos (o recuo depois de uma quebra de linha, como em versos, fica)
    .replace(/(?<=[^\n ]) {2,}/g, ' ')
    // espaço antes da pontuação (não depois de travessão, aspas ou parêntese que abrem)
    .replace(/(?<=[^\s—–(\[{“‘]) +(?=[,.;:!?](?![\p{L}\p{N}]))/gu, '')
    .replace(/\.\.\./g, '…')
    .replace(/---?/g, '—')
    // " - " ou " – " entre palavras vira travessão (mas 10 - 5 fica)
    .replace(/(\S) [-–] (?=\S)/g, (m, a: string, off: number, str: string) =>
      DIGITO.test(a) && DIGITO.test(str[off + m.length] ?? '') ? m : `${a} — `
    )
    // fala: hífen, meia-risca ou travessão colado no início → "— "
    .replace(/^[-–—] *(?=[^\s\d\-—–])/, TRAVESSAO)

  let out = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    const prev = out ? out.slice(-1) : ''
    if (c === '"') out += aspa(prev, '“', '”')
    else if (c === "'") {
      // '90, 'tá: apóstrofo de elisão no começo da palavra
      const elisao = /\d/.test(t[i + 1] ?? '')
      out += elisao ? '’' : aspa(prev, '‘', '’')
    } else out += c
  }
  t = out
  return t
}

// ------------------------------------------------------------- diferença

type Op = '=' | '-' | '+'

/** Myers O(ND) por unidade de código; null se passar de `maxD` edições. */
function myers(a: string, b: string, maxD: number): Op[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  if (max === 0) return []
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  const lim = Math.min(max, maxD)
  for (let d = 0; d <= lim; d++) {
    // guarda só a faixa k ∈ [-d-1, d+1] (índice k + d + 1)
    trace.push(v.slice(off - d - 1, off + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a.charCodeAt(x) === b.charCodeAt(y)) {
        x++
        y++
      }
      v[off + k] = x
      if (x >= n && y >= m) return voltar(trace, n, m)
    }
  }
  return null
}

function voltar(trace: Int32Array[], n: number, m: number): Op[] {
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!
    const get = (k: number): number => vd[k + d + 1]!
    const k = x - y
    const pk = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1
    const px = get(pk)
    const py = px - pk
    while (x > px && y > py) {
      ops.push('=')
      x--
      y--
    }
    if (d > 0) {
      if (x === px) {
        ops.push('+')
        y--
      } else {
        ops.push('-')
        x--
      }
    }
    x = px
    y = py
  }
  return ops.reverse()
}

export interface Edicao {
  /** intervalo em `a` */
  de: number
  ate: number
  por: string
}

/** Edições mínimas que levam `a` a `b` (trechos trocados agrupados). */
export function edicoes(a: string, b: string, maxD = 3000): Edicao[] | null {
  if (a === b) return []
  const ops = myers(a, b, maxD)
  if (!ops) return null
  const out: Edicao[] = []
  let i = 0
  let j = 0
  let k = 0
  while (k < ops.length) {
    if (ops[k] === '=') {
      i++
      j++
      k++
      continue
    }
    const de = i
    const dj = j
    const ks = k
    // "+" seguido de "-" começa outra troca ('"...' → '”…' são duas: aspas e reticências)
    while (k < ops.length && ops[k] !== '=' && !(k > ks && ops[k] === '-' && ops[k - 1] === '+')) {
      if (ops[k] === '-') i++
      else j++
      k++
    }
    out.push(...dividir(a, { de, ate: i, por: b.slice(dj, j) }))
  }
  return out
}

/** Trocas de um caractere (ou sinal) por outro que podem sair separadas. */
const PARES: Array<[RegExp, RegExp]> = [
  [/^["']/, /^[“”‘’]/],
  [/^\.\.\./, /^…/],
  [/^---?/, /^—/],
  [/^[-–]/, /^—/]
]

/**
 * A diferença junta trocas vizinhas ('"...' → '”…'); separa as que se
 * reconhecem pelo começo, para cada uma ser conferida (e desmarcada) sozinha.
 */
function dividir(a: string, e: Edicao): Edicao[] {
  const out: Edicao[] = []
  let o = a.slice(e.de, e.ate)
  let q = e.por
  let pos = e.de
  for (;;) {
    let cortou = false
    for (const [ro, rq] of PARES) {
      const mo = ro.exec(o)
      const mq = rq.exec(q)
      if (!mo || !mq) continue
      // o par é a troca inteira: nada a separar
      if (mo[0].length === o.length && mq[0].length === q.length) break
      out.push({ de: pos, ate: pos + mo[0].length, por: mq[0] })
      pos += mo[0].length
      o = o.slice(mo[0].length)
      q = q.slice(mq[0].length)
      cortou = true
      break
    }
    if (!cortou || (!o && !q)) break
  }
  if (o || q) out.push({ de: pos, ate: pos + o.length, por: q })
  return out
}

/** Classifica uma edição de tipografia pelo que entra e sai. */
export function tipoDaEdicao(texto: string, e: Edicao): TipoCorrecao {
  const orig = texto.slice(e.de, e.ate)
  if (/[“”‘’]/.test(e.por)) return 'aspas'
  if (e.por.includes('…')) return 'reticencias'
  // mexe no travessão de fala ou no espaço logo depois dele
  const fala = e.de <= 2 && /^[-–—]/.test(texto)
  if (e.por.includes('—')) return fala && e.de === 0 ? 'dialogo' : 'travessao'
  if (fala && /^ *$/.test(orig) && /^ *$/.test(e.por)) return 'dialogo'
  if (!e.por && /^ +$/.test(orig) && /[,.;:!?]/.test(texto[e.ate] ?? '')) return 'pontuacao'
  return 'espacos'
}

/** Edições de tipografia de um parágrafo (posições na string). */
export function edicoesTipografia(texto: string): Array<Edicao & { tipo: TipoCorrecao }> {
  const novo = corrigirTipografia(texto)
  if (novo === texto) return []
  const es = edicoes(texto, novo) ?? []
  // segurança: nunca remove nem troca marcadores de nota/quebra
  return es.filter((e) => !/[￼\n]/.test(texto.slice(e.de, e.ate)) && !/[￼\n]/.test(e.por)).map((e) => ({ ...e, tipo: tipoDaEdicao(texto, e) }))
}

// ------------------------------------------------------------- documento

export interface Bloco {
  /** posição do início do conteúdo do parágrafo no documento */
  pos: number
  texto: string
}

/** Texto do parágrafo com uma posição por caractere (nós inline viram OBJ ou QUEBRA). */
export function textoDoBloco(node: PMNode): string {
  let s = ''
  node.forEach((ch) => {
    if (ch.isText) s += ch.text ?? ''
    else if (ch.type.name === 'hardBreak') s += QUEBRA.repeat(ch.nodeSize)
    else s += OBJ.repeat(ch.nodeSize)
  })
  return s
}

/** Parágrafos (blocos de texto) que tocam o intervalo [de, ate]. */
export function blocosNoIntervalo(doc: PMNode, de: number, ate: number): Bloco[] {
  const out: Bloco[] = []
  doc.nodesBetween(de, ate, (n, pos) => {
    if (n.isTextblock) {
      if (!n.type.spec.code) out.push({ pos: pos + 1, texto: textoDoBloco(n) })
      return false
    }
    return !n.isLeaf
  })
  return out
}

/** Intervalo do documento que cada escopo cobre (null = não se aplica agora). */
export function intervaloDoEscopo(state: EditorState, escopo: EscopoCorrecao): { de: number; ate: number } | null {
  const { selection, doc } = state
  if (escopo === 'capitulo') return { de: 0, ate: doc.content.size }
  if (escopo === 'selecao') return selection.empty ? null : { de: selection.from, ate: selection.to }
  const $p = selection.$from
  if (!$p.parent.isTextblock) return null
  return { de: $p.start(), ate: $p.end() }
}

const RAIO = 34

/** Contexto curto, sem começar ou terminar no meio de uma palavra. */
function ctx(texto: string, de: number, ate: number): { antes: string; depois: string } {
  let a = texto.slice(Math.max(0, de - RAIO), de)
  if (de - RAIO > 0) a = a.replace(/^\S*\s?/, '…')
  let d = texto.slice(ate, ate + RAIO)
  if (ate + RAIO < texto.length) d = d.replace(/\s?\S*$/, '…')
  return { antes: a, depois: d }
}

/** Correções de tipografia e espaços dentro de [de, ate], mais parágrafos vazios repetidos. */
export function correcoesLocais(doc: PMNode, de: number, ate: number): Correcao[] {
  const out: Correcao[] = []
  for (const b of blocosNoIntervalo(doc, de, ate)) {
    for (const e of edicoesTipografia(b.texto)) {
      const d0 = b.pos + e.de
      const d1 = b.pos + e.ate
      if (d0 < de || d1 > ate) continue
      out.push({ id: `${e.tipo}-${d0}-${d1}`, tipo: e.tipo, de: d0, ate: d1, original: b.texto.slice(e.de, e.ate), por: e.por, ...ctx(b.texto, e.de, e.ate) })
    }
  }
  out.push(...vaziosRepetidos(doc, de, ate))
  return out.sort((a, b) => a.de - b.de || a.ate - b.ate)
}

/** Dois ou mais parágrafos vazios seguidos: fica um. */
function vaziosRepetidos(doc: PMNode, de: number, ate: number): Correcao[] {
  const out: Correcao[] = []
  const varrer = (node: PMNode, inicio: number): void => {
    let seq: Array<{ pos: number; size: number }> = []
    const fechar = (): void => {
      if (seq.length > 1) {
        const p0 = seq[1]!.pos
        const ult = seq[seq.length - 1]!
        const p1 = ult.pos + ult.size
        if (p0 >= de && p1 <= ate) {
          const n = seq.length - 1
          out.push({ id: `vazios-${p0}-${p1}`, tipo: 'vazios', de: p0, ate: p1, original: '¶'.repeat(n), por: '', antes: '', depois: '', bloco: true, motivo: `${n} ${n === 1 ? 'parágrafo vazio' : 'parágrafos vazios'} a mais` })
        }
      }
      seq = []
    }
    node.forEach((ch, o) => {
      const p = inicio + o
      if (ch.type.name === 'paragraph' && ch.content.size === 0) {
        seq.push({ pos: p, size: ch.nodeSize })
        return
      }
      fechar()
      if (!ch.isTextblock && !ch.isLeaf) varrer(ch, p + 1)
    })
    fechar()
  }
  varrer(doc, 0)
  return out
}

// ------------------------------------------------------------- LanguageTool

/**
 * Texto simples para o LanguageTool: parágrafos separados por linha em
 * branco, notas de rodapé fora. `mapa[i]` = posição no documento do caractere
 * i (-1 para separadores e quebras).
 */
export function textoParaRevisor(blocos: Bloco[]): { texto: string; mapa: number[] } {
  let texto = ''
  const mapa: number[] = []
  blocos.forEach((b, k) => {
    if (k > 0) {
      texto += '\n\n'
      mapa.push(-1, -1)
    }
    for (let o = 0; o < b.texto.length; o++) {
      const c = b.texto[o]!
      if (c === OBJ) continue
      texto += c
      mapa.push(c === QUEBRA ? -1 : b.pos + o)
    }
  })
  return { texto, mapa }
}

/**
 * Sugestões do LanguageTool (posições no texto enviado) → correções no
 * documento. Só ficam as que caem num trecho contínuo do documento (sem nota
 * no meio), dentro de [de, ate], e cujo texto ainda é o original.
 */
export function correcoesDoRevisor(sugs: SugestaoCorrigir[], mapa: number[], doc: PMNode, de: number, ate: number): Correcao[] {
  const out: Correcao[] = []
  for (const s of sugs) {
    if (s.categoria !== 'ortografia' && s.categoria !== 'gramatica') continue
    const len = s.original.length
    if (!len || s.inicio < 0 || s.inicio + len > mapa.length) continue
    const d0 = mapa[s.inicio]!
    let ok = d0 >= 0
    for (let i = 1; ok && i < len; i++) ok = mapa[s.inicio + i] === d0 + i
    if (!ok) continue
    const d1 = d0 + len
    if (d0 < de || d1 > ate) continue
    if (doc.textBetween(d0, d1, '\n', OBJ) !== s.original) continue
    out.push({ id: `${s.categoria}-${d0}-${d1}`, tipo: s.categoria, de: d0, ate: d1, original: s.original, por: s.substituto, antes: s.antes, depois: s.depois, motivo: s.motivo })
  }
  return out
}

function cruzam(a: Correcao, b: Correcao): boolean {
  if (a.de === a.ate || b.de === b.ate) return a.de === b.de || (a.de > b.de && a.de < b.ate) || (b.de > a.de && b.de < a.ate)
  return a.de < b.ate && b.de < a.ate
}

/**
 * Junta as listas sem trechos sobrepostos: vale a primeira que chegou
 * (passe a tipografia antes do LanguageTool). Ordenada por posição.
 */
export function semSobreposicao(...listas: Correcao[][]): Correcao[] {
  const out: Correcao[] = []
  for (const l of listas) for (const c of l) if (!out.some((x) => cruzam(x, c))) out.push(c)
  return out.sort((a, b) => a.de - b.de || a.ate - b.ate)
}

/**
 * Aplica as correções numa transação só (um Ctrl+Z desfaz tudo). Vai do fim
 * para o começo, então as posições originais continuam valendo; o texto novo
 * herda as marcas do trecho que substitui.
 */
export function aplicarCorrecoes(tr: Transaction, lista: Correcao[]): Transaction {
  const ord = [...lista].sort((a, b) => b.de - a.de || b.ate - a.ate)
  for (const c of ord) {
    if (c.bloco || !c.por) {
      if (c.ate > c.de) tr.delete(c.de, c.ate)
      continue
    }
    const doc = tr.doc
    const marcas = c.de < c.ate ? (doc.nodeAt(c.de)?.marks ?? doc.resolve(c.de).marks()) : doc.resolve(c.de).marks()
    tr.replaceWith(c.de, c.ate, doc.type.schema.text(c.por, marcas))
  }
  return tr
}

/** Para mostrar: marcadores de nota e quebra legíveis. */
export function visivel(s: string): string {
  return s.replace(/￼/g, '¹').replace(/\n/g, ' ↵ ')
}
