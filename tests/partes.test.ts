import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROTULO,
  DEFAULT_ROTULO_PARTE,
  comoNumeracao,
  dentroDeParte,
  generoSugerido,
  numerarCapitulos,
  numerarItens,
  resolveNumeracao,
  resolveRotuloParte,
  rotuloDe,
  rotuloTela,
  rotulosTela,
  type RotuloCfg
} from '../src/shared/rotulo'
import { nomeDaPosicao, posicaoDaRef } from '../src/main/ai/continuidade'
import { buildBookTypst } from '../src/main/layout/typst-source'
import { DEFAULT_LAYOUT, type ChapterContent, type ChapterKind } from '../src/shared/types'

const parte = (p: Partial<RotuloCfg>): RotuloCfg => ({ ...DEFAULT_ROTULO_PARTE, ...p })
const k = (...kinds: ChapterKind[]): Array<{ kind: ChapterKind }> => kinds.map((kind) => ({ kind }))

// prólogo, Parte 1 (2 caps), Parte 2 (2 caps), epílogo
const LIVRO = k('prologo', 'parte', 'capitulo', 'capitulo', 'parte', 'capitulo', 'capitulo', 'epilogo')

describe('numeração com partes', () => {
  it('continua no livro todo (padrão): partes ganham o próprio número', () => {
    expect(numerarItens(LIVRO)).toEqual([0, 1, 1, 2, 2, 3, 4, 0])
  })
  it('recomeça em cada parte', () => {
    expect(numerarItens(LIVRO, true)).toEqual([0, 1, 1, 2, 2, 1, 2, 0])
  })
  it('capítulos antes da primeira parte contam do 1 e a parte zera depois', () => {
    expect(numerarItens(k('capitulo', 'parte', 'capitulo'), true)).toEqual([1, 1, 1])
    expect(numerarItens(k('capitulo', 'parte', 'capitulo'), false)).toEqual([1, 1, 2])
  })
  it('@capN (numerarCapitulos) ignora partes e nunca recomeça', () => {
    expect(numerarCapitulos(LIVRO)).toEqual([0, 0, 1, 2, 0, 3, 4, 0])
  })
  it('referência @cap3 aponta para o 3º capítulo, pulando as partes', () => {
    const caps = LIVRO.map((c, i) => ({ ...c, file: `${i}.md`, id: `ch-${i}aaaaaa` }))
    expect(posicaoDaRef({ tipo: 'numero', n: 3 }, caps)).toBe(5)
    expect(nomeDaPosicao(4, caps)).toBe('página de parte')
    expect(nomeDaPosicao(5, caps)).toBe('cap. 3')
  })
  it('dentroDeParte: só capítulos depois de uma parte', () => {
    expect(dentroDeParte(LIVRO)).toEqual([false, false, true, true, false, true, true, false])
  })
})

describe('rótulo das partes', () => {
  it('padrão: "Parte um" (numeral invariável), maiúsculas no livro', () => {
    expect(rotuloDe('parte', 1, DEFAULT_ROTULO)).toBe('PARTE UM')
    expect(rotuloTela('parte', 2, DEFAULT_ROTULO)).toBe('Parte dois')
  })
  it('gênero sugerido ao trocar o estilo da palavra "Parte"', () => {
    expect(generoSugerido('ordinal-palavra', 'Parte', 'm')).toBe('f')
    expect(generoSugerido('classico-extenso', 'Parte', 'f')).toBe('m')
    expect(generoSugerido('ordinal-palavra', 'Livro', 'm')).toBe('m')
  })
  it('estilos: romano, Livro I, ordinal + palavra, modelo livre', () => {
    const tela = (n: number, p: Partial<RotuloCfg>): string | null => rotuloTela('parte', n, DEFAULT_ROTULO, parte(p))
    expect(tela(1, { estilo: 'romano-palavra' })).toBe('Parte I')
    expect(tela(3, { estilo: 'romano-palavra', palavra: 'Livro', genero: 'm' })).toBe('Livro III')
    expect(tela(1, { estilo: 'ordinal-palavra', genero: 'f' })).toBe('Primeira Parte')
    expect(tela(2, { estilo: 'modelo', modelo: '{palavra} {romano} —' })).toBe('Parte II —')
    expect(tela(1, { estilo: 'nenhum' })).toBeNull()
  })
  it('capítulo continua usando o nome dos capítulos', () => {
    expect(rotuloTela('capitulo', 2, DEFAULT_ROTULO, parte({ estilo: 'romano' }))).toBe('Capítulo 2')
  })
  it('rotulosTela usa a numeração escolhida', () => {
    const num = resolveNumeracao({ rotulo: { ...DEFAULT_ROTULO, estilo: 'classico-extenso' }, rotuloParte: parte({ estilo: 'romano-palavra' }), reiniciarNumeracao: true })
    expect(rotulosTela(LIVRO, num)).toEqual(['Prólogo', 'Parte I', 'Capítulo um', 'Capítulo dois', 'Parte II', 'Capítulo um', 'Capítulo dois', 'Epílogo'])
    expect(rotulosTela(LIVRO, DEFAULT_ROTULO)[5]).toBe('Capítulo 3')
  })
  it('resolve: padrão sem configuração e campos inválidos corrigidos', () => {
    expect(resolveRotuloParte(undefined)).toEqual(DEFAULT_ROTULO_PARTE)
    expect(resolveRotuloParte({ rotuloParte: { estilo: 'xx' as never, palavra: 'Livro', genero: 'm', caixa: 'normal', modelo: '' } })).toEqual({
      ...DEFAULT_ROTULO_PARTE,
      palavra: 'Livro',
      caixa: 'normal'
    })
    expect(comoNumeracao(DEFAULT_ROTULO).reiniciar).toBe(false)
  })
})

describe('miolo (Typst) com partes', () => {
  const cap = (file: string, title: string, kind: ChapterKind, body = 'Texto.'): ChapterContent => ({ file, title, kind, body })
  const caps = [
    cap('001-p.md', 'Prólogo', 'prologo'),
    cap('002-a.md', 'A travessia', 'parte', 'Onde tudo começa.'),
    cap('003-c.md', 'Um', 'capitulo'),
    cap('004-b.md', 'O retorno', 'parte', ''),
    cap('005-d.md', 'Dois', 'capitulo')
  ]
  it('página de parte em ímpar com verso em branco; capítulos recuados no sumário', () => {
    const src = buildBookTypst({ title: 'T', author: 'A', layout: { ...DEFAULT_LAYOUT, reiniciarNumeracao: true } }, caps)
    expect(src).toContain('#pagina-parte("PARTE UM", "A travessia", "002-a.md", [')
    expect(src).toContain('#pagina-parte("PARTE DOIS", "O retorno", "004-b.md", none)')
    expect(src.match(/#pagebreak\(to: pag-impar, weak: true\)\n/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src).toContain('#abertura-classica("CAPÍTULO 1", "Um", "003-c.md", em-parte: true)')
    // recomeça: o capítulo da parte dois também é o 1
    expect(src).toContain('#abertura-classica("CAPÍTULO 1", "Dois", "005-d.md", em-parte: true)')
    expect(src).toContain('#abertura-classica(none, "PRÓLOGO", "001-p.md")')
  })
})
