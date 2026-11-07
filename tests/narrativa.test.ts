import { describe, expect, it } from 'vitest'
import type { Cartao, DecisaoRevisao, EnredoBoard, Ficha } from '../src/shared/models'
import {
  acharTermo,
  calcularImpacto,
  camposLegados,
  conhecimentoNoCapitulo,
  converterLegado,
  estadoFio,
  fatosParaContexto,
  revelacoesAntecipadas,
  valorNoCapitulo,
  type CapituloOrdem
} from '../src/shared/narrativa'
import { chaveConflito, filtrarSugestoes } from '../src/shared/decisoes'
import { continuidadeDeterministica, revelacoesComoSugestoes } from '../src/main/ai/continuidade'
import { revelacoesLocal } from '../src/main/insights/engine'
import { FONTES_VAZIAS, montarContexto } from '../src/main/ai/contexto'
import { sanearBoard } from '../src/main/features/enredo'
import { alvosDoPlano, validarConferencia } from '../src/main/features/ia'

function ficha(id: string, nome: string, campos: Ficha['campos'] = [], extra: Partial<Ficha> = {}): Ficha {
  return { id, tipo: 'personagem', nome, apelidos: [], papel: '', grupo: '', campos, relacoes: [], notas: '', retrato: '', criadoEm: '', atualizadoEm: '', ...extra }
}

function cartao(id: string, extra: Partial<Cartao> = {}): Cartao {
  return { id, tipo: 'cena', titulo: id, texto: '', fichas: [], x: 0, y: 0, origem: 'autor', estado: 'canonico', criadoEm: '', ...extra }
}

// prólogo, Parte 1, cap. 1, cap. 2, Parte 2, cap. 3
const P: CapituloOrdem = { file: '001-prologo.md', id: 'ch-pppppp', kind: 'prologo', words: 100 }
const X: CapituloOrdem = { file: '002-parte.md', id: 'ch-xxxxxx', kind: 'parte', words: 10 }
const A: CapituloOrdem = { file: '003-a.md', id: 'ch-aaaaaa', kind: 'capitulo', words: 100 }
const B: CapituloOrdem = { file: '004-b.md', id: 'ch-bbbbbb', kind: 'capitulo', words: 100 }
const Y: CapituloOrdem = { file: '005-parte.md', id: 'ch-yyyyyy', kind: 'parte', words: 10 }
const C: CapituloOrdem = { file: '006-c.md', id: 'ch-cccccc', kind: 'capitulo', words: 100 }
const LIVRO = [P, X, A, B, Y, C]

const esposa = cartao('fato-esposa', { tipo: 'fato', titulo: 'Nome da esposa de Viktor', texto: 'Ela se chama Lívia.', revelarEm: B.id, termos: ['Lívia', 'dona Lívia'] })

