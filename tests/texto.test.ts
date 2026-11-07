import { describe, expect, it } from 'vitest'
import { aplicarTrocas, contexto, mascararMarkdown, pedacos, revalidarTrocas } from '../src/main/ai/texto'

describe('aplicarTrocas', () => {
  it('troca trecho único', () => {
    const r = aplicarTrocas('O gato subiu.', [{ original: 'gato', substituto: 'cão' }])
    expect(r.texto).toBe('O cão subiu.')
    expect(r.aplicadas).toBe(1)
    expect(r.aplicadasIdx).toEqual([0])
  })
  it('usa o contexto para escolher entre ocorrências repetidas', () => {
    const t = 'Ela riu. Ele riu alto.'
    const r = aplicarTrocas(t, [{ original: 'riu', substituto: 'gargalhou', antes: 'Ele ', depois: ' alto' }])
    expect(r.texto).toBe('Ela riu. Ele gargalhou alto.')
  })
  it('recusa trecho repetido sem contexto que desempate', () => {
    const r = aplicarTrocas('riu e riu', [{ original: 'riu', substituto: 'x' }])
    expect(r.aplicadas).toBe(0)
    expect(r.falhas[0]?.motivo).toMatch(/2 vezes/)
  })
  it('falha quando o trecho sumiu, sem afetar as outras', () => {
    const r = aplicarTrocas('um dois três', [
      { original: 'quatro', substituto: '4' },
      { original: 'dois', substituto: '2' }
    ])
    expect(r.texto).toBe('um 2 três')
    expect(r.aplicadasIdx).toEqual([1])
    expect(r.falhas).toHaveLength(1)
  })
  it('contexto mudou mas trecho é único: aplica', () => {
    const r = aplicarTrocas('novo começo e fim', [{ original: 'fim', substituto: 'final', antes: 'velho ', depois: '' }])
    expect(r.texto).toBe('novo começo e final')
  })
  it('original vazio é falha', () => {
    expect(aplicarTrocas('abc', [{ original: '', substituto: 'x' }]).falhas).toHaveLength(1)
  })
})

describe('revalidarTrocas', () => {
  it('tira a que sumiu, mantém a intacta e recalcula o contexto da única', () => {
    const texto = 'A casa era grande. O muro estava torto.'
    const lista = [
      { id: 'a', original: 'grande', substituto: 'enorme', antes: 'A casa era ', depois: '.' },
      { id: 'b', original: 'torto', substituto: 'inclinado', antes: 'O muro era ', depois: '.' },
      { id: 'c', original: 'sumiu', substituto: 'x', antes: '', depois: '' }
    ]
    const r = revalidarTrocas(texto, lista)
    expect(r.map((s) => s.id)).toEqual(['a', 'b'])
    expect(r[0]).toBe(lista[0])
    expect(r[1]?.antes).toBe('A casa era grande. O muro estava ')
    expect(r[1]?.depois).toBe('.')
    expect(aplicarTrocas(texto, r).aplicadas).toBe(2)
  })
  it('tira a repetida cujo contexto mudou', () => {
    const r = revalidarTrocas('mar e mar', [{ original: 'mar', substituto: 'oceano', antes: 'o ', depois: ' azul' }])
    expect(r).toEqual([])
  })
})

describe('utilidades', () => {
  it('mascararMarkdown preserva deslocamentos', () => {
    const md = '# Título\n**negrito** e _itálico_'
    const m = mascararMarkdown(md)
    expect(m).toHaveLength(md.length)
    expect(m.indexOf('negrito')).toBe(md.indexOf('negrito'))
    expect(m).not.toContain('*')
  })
  it('contexto corta na linha', () => {
    const t = 'linha um\nantes ALVO depois\nlinha três'
    expect(contexto(t, t.indexOf('ALVO'), 4)).toEqual({ antes: 'antes ', depois: ' depois' })
  })
  it('pedacos não corta parágrafo', () => {
    const p = pedacos('aaaa\n\nbbbb\n\ncccc', 10)
    expect(p).toEqual(['aaaa\n\nbbbb', 'cccc'])
  })
})
