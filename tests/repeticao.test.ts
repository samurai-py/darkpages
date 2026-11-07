import { describe, expect, it } from 'vitest'
import { avisosRepeticao, gruposRepeticao } from '../src/main/insights/repeticao'

const enche = (n: number): string => Array.from({ length: n }, (_, i) => `x${'a'.repeat(1 + (i % 3))}`).join(' ')

describe('gruposRepeticao', () => {
  it('acha a repetição dentro da janela', () => {
    const g = gruposRepeticao('A sombra cresceu. A sombra parou.')
    expect(g).toHaveLength(1)
    expect(g[0]?.palavra).toBe('sombra')
    expect(g[0]?.ocorrencias).toHaveLength(2)
  })
  it('cada trecho em que a palavra se acumula é um grupo (antes só o primeiro par contava)', () => {
    const md = `sombra sombra ${enche(60)} sombra ${enche(5)} sombra sombra`
    const g = gruposRepeticao(md)
    expect(g.map((x) => x.ocorrencias.length)).toEqual([2, 3])
    expect(g[1]!.inicio).toBeGreaterThan(g[0]!.fim)
  })
  it('repetição distante não conta', () => {
    expect(gruposRepeticao(`sombra ${enche(40)} sombra`)).toEqual([])
  })
  it('ignora palavras curtas, comuns e nomes próprios', () => {
    expect(gruposRepeticao('casa casa porque porque Tomás Tomás')).toEqual([])
  })
  it('compara sem acento e ignora marcação Markdown', () => {
    const g = gruposRepeticao('O **coração** batia. O coracao parou.')
    expect(g[0]?.ocorrencias.map((o) => o.texto)).toEqual(['coração', 'coracao'])
    expect(g[0]?.inicio).toBe(4)
  })
})

describe('avisosRepeticao', () => {
  it('agrupa palavras da mesma frase num aviso e ordena por densidade', () => {
    const md = 'A sombra e a pedra, a sombra e a pedra, a sombra.\n\nO vento soprou. O vento parou.'
    const a = avisosRepeticao(md, 10)
    expect(a).toHaveLength(2)
    expect(a[0]?.palavras.map((p) => p.palavra)).toEqual(['sombra', 'pedra'])
    expect(a[0]?.n).toBe(3)
    expect(a[1]?.palavras[0]).toEqual({ palavra: 'vento', n: 2 })
  })
  it('respeita o máximo', () => {
    expect(avisosRepeticao('sombra sombra.\npedra pedra.\nvento vento.', 2)).toHaveLength(2)
  })
})
