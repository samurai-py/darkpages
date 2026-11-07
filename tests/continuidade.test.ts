import { describe, expect, it } from 'vitest'
import type { Ficha } from '../src/shared/models'
import { continuidadeDeterministica, conflitosComoSugestoes, remapearRefsCapitulo, type CapituloOrdem } from '../src/main/ai/continuidade'

function ficha(nome: string, campos: Array<[string, string]>, extra: Partial<Ficha> = {}): Ficha {
  return {
    id: nome.toLowerCase(),
    tipo: 'personagem',
    nome,
    apelidos: [],
    papel: '',
    grupo: '',
    campos: campos.map(([n, v]) => ({ nome: n, valor: v })),
    relacoes: [],
    notas: '',
    retrato: '',
    criadoEm: '',
    atualizadoEm: '',
    ...extra
  }
}

const P: CapituloOrdem = { file: '001-prologo.md', id: 'ch-pppppp', kind: 'prologo' }
const A: CapituloOrdem = { file: '002-a.md', id: 'ch-aaaaaa', kind: 'capitulo' }
const B: CapituloOrdem = { file: '003-b.md', id: 'ch-bbbbbb', kind: 'capitulo' }
const C: CapituloOrdem = { file: '004-c.md', id: 'ch-cccccc', kind: 'capitulo' }
const LIVRO = [P, A, B, C]

describe('atributos descritivos', () => {
  const tome = ficha('Tomé', [['Olhos', 'verdes']])
  it('aponta cor diferente da ficha perto do nome e propõe a troca', () => {
    const r = continuidadeDeterministica('Tomé abriu os olhos azuis devagar.', A.file, [tome], LIVRO)
    expect(r).toHaveLength(1)
    expect(r[0]?.troca).toMatchObject({ original: 'olhos azuis', substituto: 'olhos verdes' })
    expect(conflitosComoSugestoes(r)[0]).toMatchObject({ categoria: 'continuidade', original: 'olhos azuis', substituto: 'olhos verdes' })
  })
  it('mesma cor (outra flexão) não é conflito; adjetivo que não é cor também não', () => {
    expect(continuidadeDeterministica('Tomé tinha o olho verde.', A.file, [tome], LIVRO)).toEqual([])
    expect(continuidadeDeterministica('Tomé fechou os olhos cansados.', A.file, [tome], LIVRO)).toEqual([])
  })
  it('atribui ao personagem mais próximo', () => {
    const ana = ficha('Ana', [['Olhos', 'azuis']])
    expect(continuidadeDeterministica('Ana sorriu; seus olhos azuis brilharam.', A.file, [tome, ana], LIVRO)).toEqual([])
  })
})

describe('status morto@capN', () => {
  const morto = ficha('Tomé', [['Status', 'morto@cap2']])
  it('@capN é o N-ésimo capítulo exibido (o prólogo não conta)', () => {
    // cap2 = B. Fala em C (depois) é conflito; em B e antes não.
    expect(continuidadeDeterministica('Tomé disse que voltaria.', C.file, [morto], LIVRO)).toHaveLength(1)
    expect(continuidadeDeterministica('Tomé disse que voltaria.', B.file, [morto], LIVRO)).toEqual([])
    expect(continuidadeDeterministica('Tomé disse que voltaria.', P.file, [morto], LIVRO)).toEqual([])
  })
  it('o aviso nomeia o capítulo como a tela', () => {
    const r = continuidadeDeterministica('Tomé disse que voltaria.', C.file, [morto], LIVRO)
    expect(r[0]?.encontrado).toBe('fala no cap. 3')
  })
  it('segue a ordem do livro, não o número do arquivo', () => {
    // C foi movido para antes de B: nada mais a apontar em C
    expect(continuidadeDeterministica('Tomé disse que voltaria.', C.file, [morto], [P, A, C, B])).toEqual([])
  })
  it('aceita @<id> do capítulo', () => {
    const porId = ficha('Tomé', [['Status', 'morta @ch-aaaaaa']])
    expect(continuidadeDeterministica('Tomé gritou alto.', B.file, [porId], LIVRO)).toHaveLength(1)
    expect(continuidadeDeterministica('Tomé gritou alto.', A.file, [porId], LIVRO)).toEqual([])
  })
  it('lembrança não conta; referência que não existe é ignorada', () => {
    expect(continuidadeDeterministica('Lembrou de quando Tomé disse adeus.', C.file, [morto], LIVRO)).toEqual([])
    const fantasma = ficha('Tomé', [['Status', 'morto@cap9']])
    expect(continuidadeDeterministica('Tomé disse oi.', C.file, [fantasma], LIVRO)).toEqual([])
  })
  it('sem a lista de capítulos, usa o prefixo do arquivo (compatível)', () => {
    expect(continuidadeDeterministica('Tomé disse oi.', '003-x.md', [morto])).toHaveLength(1)
    expect(continuidadeDeterministica('Tomé disse oi.', '002-x.md', [morto])).toEqual([])
  })
})

describe('remapearRefsCapitulo', () => {
  it('reordenar: @capN acompanha o capítulo, preservando a grafia', () => {
    const depois = [P, C, A, B] // A vira 2, B vira 3, C vira 1
    expect(remapearRefsCapitulo('morto@cap2', LIVRO, depois)).toBe('morto@cap3')
    expect(remapearRefsCapitulo('casada @capítulo 1, viúva @ 3', LIVRO, depois)).toBe('casada @capítulo 2, viúva @ 1')
  })
  it('capítulo que perdeu o número (virou prólogo) ou foi excluído vira @id', () => {
    const aVirouPrologo = [P, { ...A, kind: 'prologo' as const }, B, C]
    expect(remapearRefsCapitulo('morto@cap1', LIVRO, aVirouPrologo)).toBe('morto@ch-aaaaaa')
    expect(remapearRefsCapitulo('morto@cap2', LIVRO, aVirouPrologo)).toBe('morto@cap1')
    expect(remapearRefsCapitulo('morto@cap2', LIVRO, [P, A, C])).toBe('morto@ch-bbbbbb')
  })
  it('não mexe no que não é referência a capítulo existente', () => {
    expect(remapearRefsCapitulo('joao@12.com', LIVRO, [P, C, A, B])).toBe('joao@12.com')
    expect(remapearRefsCapitulo('morto@ch-bbbbbb', LIVRO, [P, C, A, B])).toBe('morto@ch-bbbbbb')
    expect(remapearRefsCapitulo('morto@cap9', LIVRO, [P, C, A, B])).toBe('morto@cap9')
    expect(remapearRefsCapitulo('verdes', LIVRO, [P, C, A, B])).toBe('verdes')
  })
})