describe('revelação antecipada', () => {
  const texto = 'Viktor olhou o retrato. LIVIA, pensou, e calou.'
  it('acusa o termo em capítulo, prólogo e página de parte ANTES de revelarEm (pela posição)', () => {
    for (const c of [P, X, A]) {
      const r = revelacoesAntecipadas(texto, c.file, LIVRO, [esposa])
      expect(r, c.file).toHaveLength(1)
      expect(r[0]).toMatchObject({ cartaoId: esposa.id, termo: 'LIVIA', campo: 'Revelação' })
      expect(r[0]?.trecho).toBe('LIVIA, pensou, e calou.')
    }
    expect(r0(revelacoesAntecipadas(texto, A.file, LIVRO, [esposa])).esperado).toContain('cap. 2')
  })
  it('no capítulo da revelação e depois dele, não acusa', () => {
    expect(revelacoesAntecipadas(texto, B.file, LIVRO, [esposa])).toEqual([])
    expect(revelacoesAntecipadas(texto, C.file, LIVRO, [esposa])).toEqual([])
  })
  it('reordenar muda o resultado sem reescrever nada (id estável)', () => {
    const reordenado = [P, X, B, A, Y, C]
    expect(revelacoesAntecipadas(texto, A.file, reordenado, [esposa])).toEqual([])
    expect(revelacoesAntecipadas(texto, B.file, reordenado, [esposa])).toEqual([])
    const revelaNoPrologo = { ...esposa, revelarEm: P.id }
    expect(revelacoesAntecipadas(texto, P.file, LIVRO, [revelaNoPrologo])).toEqual([])
  })
  it('ignora acento e caixa, exige palavra inteira e aceita termo com espaço', () => {
    expect(acharTermo('a lívia veio', 'LIVIA')).toEqual([{ inicio: 2, fim: 7 }])
    expect(acharTermo('Livian chegou; Olívia também', 'Lívia')).toEqual([])
    const r = revelacoesAntecipadas('Chamou por Dona   livia na porta.', A.file, LIVRO, [esposa])
    expect(r.map((x) => x.termo)).toEqual(['livia', 'Dona   livia'])
    // posições no texto original, mesmo com acentos antes do termo
    const t = 'Ação, coração: Lívia!'
    const [o] = acharTermo(t, 'livia')
    expect(t.slice(o?.inicio, o?.fim)).toBe('Lívia')
  })
  it('descartado, sem revelarEm ou sem termos: não checa', () => {
    expect(revelacoesAntecipadas(texto, A.file, LIVRO, [{ ...esposa, estado: 'descartado' }])).toEqual([])
    expect(revelacoesAntecipadas(texto, A.file, LIVRO, [{ ...esposa, revelarEm: undefined }])).toEqual([])
    expect(revelacoesAntecipadas(texto, A.file, LIVRO, [{ ...esposa, termos: [] }])).toEqual([])
    expect(revelacoesAntecipadas(texto, A.file, LIVRO, [{ ...esposa, tipo: 'cena' }])).toEqual([])
  })
  it('respeita "Foi de propósito" e as decisões (insights, Revisor)', () => {
    const [c] = revelacoesAntecipadas(texto, A.file, LIVRO, [esposa])
    expect(revelacoesLocal(texto, A.file, LIVRO, [esposa])).toHaveLength(1)
    expect(revelacoesLocal(texto, A.file, LIVRO, [esposa], [chaveConflito(c!)])).toEqual([])
    const dec: DecisaoRevisao = { id: 'd', tipo: 'continuidade', valor: chaveConflito(c!), capitulo: A.id, criadoEm: '' }
    expect(revelacoesLocal(texto, A.file, LIVRO, [esposa], [], [dec], A.id)).toEqual([])
    const sug = revelacoesComoSugestoes(texto, revelacoesAntecipadas(texto, A.file, LIVRO, [esposa]))
    expect(sug[0]).toMatchObject({ categoria: 'continuidade', original: 'LIVIA', soAviso: true, marcas: [[0, 5]] })
    expect(filtrarSugestoes(sug, [dec], [], A.id)).toEqual([])
    expect(filtrarSugestoes(sug, [dec], [], B.id)).toHaveLength(1)
  })
})

function r0<T>(l: T[]): T {
  const x = l[0]
  if (!x) throw new Error('vazio')
  return x
}

