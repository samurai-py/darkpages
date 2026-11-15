import { describe, expect, it } from 'vitest'
import { metasEfetivas, somaPlanejada } from '../src/shared/metas'

const cap = (id: string, words: number, kind: 'capitulo' | 'parte' | 'prologo' = 'capitulo') => ({ id, kind, words })

describe('metas por capítulo com remanejamento', () => {
  it('sem capítulo pronto, tudo vale a meta planejada', () => {
    const m = metasEfetivas([cap('a', 500), cap('b', 0)], 3000, { b: { meta: 10000 } })
    expect(m.get('a')).toMatchObject({ planejada: 3000, efetiva: 3000, ajuste: 0 })
    expect(m.get('b')).toMatchObject({ planejada: 10000, efetiva: 10000 })
  })

  it('pronto com 7 mil de 10 mil: os 3 mil que faltaram vão para os próximos, em proporção', () => {
    const m = metasEfetivas(
      [cap('a', 7000), cap('b', 0), cap('c', 0), cap('d', 0)],
      3000,
      { a: { meta: 10000, pronto: true }, c: { meta: 6000 } }
    )
    // abertos: b=3000, c=6000, d=3000 (soma 12000) → +750, +1500, +750
    expect(m.get('a')).toMatchObject({ planejada: 10000, efetiva: 10000, pronto: true })
    expect(m.get('b')!.efetiva).toBe(3750)
    expect(m.get('c')!.efetiva).toBe(7500)
    expect(m.get('d')!.efetiva).toBe(3750)
    // a soma das metas do livro se mantém
    const soma = [...m.values()].reduce((s, x) => s + (x.pronto ? 7000 : x.efetiva), 0)
    expect(soma).toBe(10000 + 3000 + 6000 + 3000)
  })

  it('passou da meta: os próximos ficam com meta menor', () => {
    const m = metasEfetivas([cap('a', 4000), cap('b', 0), cap('c', 0)], 3000, { a: { pronto: true } })
    expect(m.get('b')!.efetiva).toBe(2500)
    expect(m.get('c')!.efetiva).toBe(2500)
    expect(m.get('b')!.ajuste).toBe(-500)
  })

  it('só os capítulos depois do pronto mudam; partes são ignoradas', () => {
    const m = metasEfetivas([cap('a', 0), cap('p', 0, 'parte'), cap('b', 1000), cap('c', 0)], 3000, { b: { pronto: true } })
    expect(m.has('p')).toBe(false)
    expect(m.get('a')!.efetiva).toBe(3000)
    expect(m.get('c')!.efetiva).toBe(5000)
  })

  it('pronto no último capítulo, ou com tudo seguinte pronto: nada a repartir', () => {
    const m = metasEfetivas([cap('a', 3000), cap('b', 1000)], 3000, { b: { pronto: true } })
    expect(m.get('a')!.efetiva).toBe(3000)
  })

  it('a meta nunca fica negativa', () => {
    const m = metasEfetivas([cap('a', 20000), cap('b', 0)], 3000, { a: { pronto: true } })
    expect(m.get('b')!.efetiva).toBe(0)
  })

  it('soma das metas planejadas', () => {
    expect(somaPlanejada([cap('a', 0), cap('p', 0, 'parte'), cap('b', 0)], 3000, { b: { meta: 10000 } })).toBe(13000)
  })

  it('editar de novo um capítulo pronto reajusta os seguintes; reabrir devolve a meta original', () => {
    const porCap = { a: { meta: 10000, pronto: true } }
    const com = (palavras: number, mc: Record<string, { meta?: number; pronto?: boolean }>) =>
      metasEfetivas([cap('a', palavras), cap('b', 0)], 3000, mc).get('b')!.efetiva
    expect(com(7000, porCap)).toBe(6000) // faltaram 3 mil: vão todos para b
    expect(com(8500, porCap)).toBe(4500) // escreveu mais: o saldo encolhe sozinho
    expect(com(7000, { a: { meta: 10000 } })).toBe(3000) // reaberto: volta ao planejado
  })
})
