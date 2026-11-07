import { describe, expect, it } from 'vitest'
import { DEFAULT_ROTULO, extenso, numerarCapitulos, ordinal, resolveRotulo, romano, rotuloCapitulo, rotuloDe, rotuloTela, type RotuloCfg } from '../src/shared/rotulo'

const cfg = (p: Partial<RotuloCfg>): RotuloCfg => ({ ...DEFAULT_ROTULO, ...p })

describe('extenso', () => {
  it('unidades, dezenas e centenas com concordância', () => {
    expect(extenso(1)).toBe('um')
    expect(extenso(1, 'f')).toBe('uma')
    expect(extenso(15)).toBe('quinze')
    expect(extenso(21, 'f')).toBe('vinte e uma')
    expect(extenso(100)).toBe('cem')
    expect(extenso(101)).toBe('cento e um')
    expect(extenso(200, 'f')).toBe('duzentas')
    expect(extenso(342)).toBe('trezentos e quarenta e dois')
  })
  it('fora da faixa devolve o algarismo', () => {
    expect(extenso(1000)).toBe('1000')
    expect(extenso(-1)).toBe('-1')
  })
})

describe('ordinal e romano', () => {
  it('ordinal com gênero', () => {
    expect(ordinal(1)).toBe('primeiro')
    expect(ordinal(112, 'f')).toBe('centésima décima segunda')
    expect(ordinal(0)).toBe('0º')
  })
  it('romano', () => {
    expect(romano(4)).toBe('IV')
    expect(romano(1994)).toBe('MCMXCIV')
    expect(romano(0)).toBe('0')
  })
})

describe('rotuloCapitulo', () => {
  it('padrão: Capítulo 1 em maiúsculas', () => {
    expect(rotuloCapitulo(1, DEFAULT_ROTULO)).toBe('CAPÍTULO 1')
  })
  it('estilos', () => {
    expect(rotuloCapitulo(3, cfg({ estilo: 'classico-extenso', caixa: 'normal' }))).toBe('Capítulo três')
    expect(rotuloCapitulo(2, cfg({ estilo: 'ordinal-palavra', palavra: 'Círculo', caixa: 'normal' }))).toBe('Segundo Círculo')
    expect(rotuloCapitulo(2, cfg({ estilo: 'ordinal-palavra', palavra: 'Parte', genero: 'f', caixa: 'normal' }))).toBe('Segunda Parte')
    expect(rotuloCapitulo(9, cfg({ estilo: 'romano-palavra', palavra: 'Livro', caixa: 'normal' }))).toBe('Livro IX')
    expect(rotuloCapitulo(9, cfg({ estilo: 'nenhum' }))).toBe('')
    expect(rotuloCapitulo(7, cfg({ estilo: 'modelo', modelo: '{palavra} {romano} — {extenso}', caixa: 'normal' }))).toBe('Capítulo VII — sete')
  })
  it('prólogo e epílogo; tela sempre em caixa normal', () => {
    expect(rotuloDe('prologo', 0, DEFAULT_ROTULO)).toBe('PRÓLOGO')
    expect(rotuloTela('epilogo', 0, DEFAULT_ROTULO)).toBe('Epílogo')
    expect(rotuloDe('capitulo', 1, cfg({ estilo: 'nenhum' }))).toBeNull()
  })
})

describe('resolveRotulo', () => {
  it('migra a opção antiga chapterLabel', () => {
    expect(resolveRotulo({ chapterLabel: 'romano' }).estilo).toBe('romano-palavra')
    expect(resolveRotulo(undefined)).toEqual(DEFAULT_ROTULO)
  })
  it('saneia valores inválidos', () => {
    const r = resolveRotulo({ rotulo: { estilo: 'xx' as never, palavra: 'Ato', genero: 'f', caixa: 'zz' as never, modelo: '  ' } })
    expect(r.estilo).toBe('classico-numero')
    expect(r.palavra).toBe('Ato')
    expect(r.caixa).toBe('maiusculas')
    expect(r.modelo).toBe(DEFAULT_ROTULO.modelo)
  })
})

describe('numerarCapitulos', () => {
  it('prólogo e epílogo não contam', () => {
    expect(numerarCapitulos([{ kind: 'prologo' }, { kind: 'capitulo' }, { kind: 'capitulo' }, { kind: 'epilogo' }])).toEqual([0, 1, 2, 0])
  })
})
