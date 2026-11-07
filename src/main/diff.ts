import type { OpDiff, ResultadoDiff } from '../shared/versoes'

/**
 * Diff por palavra, sem dependência externa.
 *
 * Duas passadas: primeiro por parágrafo (linha), com Myers; depois, dentro de
 * cada bloco de parágrafos alterados, de novo Myers sobre palavras, espaços e
 * pontuação. Assim um capítulo inteiro custa pouco: a parte cara só roda onde
 * o texto mudou. Se um bloco mudou demais (mais de LIMITE_D edições), ele sai
 * como "parágrafo removido + parágrafo novo", sem detalhar palavra por palavra.
 */

const LIMITE_D = 4000
const TOKEN = /\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu
const PALAVRA = /[\p{L}\p{N}]/u

type Op = '=' | '-' | '+'

/** Myers O(ND). Devolve a sequência de operações sobre índices, ou null se passar de `maxD`. */
function myers(a: number[], b: number[], maxD: number): Op[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  if (max === 0) return []
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  // trace[d] guarda só a faixa k ∈ [-(d+1), d+1] de v antes do passo d
  const trace: Int32Array[] = []
  const limite = Math.min(max, maxD)
  for (let d = 0; d <= limite; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
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
    const t = trace[d]!
    const at = (k: number): number => t[k + d + 1]!
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push('=')
      x--
      y--
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push('+')
        y--
      } else {
        ops.push('-')
        x--
      }
    }
    x = prevX
    y = prevY
  }
  return ops.reverse()
}

/** Converte strings em ids inteiros (comparação rápida no Myers). */
function ids(listas: string[][]): number[][] {
  const tab = new Map<string, number>()
  return listas.map((l) =>
    l.map((s) => {
      let id = tab.get(s)
      if (id === undefined) {
        id = tab.size
        tab.set(s, id)
      }
      return id
    })
  )
}

function linhas(s: string): string[] {
  return s.length ? s.split(/(?<=\n)/) : []
}

function tokens(s: string): string[] {
  return s.match(TOKEN) ?? []
}

function aplicar(ops: Op[], a: string[], b: string[], out: OpDiff[]): void {
  let i = 0
  let j = 0
  for (const op of ops) {
    if (op === '=') {
      out.push({ t: '=', s: a[i]! })
      i++
      j++
    } else if (op === '-') out.push({ t: '-', s: a[i++]! })
    else out.push({ t: '+', s: b[j++]! })
  }
}

/** Funde operações vizinhas iguais e absorve espaços soltos entre duas mudanças (lê melhor). */
function arrumar(ops: OpDiff[]): OpDiff[] {
  const out: OpDiff[] = []
  let del = ''
  let ins = ''
  const despejar = (): void => {
    if (del) out.push({ t: '-', s: del })
    if (ins) out.push({ t: '+', s: ins })
    del = ''
    ins = ''
  }
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!
    if (o.t === '-') del += o.s
    else if (o.t === '+') ins += o.s
    else {
      const prox = ops[i + 1]
      const entreMudancas = (del || ins) && prox && prox.t !== '=' && /^[ \t]+$/.test(o.s)
      if (entreMudancas) {
        del += o.s
        ins += o.s
        continue
      }
      despejar()
      const ult = out.at(-1)
      if (ult && ult.t === '=') ult.s += o.s
      else out.push({ t: '=', s: o.s })
    }
  }
  despejar()
  return out
}

function contar(s: string): number {
  return tokens(s).filter((t) => PALAVRA.test(t)).length
}

/** Diff por palavra de `antes` para `depois`. */
export function diffPalavras(antes: string, depois: string): ResultadoDiff {
  const la = linhas(antes)
  const lb = linhas(depois)
  const [ia, ib] = ids([la, lb])
  const opsLinhas = myers(ia!, ib!, LIMITE_D)
  let porPalavra = true
  const bruto: OpDiff[] = []

  if (!opsLinhas) {
    porPalavra = false
    if (antes) bruto.push({ t: '-', s: antes })
    if (depois) bruto.push({ t: '+', s: depois })
  } else {
    let i = 0
    let j = 0
    let k = 0
    while (k < opsLinhas.length) {
      if (opsLinhas[k] === '=') {
        bruto.push({ t: '=', s: la[i]! })
        i++
        j++
        k++
        continue
      }
      // bloco de parágrafos alterados: junta e compara por palavra
      let del = ''
      let ins = ''
      while (k < opsLinhas.length && opsLinhas[k] !== '=') {
        if (opsLinhas[k] === '-') del += la[i++]!
        else ins += lb[j++]!
        k++
      }
      const ta = tokens(del)
      const tb = tokens(ins)
      const [xa, xb] = ids([ta, tb])
      const ops = ta.length + tb.length > 400_000 ? null : myers(xa!, xb!, LIMITE_D)
      if (ops) aplicar(ops, ta, tb, bruto)
      else {
        porPalavra = false
        if (del) bruto.push({ t: '-', s: del })
        if (ins) bruto.push({ t: '+', s: ins })
      }
    }
  }

  const ops = arrumar(bruto)
  let adicionadas = 0
  let removidas = 0
  for (const o of ops) {
    if (o.t === '+') adicionadas += contar(o.s)
    else if (o.t === '-') removidas += contar(o.s)
  }
  return { ops, adicionadas, removidas, porPalavra }
}
