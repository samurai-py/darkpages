import { grafia, type Lingua } from './model'

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash FNV-1a de 32 bits (semente estável a partir de uma palavra). */
export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export interface Slot {
  tipo: 'C' | 'V'
  opcional: boolean
}

/** "(C)V(C)" → [C?, V, C?]. Aceita C e V soltos e grupos entre parênteses ("(CC)"). */
export function parsePadrao(padrao: string): Slot[] {
  const out: Slot[] = []
  let dentro = false
  for (const ch of padrao.toUpperCase()) {
    if (ch === '(') dentro = true
    else if (ch === ')') dentro = false
    else if (ch === 'C' || ch === 'V') out.push({ tipo: ch, opcional: dentro })
  }
  if (!out.some((s) => s.tipo === 'V')) out.push({ tipo: 'V', opcional: false })
  return out
}

export function padraoValido(padrao: string): boolean {
  return /^[\s()CVcv]+$/.test(padrao) && /[Vv]/.test(padrao) && (padrao.match(/\(/g)?.length ?? 0) === (padrao.match(/\)/g)?.length ?? 0)
}

/** Separa uma palavra em fonemas do inventário, pelo casamento mais longo. */
export function fonemasDe(palavra: string, inventario: string[]): string[] {
  const inv = [...inventario].filter(Boolean).sort((a, b) => b.length - a.length)
  const out: string[] = []
  let i = 0
  const w = palavra.toLowerCase()
  while (i < w.length) {
    const f = inv.find((p) => w.startsWith(p.toLowerCase(), i))
    if (f) {
      out.push(f)
      i += f.length
    } else {
      out.push(w[i] as string)
      i++
    }
  }
  return out
}

function escolher<T>(itens: T[], peso: (t: T) => number, r: () => number): T | undefined {
  const pesos = itens.map((t) => Math.max(0, peso(t)))
  const total = pesos.reduce((s, p) => s + p, 0)
  if (total <= 0) return itens[Math.floor(r() * itens.length)]
  let x = r() * total
  for (let i = 0; i < itens.length; i++) {
    x -= pesos[i] as number
    if (x < 0) return itens[i]
  }
  return itens[itens.length - 1]
}

/** Confere uma sequência de fonemas contra as proibições. Devolve a primeira violação ou null. */
export function violacao(l: Lingua, fonemas: string[]): string | null {
  for (const p of l.regras.proibicoes) {
    if (!p.fonema) continue
    if (p.posicao === 'inicio' && fonemas[0] === p.fonema) return `“${p.fonema}” não pode iniciar palavra`
    if (p.posicao === 'fim' && fonemas[fonemas.length - 1] === p.fonema) return `“${p.fonema}” não pode terminar palavra`
    if (p.posicao === 'qualquer' && fonemas.includes(p.fonema)) return `“${p.fonema}” está proibido`
  }
  return null
}

/** Confere uma palavra romanizada (sílabas não são checadas; só inventário e proibições). */
export function checarPalavra(l: Lingua, termo: string): string | null {
  const inv = [...l.consoantes, ...l.vogais]
  const romanToFonema = new Map(inv.map((f) => [grafia(l, f).toLowerCase(), f]))
  const fs = fonemasDe(termo, [...romanToFonema.keys()]).map((g) => romanToFonema.get(g) ?? g)
  const fora = fs.filter((f) => !inv.includes(f) && /\p{L}/u.test(f))
  if (fora.length) return `fora do inventário: ${[...new Set(fora)].join(', ')}`
  return violacao(l, fs)
}

function silaba(l: Lingua, slots: Slot[], r: () => number): string[] {
  const peso = (f: string): number => l.regras.pesos[f] ?? 1
  const out: string[] = []
  let i = 0
  while (i < slots.length) {
    const s = slots[i] as Slot
    // grupo de consoantes consecutivas
    if (s.tipo === 'C') {
      let j = i
      const grupo: Slot[] = []
      while (j < slots.length && (slots[j] as Slot).tipo === 'C') grupo.push(slots[j++] as Slot)
      const escolhidos = grupo.filter((g) => !g.opcional || r() < 0.5).length
      if (escolhidos >= 2 && l.regras.clusters.length) {
        const cl = escolher(l.regras.clusters, () => 1, r) ?? ''
        out.push(...fonemasDe(cl, l.consoantes))
      } else {
        for (let k = 0; k < escolhidos; k++) {
          const c = escolher(l.consoantes, peso, r)
          if (c) out.push(c)
        }
      }
      i = j
      continue
    }
    if (!s.opcional || r() < 0.5) {
      const v = escolher(l.vogais, peso, r)
      if (v) out.push(v)
    }
    i++
  }
  return out
}

/** Gera uma palavra (lista de fonemas) respeitando padrão silábico e proibições. */
export function gerarFonemas(l: Lingua, r: () => number, nSilabas: number): string[] {
  const slots = parsePadrao(l.padraoSilaba)
  if (!l.vogais.length) return []
  let melhor: string[] = []
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    const fs: string[] = []
    for (let s = 0; s < nSilabas; s++) fs.push(...silaba(l, slots, r))
    // evita o mesmo fonema três vezes seguidas
    const triplo = fs.some((f, i) => i >= 2 && f === fs[i - 1] && f === fs[i - 2])
    if (!triplo && !violacao(l, fs)) return fs
    melhor = fs
  }
  // último recurso: remove fonemas proibidos nas pontas
  while (melhor.length > 1 && violacao(l, melhor)) {
    const v = l.regras.proibicoes.find((p) => p.posicao === 'fim' && melhor[melhor.length - 1] === p.fonema)
    if (v) melhor = melhor.slice(0, -1)
    else melhor = melhor.slice(1)
  }
  return melhor
}

export function romanizar(l: Lingua, fonemas: string[]): string {
  return fonemas.map((f) => grafia(l, f)).join('')
}

/** Lista de palavras do gerador para a semente atual (determinística). */
export function gerarPalavras(l: Lingua): string[] {
  const { semente, quantidade, silabasMin, silabasMax } = l.gerador
  const r = rng(semente)
  const min = Math.max(1, Math.min(silabasMin, silabasMax))
  const max = Math.max(min, silabasMax)
  const existentes = new Set(l.lexico.map((e) => e.termo.toLowerCase()))
  const out: string[] = []
  const vistos = new Set<string>()
  for (let i = 0; out.length < quantidade && i < quantidade * 8; i++) {
    const n = min + Math.floor(r() * (max - min + 1))
    const w = romanizar(l, gerarFonemas(l, r, n))
    if (!w || vistos.has(w) || existentes.has(w)) continue
    vistos.add(w)
    out.push(w)
  }
  return out
}

/** Termo novo e estável para uma palavra do português sem tradução. */
export function termoPara(l: Lingua, pt: string, ocupados: Set<string>): string {
  const base = pt.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const n = base.length <= 3 ? 1 : base.length <= 7 ? 2 : 3
  for (let k = 0; k < 20; k++) {
    const r = rng(hash(`${l.id}:${base}:${k}`))
    const w = romanizar(l, gerarFonemas(l, r, n))
    if (w && !ocupados.has(w.toLowerCase())) return w
  }
  return romanizar(l, gerarFonemas(l, rng(hash(base)), n + 1))
}
