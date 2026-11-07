import type { Glifo, PontoGlifo } from './model'

/** Caminho SVG de um traço: ponto de controle entre dois pontos vira curva quadrática. */
export function tracoD(t: PontoGlifo[]): string {
  if (!t.length) return ''
  const [x0, y0] = t[0] as PontoGlifo
  if (t.length === 1) return `M${x0} ${y0}l0.001 0`
  let d = `M${x0} ${y0}`
  for (let i = 1; i < t.length; i++) {
    const p = t[i] as PontoGlifo
    const prox = t[i + 1]
    if (p[2] === 1 && prox && prox[2] !== 1) {
      d += `Q${p[0]} ${p[1]} ${prox[0]} ${prox[1]}`
      i++
    } else d += `L${p[0]} ${p[1]}`
  }
  return d
}

export function glifoD(g: Glifo): string {
  return g.tracos.map(tracoD).filter(Boolean).join(' ')
}

/** Limites horizontais do desenho (para espaçar glifos na prévia). */
export function largura(g: Glifo | undefined): { min: number; max: number } {
  const xs = g?.tracos.flat().map((p) => p[0]) ?? []
  if (!xs.length) return { min: 6, max: 18 }
  return { min: Math.min(...xs), max: Math.max(...xs) }
}

export type Peca = { tipo: 'glifo'; chave: string } | { tipo: 'falta'; texto: string } | { tipo: 'espaco' } | { tipo: 'sinal'; texto: string }

/** Quebra texto romanizado em glifos pelo casamento mais longo (dígrafos primeiro). */
export function emGlifos(texto: string, glifos: Record<string, Glifo>): Peca[] {
  const chaves = Object.keys(glifos).sort((a, b) => b.length - a.length)
  const out: Peca[] = []
  const w = texto.toLowerCase()
  let i = 0
  while (i < w.length) {
    const ch = w[i] as string
    if (/\s/.test(ch)) {
      if (out[out.length - 1]?.tipo !== 'espaco') out.push({ tipo: 'espaco' })
      i++
      continue
    }
    const k = chaves.find((c) => w.startsWith(c, i))
    if (k) {
      out.push({ tipo: 'glifo', chave: k })
      i += k.length
    } else if (/\p{L}/u.test(ch)) {
      out.push({ tipo: 'falta', texto: texto[i] as string })
      i++
    } else {
      out.push({ tipo: 'sinal', texto: texto[i] as string })
      i++
    }
  }
  return out
}