describe('estado temporal da ficha', () => {
  const olhos = { nome: 'Olhos', valor: 'verdes', historico: [{ valor: 'cinzentos', desde: C.id }, { valor: 'azuis', desde: A.id }] }
  it('vale o valor da última mudança até a posição do capítulo (pela ordem do livro, não do array)', () => {
    expect(valorNoCapitulo(olhos, 0, LIVRO).valor).toBe('verdes')
    expect(valorNoCapitulo(olhos, 2, LIVRO)).toEqual({ valor: 'azuis', desde: A.id, pos: 2 })
    expect(valorNoCapitulo(olhos, 3, LIVRO).valor).toBe('azuis')
    expect(valorNoCapitulo(olhos, 5, LIVRO).valor).toBe('cinzentos')
    expect(valorNoCapitulo(olhos, -1, LIVRO).valor).toBe('verdes')
  })
  it('reordenar os capítulos muda a resolução sem reescrever a ficha', () => {
    const reordenado = [P, X, C, Y, A, B]
    expect(valorNoCapitulo(olhos, 2, reordenado).valor).toBe('cinzentos')
    expect(valorNoCapitulo(olhos, 4, reordenado).valor).toBe('azuis')
  })
  it('mudança para capítulo removido é ignorada; legado @capN continua valendo', () => {
    expect(valorNoCapitulo({ nome: 'X', valor: 'a', historico: [{ valor: 'b', desde: 'ch-sumiuuu' }] }, 5, LIVRO).valor).toBe('a')
    const leg = { nome: 'Status', valor: 'morto@cap2' }
    expect(valorNoCapitulo(leg, 2, LIVRO).valor).toBe('')
    expect(valorNoCapitulo(leg, 3, LIVRO)).toMatchObject({ valor: 'morto', desde: B.id })
  })
  it('a continuidade local compara com o valor válido no capítulo', () => {
    const tome = ficha('tome', 'Tomé', [olhos])
    expect(continuidadeDeterministica('Tomé abriu os olhos azuis.', B.file, [tome], LIVRO)).toEqual([])
    const r = continuidadeDeterministica('Tomé abriu os olhos azuis.', P.file, [tome], LIVRO)
    expect(r[0]).toMatchObject({ esperado: 'verdes', encontrado: 'olhos azuis' })
    expect(continuidadeDeterministica('Tomé abriu os olhos azuis.', C.file, [tome], LIVRO)[0]?.esperado).toBe('cinzentos')
  })
  it('status "morto" pelo histórico: acusa fala em capítulo posterior, não no da morte', () => {
    const iara = ficha('iara', 'Iara', [{ nome: 'Status', valor: 'viva', historico: [{ valor: 'morta', desde: A.id }] }])
    expect(continuidadeDeterministica('Iara disse que voltaria.', A.file, [iara], LIVRO)).toEqual([])
    const r = continuidadeDeterministica('Iara disse que voltaria.', B.file, [iara], LIVRO)
    expect(r).toHaveLength(1)
    expect(r[0]?.esperado).toBe('morta desde o cap. 1')
  })
  it('converte a forma antiga em histórico, só quando a referência existe', () => {
    const f = ficha('iara', 'Iara', [
      { nome: 'Status', valor: 'morta@cap2' },
      { nome: 'Olhos', valor: 'verdes' },
      { nome: 'Cargo', valor: 'rainha @ch-naoexiste' }
    ])
    expect(camposLegados(f, LIVRO)).toEqual([0])
    const { ficha: nova, convertidos } = converterLegado(f, LIVRO)
    expect(convertidos).toBe(1)
    expect(nova.campos[0]).toEqual({ nome: 'Status', valor: '', historico: [{ valor: 'morta', desde: B.id }] })
    expect(nova.campos[2]).toEqual(f.campos[2])
    // a checagem continua igual depois da conversão
    const antes = continuidadeDeterministica('Iara disse que voltaria.', C.file, [f], LIVRO)
    const depois = continuidadeDeterministica('Iara disse que voltaria.', C.file, [nova], LIVRO)
    expect(antes).toHaveLength(1)
    expect(depois).toHaveLength(1)
    expect(continuidadeDeterministica('Iara disse que voltaria.', B.file, [nova], LIVRO)).toEqual([])
  })
})

describe('fios soltos', () => {
  const caps = [P, X, A, B, Y, { ...C, words: 0 }]
  it('aberto, resolvido e atrasado (o capítulo de resolver ficou antes do último escrito)', () => {
    expect(estadoFio(cartao('x'), caps)).toBeNull()
    expect(estadoFio(cartao('x', { fio: { status: 'resolvido', resolveEm: A.id } }), caps)).toBe('resolvido')
    expect(estadoFio(cartao('x', { fio: { status: 'aberto', resolveEm: A.id } }), caps)).toBe('atrasado')
    // B é o último capítulo com texto: ainda está sendo escrito
    expect(estadoFio(cartao('x', { fio: { status: 'aberto', resolveEm: B.id } }), caps)).toBe('aberto')
    expect(estadoFio(cartao('x', { fio: { status: 'aberto', resolveEm: C.id } }), caps)).toBe('aberto')
    expect(estadoFio(cartao('x', { fio: { status: 'aberto' } }), caps)).toBe('aberto')
    expect(estadoFio(cartao('x', { fio: { status: 'aberto', resolveEm: 'ch-sumiuuu' } }), caps)).toBe('aberto')
  })
  it('o quadro saneia fio, fato e ids de capítulo', () => {
    const b = sanearBoard({
      cartoes: [
        { id: 'c1', tipo: 'cena', fio: { status: 'xx', resolveEm: 'lixo' }, revelarEm: A.id },
        { id: 'c2', tipo: 'fato', perspectiva: { tipo: 'crenca', fichaId: 'viktor' }, revelarEm: B.id, termos: ['Lívia', 'Lívia', ' ', 3] },
        { id: 'c3', tipo: 'fato', perspectiva: { tipo: 'crenca' } }
      ]
    })
    expect(b.cartoes[0]).toMatchObject({ fio: { status: 'aberto' } })
    expect(b.cartoes[0]?.fio?.resolveEm).toBeUndefined()
    expect(b.cartoes[0]?.revelarEm).toBeUndefined()
    expect(b.cartoes[1]).toMatchObject({ perspectiva: { tipo: 'crenca', fichaId: 'viktor' }, revelarEm: B.id, termos: ['Lívia'] })
    expect(b.cartoes[2]?.perspectiva).toEqual({ tipo: 'verdade' })
  })
})

