import { describe, expect, it, vi } from 'vitest'

// escrita.ts puxa as extensões do editor, que importam a ponte com o main (usa `window`); aqui só as funções puras importam
vi.mock('../src/renderer/src/api', () => ({ call: vi.fn(), isWeb: true, folio: {} }))

import { corrigirMarkdownLegado, limparTextoColado, tipografar } from '../src/renderer/src/features/manuscrito/escrita'

describe('tipografar', () => {
  it('reticências, travessão e espaços', () => {
    expect(tipografar('Era... noite -- disse ele')).toBe('Era… noite — disse ele')
    expect(tipografar('ele - disse - foi')).toBe('ele — disse — foi')
    expect(tipografar('dois  espaços')).toBe('dois espaços')
    expect(tipografar('antes , depois !')).toBe('antes, depois!')
  })
  it('aspas curvas abrindo e fechando pelo contexto', () => {
    expect(tipografar('ele disse "oi" e saiu')).toBe('ele disse “oi” e saiu')
    expect(tipografar("d'água 'sim'")).toBe('d’água ‘sim’')
    expect(tipografar('"', 'x')).toBe('”')
    expect(tipografar('"', ' ')).toBe('“')
  })
})

describe('corrigirMarkdownLegado', () => {
  it('itens de lista viram falas em parágrafos próprios', () => {
    expect(corrigirMarkdownLegado('Narração.\n- Oi.\n- Tchau.')).toBe('Narração.\n\n— Oi.\n\n— Tchau.')
  })
  it('número com ponto no início não vira lista', () => {
    expect(corrigirMarkdownLegado('1984. Era um ano.')).toBe('1984\\. Era um ano.')
  })
  it('quebra de cena fica como está', () => {
    expect(corrigirMarkdownLegado('***\n---')).toBe('***\n---')
  })
})

describe('limparTextoColado', () => {
  it('junta linhas soltas do mesmo parágrafo e acerta a tipografia', () => {
    expect(limparTextoColado('Linha um\nlinha dois...\r\n\r\n- Fala "aqui"', false)).toBe('Linha um linha dois…\n\n— Fala “aqui”')
  })
  it('modo simples não corrige listas', () => {
    expect(limparTextoColado('1. item', true)).toBe('1. item')
    expect(limparTextoColado('1. item', false)).toBe('1\\. item')
  })
})
