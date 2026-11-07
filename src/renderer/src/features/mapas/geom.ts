import { LAGO, MAR, TERRA, type Ponto, type Simbolo, type Terreno } from './types'

/** Id compatível com o armazenamento ([a-z0-9-]). */
export function novoId(prefixo = ''): string {
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefixo}${prefixo ? '-' : ''}${Date.now().toString(36)}-${r}`
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const f1 = (n: number): string => (Math.round(n * 10) / 10).toString()

// ---------------------------------------------------------------------------
// grade do terreno (run-length)
// ---------------------------------------------------------------------------

export function decodeGrade(t: Terreno): Uint8Array {
  const g = new Uint8Array(t.cols * t.rows)
  if (!t.rle) return g
  let i = 0
  for (const run of t.rle.split(',')) {
    const [v, n] = run.split(':')
    const val = Number(v)
    const len = Number(n)
    if (!Number.isFinite(val) || !Number.isFinite(len)) continue
    g.fill(val, i, Math.min(g.length, i + len))
    i += len
  }
  return g
}

export function encodeGrade(g: Uint8Array): string {
  if (g.length === 0) return ''
  const out: string[] = []
  let cur = g[0] ?? 0
  let n = 0
  for (let i = 0; i < g.length; i++) {
    const v = g[i] ?? 0
    if (v === cur) n++
    else {
      out.push(`${cur}:${n}`)
      cur = v
      n = 1
    }
  }
  out.push(`${cur}:${n}`)
  return out.join(',')
}

export function terrenoVazio(largura: number, altura: number, cel = 8): Terreno {
  const cols = Math.ceil(largura / cel)
  const rows = Math.ceil(altura / cel)
  return { cel, cols, rows, rle: `0:${cols * rows}`, rugosidade: 0.5, semente: Math.floor(Math.random() * 1e6) }
}

export type Pincel = 'terra' | 'mar' | 'lago' | 'secar'

/**
 * Pinta um disco na grade. 'terra' cria terra (inclusive sobre lagos), 'mar' apaga
 * para mar, 'lago' põe água doce só sobre terra e 'secar' devolve lago a terra.
 * Devolve true se algo mudou.
 */
export function pintar(g: Uint8Array, t: Terreno, x: number, y: number, raio: number, modo: Pincel): boolean {
  const cx = x / t.cel - 0.5
  const cy = y / t.cel - 0.5
  const r = raio / t.cel
  const r2 = r * r
  let mudou = false
  const i0 = Math.max(0, Math.floor(cx - r))
  const i1 = Math.min(t.cols - 1, Math.ceil(cx + r))
  const j0 = Math.max(0, Math.floor(cy - r))
  const j1 = Math.min(t.rows - 1, Math.ceil(cy + r))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx
      const dy = j - cy
      if (dx * dx + dy * dy > r2) continue
      const k = j * t.cols + i
      const v = g[k]
      let nv = v
      if (modo === 'terra') nv = TERRA
      else if (modo === 'mar') nv = MAR
      else if (modo === 'lago') nv = v === TERRA ? LAGO : v
      else if (modo === 'secar') nv = v === LAGO ? TERRA : v
      if (nv !== v && nv !== undefined) {
        g[k] = nv
        mudou = true
      }
    }
  }
  return mudou
}

/** Pinta ao longo de um segmento (traço contínuo mesmo com o mouse rápido). */
export function pintarSegmento(g: Uint8Array, t: Terreno, a: Ponto, b: Ponto, raio: number, modo: Pincel): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const passos = Math.max(1, Math.ceil(d / Math.max(2, raio * 0.35)))
  let mudou = false
  for (let s = 1; s <= passos; s++) {
    const u = s / passos
    if (pintar(g, t, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, raio, modo)) mudou = true
  }
  return mudou
}

// ---------------------------------------------------------------------------
// campos escalares e ruído
// ---------------------------------------------------------------------------

/** Campo com borda de 1 célula (sempre 0), para que os contornos fechem. */
export interface Campo {
  w: number
  h: number
  v: Float32Array
}

function hash(i: number, j: number, s: number): number {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Ruído de valor 2D determinístico, 0..1. */
export function ruido(x: number, y: number, semente: number): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = smooth(x - i)
  const fy = smooth(y - j)
  const a = hash(i, j, semente)
  const b = hash(i + 1, j, semente)
  const c = hash(i, j + 1, semente)
  const d = hash(i + 1, j + 1, semente)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function fbm(x: number, y: number, semente: number): number {
  return ruido(x, y, semente) * 0.55 + ruido(x * 2.1, y * 2.1, semente + 7) * 0.3 + ruido(x * 4.3, y * 4.3, semente + 13) * 0.15
}

function blur(c: Campo): void {
  const { w, h, v } = c
  const tmp = new Float32Array(v.length)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const l = v[j * w + Math.max(0, i - 1)] ?? 0
      const m = v[j * w + i] ?? 0
      const r = v[j * w + Math.min(w - 1, i + 1)] ?? 0
      tmp[j * w + i] = (l + 2 * m + r) / 4
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = tmp[Math.max(0, j - 1) * w + i] ?? 0
      const m = tmp[j * w + i] ?? 0
      const d = tmp[Math.min(h - 1, j + 1) * w + i] ?? 0
      v[j * w + i] = (u + 2 * m + d) / 4
    }
  }
  // borda sempre 0
  for (let i = 0; i < w; i++) {
    v[i] = 0
    v[(h - 1) * w + i] = 0
  }
  for (let j = 0; j < h; j++) {
    v[j * w] = 0
    v[j * w + w - 1] = 0
  }
}

/** Campo 0..1 de uma classe de célula, suavizado e com ruído de costa. */
export function campoDe(g: Uint8Array, t: Terreno, valor: number, comRuido: boolean): Campo {
  const w = t.cols + 2
  const h = t.rows + 2
  const v = new Float32Array(w * h)
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      if (g[j * t.cols + i] === valor) v[(j + 1) * w + i + 1] = 1
    }
  }
  const c = { w, h, v }
  blur(c)
  blur(c)
  if (comRuido) blur(c)
  if (comRuido && t.rugosidade > 0) {
    const amp = t.rugosidade * 0.95
    const esc = 0.19
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i
        const x = v[k] ?? 0
        // só perto da costa, para não abrir buracos no interior
        if (x > 0.01 && x < 0.99) v[k] = x + (fbm(i * esc, j * esc, t.semente) - 0.5) * amp
      }
    }
  }
  return c
}

/** Distância (em células) até a água mais próxima, para cada célula de terra. */
export function distanciaAgua(g: Uint8Array, t: Terreno): Int16Array {
  const n = t.cols * t.rows
  const d = new Int16Array(n).fill(-1)
  const fila = new Int32Array(n)
  let ini = 0
  let fim = 0
  for (let k = 0; k < n; k++) {
    if (g[k] !== TERRA) {
      d[k] = 0
      fila[fim++] = k
    }
  }
  while (ini < fim) {
    const k = fila[ini++] ?? 0
    const i = k % t.cols
    const j = (k - i) / t.cols
    const dk = d[k] ?? 0
    const viz = [i > 0 ? k - 1 : -1, i < t.cols - 1 ? k + 1 : -1, j > 0 ? k - t.cols : -1, j < t.rows - 1 ? k + t.cols : -1]
    for (const q of viz) {
      if (q >= 0 && d[q] === -1) {
        d[q] = dk + 1
        fila[fim++] = q
      }
    }
  }
  // grade toda de terra (sem água): usa a distância até a borda
  for (let k = 0; k < n; k++) {
    if (d[k] === -1) {
      const i = k % t.cols
      const j = (k - i) / t.cols
      d[k] = Math.min(i, j, t.cols - 1 - i, t.rows - 1 - j) + 1
    }
  }
  return d
}

/** Influência gaussiana de símbolos sobre a grade (para relevo e biomas). */
export function campoInfluencia(t: Terreno, simbolos: Simbolo[], sigmaCel: number, peso: (s: Simbolo) => number): Float32Array {
  const out = new Float32Array(t.cols * t.rows)
  for (const s of simbolos) {
    const cx = s.x / t.cel - 0.5
    const cy = s.y / t.cel - 0.5
    const sg = sigmaCel * Math.max(0.5, s.escala)
    const r = Math.ceil(sg * 3)
    const p = peso(s)
    const i0 = Math.max(0, Math.floor(cx - r))
    const i1 = Math.min(t.cols - 1, Math.ceil(cx + r))
    const j0 = Math.max(0, Math.floor(cy - r))
    const j1 = Math.min(t.rows - 1, Math.ceil(cy + r))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i - cx
        const dy = j - cy
        const k = j * t.cols + i
        out[k] = (out[k] ?? 0) + p * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg))
      }
    }
  }
  return out
}

/** Constrói um campo com borda a partir de valores por célula. */
export function campoGrade(t: Terreno, val: (k: number) => number, suavizar = 1): Campo {
  const w = t.cols + 2
  const h = t.rows + 2
  const v = new Float32Array(w * h)
  for (let j = 0; j < t.rows; j++) for (let i = 0; i < t.cols; i++) v[(j + 1) * w + i + 1] = val(j * t.cols + i)
  const c = { w, h, v }
  for (let s = 0; s < suavizar; s++) blur(c)
  return c
}

// ---------------------------------------------------------------------------
// marching squares → contornos fechados → path suavizado
// ---------------------------------------------------------------------------

/** Contornos fechados (em coordenadas do mapa) do nível `limiar` do campo. */
export function contornos(c: Campo, limiar: number, cel: number): Ponto[][] {
  const { w, h, v } = c
  const at = (i: number, j: number): number => v[j * w + i] ?? 0
  const hE = (i: number, j: number): number => (j * w + i) * 2
  const vE = (i: number, j: number): number => (j * w + i) * 2 + 1
  const pontoAresta = new Map<number, Ponto>()
  const toMapa = (i: number, j: number): Ponto => ({ x: (i - 0.5) * cel, y: (j - 0.5) * cel })
  const ponto = (e: number): Ponto => {
    const p = pontoAresta.get(e)
    if (p) return p
    const base = e >> 1
    const i = base % w
    const j = (base - i) / w
    let q: Ponto
    if ((e & 1) === 0) {
      const a = at(i, j)
      const b = at(i + 1, j)
      const u = b === a ? 0.5 : (limiar - a) / (b - a)
      q = toMapa(i + u, j)
    } else {
      const a = at(i, j)
      const b = at(i, j + 1)
      const u = b === a ? 0.5 : (limiar - a) / (b - a)
      q = toMapa(i, j + u)
    }
    pontoAresta.set(e, q)
    return q
  }
  const segA: number[] = []
  const segB: number[] = []
  const add = (a: number, b: number): void => {
    segA.push(a)
    segB.push(b)
  }
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const tl = at(i, j) >= limiar ? 1 : 0
      const tr = at(i + 1, j) >= limiar ? 1 : 0
      const br = at(i + 1, j + 1) >= limiar ? 1 : 0
      const bl = at(i, j + 1) >= limiar ? 1 : 0
      const caso = tl * 8 + tr * 4 + br * 2 + bl
      if (caso === 0 || caso === 15) continue
      const T = hE(i, j)
      const B = hE(i, j + 1)
      const L = vE(i, j)
      const R = vE(i + 1, j)
      switch (caso) {
        case 1: case 14: add(L, B); break
        case 2: case 13: add(B, R); break
        case 3: case 12: add(L, R); break
        case 4: case 11: add(T, R); break
        case 6: case 9: add(T, B); break
        case 7: case 8: add(L, T); break
        case 5: case 10: {
          const centro = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 >= limiar
          if ((caso === 5) === centro) {
            add(L, T)
            add(B, R)
          } else {
            add(T, R)
            add(L, B)
          }
          break
        }
      }
    }
  }
  const porAresta = new Map<number, number[]>()
  for (let s = 0; s < segA.length; s++) {
    for (const e of [segA[s] ?? 0, segB[s] ?? 0]) {
      const l = porAresta.get(e)
      if (l) l.push(s)
      else porAresta.set(e, [s])
    }
  }
  const usado = new Uint8Array(segA.length)
  const out: Ponto[][] = []
  for (let s0 = 0; s0 < segA.length; s0++) {
    if (usado[s0]) continue
    usado[s0] = 1
    const anel: Ponto[] = [ponto(segA[s0] ?? 0)]
    let e = segB[s0] ?? 0
    const inicio = segA[s0] ?? 0
    for (let guarda = 0; guarda < segA.length + 2; guarda++) {
      if (e === inicio) break
      anel.push(ponto(e))
      const prox = (porAresta.get(e) ?? []).find((q) => !usado[q])
      if (prox === undefined) break
      usado[prox] = 1
      e = segA[prox] === e ? (segB[prox] ?? 0) : (segA[prox] ?? 0)
    }
    if (anel.length >= 4) out.push(anel)
  }
  return out
}

/** Path fechado suavizado (curvas quadráticas pelos pontos médios). */
export function pathFechado(aneis: Ponto[][]): string {
  const partes: string[] = []
  for (const a of aneis) {
    const n = a.length
    if (n < 3) continue
    const m = (k: number): Ponto => {
      const p = a[k % n] as Ponto
      const q = a[(k + 1) % n] as Ponto
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    }
    const m0 = m(0)
    let d = `M${f1(m0.x)} ${f1(m0.y)}`
    for (let k = 1; k <= n; k++) {
      const p = a[k % n] as Ponto
      const mk = m(k)
      d += `Q${f1(p.x)} ${f1(p.y)} ${f1(mk.x)} ${f1(mk.y)}`
    }
    partes.push(d + 'Z')
  }
  return partes.join('')
}

/** Path aberto suavizado. */
export function pathAberto(p: Ponto[]): string {
  if (p.length === 0) return ''
  const a = p[0] as Ponto
  if (p.length === 1) return `M${f1(a.x)} ${f1(a.y)}`
  if (p.length === 2) {
    const b = p[1] as Ponto
    return `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`
  }
  let d = `M${f1(a.x)} ${f1(a.y)}`
  for (let k = 1; k < p.length - 1; k++) {
    const q = p[k] as Ponto
    const r = p[k + 1] as Ponto
    const mx = (q.x + r.x) / 2
    const my = (q.y + r.y) / 2
    d += k === p.length - 2 ? `Q${f1(q.x)} ${f1(q.y)} ${f1(r.x)} ${f1(r.y)}` : `Q${f1(q.x)} ${f1(q.y)} ${f1(mx)} ${f1(my)}`
  }
  return d
}

/** Amostra densa de uma Catmull-Rom pelos pontos. */
export function amostrar(p: Ponto[], porSegmento = 8): Ponto[] {
  if (p.length < 3) return p.slice()
  const out: Ponto[] = []
  for (let k = 0; k < p.length - 1; k++) {
    const p0 = p[Math.max(0, k - 1)] as Ponto
    const p1 = p[k] as Ponto
    const p2 = p[k + 1] as Ponto
    const p3 = p[Math.min(p.length - 1, k + 2)] as Ponto
    for (let s = 0; s < porSegmento; s++) {
      const t = s / porSegmento
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      })
    }
  }
  out.push(p[p.length - 1] as Ponto)
  return out
}

/** Contorno de um rio que engrossa da nascente (fina) à foz (`largura`). */
export function pathRio(p: Ponto[], largura: number): string {
  const s = amostrar(p, 6)
  if (s.length < 2) return ''
  const esq: Ponto[] = []
  const dir: Ponto[] = []
  for (let k = 0; k < s.length; k++) {
    const a = s[Math.max(0, k - 1)] as Ponto
    const b = s[Math.min(s.length - 1, k + 1)] as Ponto
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const u = k / (s.length - 1)
    const w = (largura * (0.18 + 0.82 * Math.pow(u, 0.8))) / 2
    const c = s[k] as Ponto
    esq.push({ x: c.x + nx * w, y: c.y + ny * w })
    dir.push({ x: c.x - nx * w, y: c.y - ny * w })
  }
  const pts = [...esq, ...dir.reverse()]
  let d = `M${f1((pts[0] as Ponto).x)} ${f1((pts[0] as Ponto).y)}`
  for (let k = 1; k < pts.length; k++) d += `L${f1((pts[k] as Ponto).x)} ${f1((pts[k] as Ponto).y)}`
  return d + 'Z'
}

/** Reduz pontos muito próximos (traço à mão livre). */
export function simplificar(p: Ponto[], dist: number): Ponto[] {
  if (p.length < 3) return p.slice()
  const out: Ponto[] = [p[0] as Ponto]
  for (let k = 1; k < p.length - 1; k++) {
    const q = p[k] as Ponto
    const u = out[out.length - 1] as Ponto
    if (Math.hypot(q.x - u.x, q.y - u.y) >= dist) out.push(q)
  }
  out.push(p[p.length - 1] as Ponto)
  return out
}

export function distPolilinha(p: Ponto[], x: number, y: number): number {
  let best = Infinity
  for (let k = 0; k < p.length - 1; k++) {
    const a = p[k] as Ponto
    const b = p[k + 1] as Ponto
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1)
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y))
  }
  if (p.length === 1) best = Math.hypot((p[0] as Ponto).x - x, (p[0] as Ponto).y - y)
  return best
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