describe('impacto', () => {
  const ca = cartao('ca', { capitulo: A.file, titulo: 'Incêndio' })
  const cb = cartao('cb', { capitulo: B.file, titulo: 'Fuga' })
  const cc = cartao('cc', { capitulo: C.file, titulo: 'Exílio' })
  const cp = cartao('cp', { capitulo: P.file, titulo: 'Profecia' })
  const cd = cartao('cd', { capitulo: C.file, titulo: 'Descartado', estado: 'descartado' })
  const cr = cartao('cr', { capitulo: C.file, titulo: 'Só relação' })
  const board: EnredoBoard = {
    cartoes: [ca, cb, cc, cp, cd, cr],
    ligacoes: [
      { id: 'l1', de: 'ca', para: 'cb', rotulo: 'provoca', tipo: 'causa' },
      { id: 'l2', de: 'cb', para: 'cc', rotulo: '', tipo: 'causa' },
      { id: 'l3', de: 'ca', para: 'cp', rotulo: '', tipo: 'causa' },
      { id: 'l4', de: 'ca', para: 'cd', rotulo: '', tipo: 'causa' },
      { id: 'l5', de: 'ca', para: 'cr', rotulo: '', tipo: 'relacao' }
    ]
  }
  it('percorre as causas (também indiretas) e lista só capítulos seguintes', () => {
    const r = calcularImpacto(A.file, LIVRO, board, [])
    expect(r.map((x) => [x.tipo, x.capitulo, x.cartaoId])).toEqual([
      ['causa', B.file, 'cb'],
      ['causa', C.file, 'cc']
    ])
    expect(r[0]?.texto).toBe('“Incêndio” causa “Fuga” (provoca)')
    expect(r[1]?.texto).toContain('indireta de “Incêndio” (via “Fuga”)')
    expect(calcularImpacto(C.file, LIVRO, board, [])).toEqual([])
  })
  it('fatos revelados aqui, fios plantados aqui e fichas que mudam aqui', () => {
    const fato = cartao('f', { tipo: 'fato', titulo: 'Esposa', revelarEm: A.id, termos: ['Lívia'] })
    const segredo = cartao('s', { tipo: 'fato', titulo: 'Traição', revelarEm: A.id })
    const fio = cartao('fio', { capitulo: A.file, titulo: 'O sino', fio: { status: 'aberto', resolveEm: C.id } })
    const tome = ficha('tome', 'Tomé Arantes', [{ nome: 'Status', valor: 'vivo', historico: [{ valor: 'cego', desde: A.id }] }])
    const r = calcularImpacto(A.file, LIVRO, { cartoes: [fato, segredo, fio], ligacoes: [] }, [tome], {
      [B.file]: 'Tomé tateou a parede.',
      [C.file]: 'Pensou em livia.'
    })
    expect(r.map((x) => [x.tipo, x.capitulo ?? '', x.cartaoId ?? x.fichaId])).toEqual([
      ['ficha', B.file, 'tome'],
      ['fato', C.file, 'f'],
      ['fio', C.file, 'fio'],
      ['fato', '', 's']
    ])
  })
})

describe('contexto da IA: fatos, segredos e crenças', () => {
  const viktor = ficha('viktor', 'Viktor')
  const cartoes: Cartao[] = [
    cartao('f1', { tipo: 'fato', titulo: 'O incêndio foi criminoso', revelarEm: A.id }),
    cartao('f2', { tipo: 'fato', titulo: 'Nome da esposa', texto: 'Lívia', revelarEm: C.id, termos: ['Lívia'] }),
    cartao('f3', { tipo: 'fato', titulo: 'A esposa o traiu', perspectiva: { tipo: 'crenca', fichaId: 'viktor' } }),
    cartao('f4', { tipo: 'fato', titulo: 'Talvez gêmeos', estado: 'provisorio' }),
    cartao('f5', { tipo: 'fato', titulo: 'Descartado', estado: 'descartado' })
  ]
  const fatos = fatosParaContexto(cartoes, LIVRO.indexOf(B), LIVRO, [viktor])
  it('separa o que o leitor sabe, os segredos e as crenças; descartado fora, provisório marcado', () => {
    expect(fatos.fatos).toEqual(['- Talvez gêmeos (ideia provisória, NÃO é fato do livro)', '- O incêndio foi criminoso'])
    expect(fatos.segredos).toEqual(['- Nome da esposa: Lívia (o leitor só a partir do cap. 3; palavras que entregam (não use): Lívia)'])
    expect(fatos.crencas).toEqual(['- Viktor acredita/afirma: A esposa o traiu (não é necessariamente verdade)'])
    expect(JSON.stringify(fatos)).not.toContain('Descartado')
    const k = conhecimentoNoCapitulo(cartoes, LIVRO.indexOf(C), LIVRO)
    expect(k.sabidos.map((c) => c.id)).toEqual(['f4', 'f1', 'f2'])
  })
  it('montarContexto: seções com títulos; cartão fato não repete na seção de cartões', () => {
    const m = montarContexto({ ...FONTES_VAZIAS, ...fatos, cartoes: [cartao('f1', { tipo: 'fato', titulo: 'O incêndio foi criminoso' }), cartao('c1', { titulo: 'Briga' })] }, 100_000)
    expect(m.texto).toContain('## Fatos do livro (o leitor já sabe)')
    expect(m.texto).toContain('## Segredos (o leitor ainda NÃO sabe; não revele)')
    expect(m.texto).toContain('## Crenças e afirmações de personagens (não são necessariamente verdade)')
    expect(m.texto.match(/O incêndio foi criminoso/g)).toHaveLength(1)
    expect(m.texto).toContain('- [cena] Briga')
  })
  it('com pouco orçamento, o segredo fica e o resto sai com aviso', () => {
    const m = montarContexto({ ...FONTES_VAZIAS, ...fatos }, 60)
    expect(m.texto).toContain('Nome da esposa')
    expect(m.texto).not.toContain('O incêndio')
    expect(m.avisos.join(' ')).toContain('fatos do livro omitidos')
  })
})

