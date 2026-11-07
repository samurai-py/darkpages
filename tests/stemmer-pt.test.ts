import { describe, expect, it } from 'vitest'
import { chavesFamilia, familias, radical, stemSnowballPt } from '../src/shared/stemmer-pt'
import { analisarRepeticoes, contarRadical } from '../src/renderer/src/features/manuscrito/texto'
import { gruposRepeticao } from '../src/main/insights/repeticao'
import { sugestaoMantida } from '../src/shared/decisoes'
import type { DecisaoRevisao, Sugestao } from '../src/shared/models'

const mesmaFamilia = (ws: string[]): void => {
  const ks = chavesFamilia(ws)
  expect(new Set(ks).size, `${ws.join('/')} → ${ks.join('/')}`).toBe(1)
}

describe('stemSnowballPt (amostra do vocabulário oficial snowball-data/portuguese)', () => {
  // pares voc.txt → output.txt; o arquivo inteiro (32 016 palavras) foi conferido na implementação
  const oficiais: Array<[string, string]> = [
    ['correndo', 'corr'],
    ['correr', 'corr'],
    ['correu', 'corr'],
    ['sombra', 'sombr'],
    ['sombras', 'sombr'],
    ['coração', 'coraçã'],
    ['corações', 'coraçõ'],
    ['desafiar', 'desafi'],
    ['desafio', 'desafi']
  ]
  it.each(oficiais)('%s → %s', (w, s) => expect(stemSnowballPt(w)).toBe(s))
})

describe('radical / famílias', () => {
  it('junta famílias conhecidas', () => {
    mesmaFamilia(['sombra', 'sombras', 'sombrio', 'sombria', 'sombrios'])
    mesmaFamilia(['correr', 'correu', 'correndo', 'corria', 'corremos'])
    mesmaFamilia(['coração', 'corações', 'coracao'])
    mesmaFamilia(['desafio', 'desafiar', 'desafiou'])
    mesmaFamilia(['caminhar', 'caminhou', 'caminhava', 'caminhando'])
  })
  it('compara sem acento e sem maiúsculas', () => {
    expect(radical('Coração')).toBe(radical('coracao'))
  })
  it('não junta falsos amigos', () => {
    const separados: Array<[string, string]> = [
      ['casa', 'casamento'],
      ['pássaro', 'passar'],
      ['nova', 'novela'],
      ['mesa', 'mesmo'],
      ['sombra', 'sombrinha'],
      ['porta', 'portanto']
    ]
    for (const [a, b] of separados) {
      const [ka, kb] = chavesFamilia([a, b])
      expect(ka, `${a} × ${b}`).not.toBe(kb)
    }
  })
  it('o ajuste -io só vale com a forma curta presente e radical de 4+ letras', () => {
    expect(familias(['sombri']).get('sombri')).toBe('sombri')
    expect(familias(['sombri', 'sombr']).get('sombri')).toBe('sombr')
    // "frio" (fri) não gruda em "fr"
    expect(familias(['fri', 'fr']).get('fri')).toBe('fri')
  })
})

describe('repetição usa o radical em todo lugar', () => {
  it('editor: analisarRepeticoes conta a família e lista os radicais para o realce', () => {
    const r = analisarRepeticoes('A sombra cresceu. As sombras dançavam no quarto sombrio.')
    expect(r[0]?.total).toBe(3)
    expect(r[0]?.radicais.sort()).toEqual(['sombr', 'sombri'])
    expect(r[0]?.formas).toEqual({ sombra: 1, sombras: 1, sombrio: 1 })
  })
  it('popup: contarRadical acha as formas da família', () => {
    const e = contarRadical('Ele correu. Correr cansa. Correndo, caiu.', 'correu')
    expect(e.total).toBe(3)
  })
  it('repetição próxima agrupa formas da mesma família', () => {
    const g = gruposRepeticao('A sombra cresceu. As sombras dançavam.')
    expect(g).toHaveLength(1)
    expect(g[0]?.ocorrencias.map((o) => o.texto)).toEqual(['sombra', 'sombras'])
  })
  it('repetição próxima não junta falsos amigos', () => {
    expect(gruposRepeticao('A casa ficou. O casamento acabou.')).toEqual([])
  })
  it('"manter palavra" vale para a família toda na repetição', () => {
    const d: DecisaoRevisao[] = [{ id: 'd1', tipo: 'manter-palavra', valor: 'sombra', criadoEm: '2026-01-01T00:00:00Z' }]
    const s = { id: 'x', categoria: 'repeticao', motivo: '', original: 'sombras … sombra', substituto: '', palavra: 'sombras' } as Sugestao
    expect(sugestaoMantida(s, d)).toBe(true)
    expect(sugestaoMantida({ ...s, palavra: 'casamento' }, d)).toBe(false)
  })
})
