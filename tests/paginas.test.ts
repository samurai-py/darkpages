import { describe, expect, it } from 'vitest'
import { calibrarPalavrasPorPagina, impressaoLayout, paginasCapitulo, paginasModelo, palavrasPorPagina } from '../src/shared/paginas'
import { DEFAULT_LAYOUT } from '../src/shared/types'

describe('estimativa de páginas', () => {
  it('sem calibração usa a fórmula do layout', () => {
    const ppp = palavrasPorPagina(DEFAULT_LAYOUT)
    expect(paginasCapitulo(1000, DEFAULT_LAYOUT)).toBe(Math.ceil(1000 / ppp + 0.35))
    expect(paginasCapitulo(1000, DEFAULT_LAYOUT, null)).toBe(paginasCapitulo(1000, DEFAULT_LAYOUT))
  })
  it('com calibração usa as palavras por página medidas', () => {
    expect(paginasCapitulo(1000, DEFAULT_LAYOUT, 250)).toBe(5) // ⌈4 + 0,35⌉
    expect(paginasCapitulo(0, DEFAULT_LAYOUT, 250)).toBe(1)
  })
})

describe('calibrarPalavrasPorPagina', () => {
  it('recupera o ppp que gerou a paginação', () => {
    const caps = [3200, 4100, 2900, 5000, 3600]
    const real = paginasModelo(caps, 270)
    const ppp = calibrarPalavrasPorPagina(caps, real)!
    expect(paginasModelo(caps, ppp)).toBe(real)
    // é o menor ppp que não passa do real: um pouco menos já dá mais páginas
    expect(paginasModelo(caps, ppp - 0.2)).toBeGreaterThan(real)
  })
  it('mais páginas reais → menos palavras por página', () => {
    const caps = [3000, 3000, 3000]
    expect(calibrarPalavrasPorPagina(caps, 40)!).toBeLessThan(calibrarPalavrasPorPagina(caps, 30)!)
  })
  it('impossível ou vazio → null', () => {
    expect(calibrarPalavrasPorPagina([3000, 3000, 3000], 2)).toBeNull() // menos páginas que capítulos
    expect(calibrarPalavrasPorPagina([], 10)).toBeNull()
    expect(calibrarPalavrasPorPagina([0, 0], 10)).toBeNull()
    expect(calibrarPalavrasPorPagina([1000], 0)).toBeNull()
  })
})

describe('impressaoLayout', () => {
  it('é estável à ordem das chaves e muda com o layout', () => {
    const a = impressaoLayout(DEFAULT_LAYOUT)
    const invertido = Object.fromEntries(Object.entries(DEFAULT_LAYOUT).reverse()) as typeof DEFAULT_LAYOUT
    expect(impressaoLayout(invertido)).toBe(a)
    expect(impressaoLayout({ ...DEFAULT_LAYOUT, bodyPt: DEFAULT_LAYOUT.bodyPt + 1 })).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
  })
})