describe('conferir contra o plano: validação', () => {
  const corpo = 'Tomé entrou na igreja. O sino *tocou* sozinho.\n\nNinguém viu.'
  const board: EnredoBoard = {
    cartoes: [
      cartao('c1', { capitulo: A.file, titulo: 'Tomé entra na igreja', ordem: 0 }),
      cartao('c2', { capitulo: A.file, titulo: 'Descartada', estado: 'descartado' }),
      cartao('c3', { capitulo: B.file, titulo: 'Outro capítulo' }),
      cartao('fio', { capitulo: P.file, titulo: 'O sino', fio: { status: 'aberto', resolveEm: A.id } }),
      cartao('fato', { tipo: 'fato', titulo: 'O padre mente', revelarEm: A.id })
    ],
    ligacoes: []
  }
  const alvos = alvosDoPlano(A.file, A.id, { sinopse: 'Tomé ouve o sino.' }, board)
  it('o plano tem sinopse, cartões do capítulo (sem descartados), fios e fatos daqui', () => {
    expect(alvos.map((a) => [a.chave, a.tipo, a.id ?? ''])).toEqual([
      ['S', 'sinopse', ''],
      ['C1', 'cartao', 'c1'],
      ['F1', 'fio', 'fio'],
      ['R1', 'fato', 'fato']
    ])
  })
  it('descarta alvo desconhecido, tipo inválido e repetido; trecho inventado sai; sem resposta volta', () => {
    const v = validarConferencia(
      {
        itens: [
          { alvo: 'c1', tipo: 'Cumprido', explicacao: 'Ele entra.', trecho: '“Tomé entrou na igreja.”' },
          { alvo: 'C1', tipo: 'faltando', explicacao: 'repetido' },
          { alvo: 'F1', tipo: 'divergente', explicacao: 'O sino toca, mas nada se resolve.', trecho: 'O sino tocou sozinho.' },
          { alvo: 'S', tipo: 'cumprido', explicacao: 'Ok.', trecho: 'frase que não existe no texto' },
          { alvo: 'Z9', tipo: 'cumprido', explicacao: 'inventado' },
          { alvo: 'R1', tipo: 'talvez', explicacao: 'tipo inválido' }
        ]
      },
      alvos,
      corpo
    )
    expect(v.itens).toEqual([
      { tipo: 'cumprido', alvo: { tipo: 'cartao', id: 'c1', titulo: 'Tomé entra na igreja' }, explicacao: 'Ele entra.', trecho: 'Tomé entrou na igreja.' },
      { tipo: 'divergente', alvo: { tipo: 'fio', id: 'fio', titulo: 'O sino' }, explicacao: 'O sino toca, mas nada se resolve.', trecho: 'O sino tocou sozinho.' },
      { tipo: 'cumprido', alvo: { tipo: 'sinopse', titulo: 'Sinopse da cena' }, explicacao: 'Ok.' }
    ])
    expect(v.semResposta).toEqual([{ tipo: 'fato', id: 'fato', titulo: 'O padre mente' }])
    expect(validarConferencia('lixo', alvos, corpo).itens).toEqual([])
  })
})
