import { describe, expect, it } from 'vitest'
import type { Cartao, DecisaoRevisao, Ficha, Sugestao } from '../src/shared/models'
import {
  causasDosCartoes,
  escolherCapitulosDeVoz,
  fichaTexto,
  FONTES_VAZIAS,
  MARCA_PROVISORIO,
  montarContexto,
  orcamentoEfetivo,
  type FontesContexto
} from '../src/main/ai/contexto'
import { conflitoMantido, decisaoPara, filtrarSugestoes, chaveConflito, palavrasMantidas } from '../src/shared/decisoes'
import { continuidadeDeterministica, dentroDeFala } from '../src/main/ai/continuidade'
import { metricasRitmo } from '../src/main/ai/ritmo'
import { repeticoesRevisor } from '../src/main/insights/repeticao'
import { noDicionario } from '../src/main/ai/languagetool'
import { instrucoesPerfil, sanearPerfil } from '../src/main/ai/perfil'
import { sanearBoard } from '../src/main/features/enredo'
import { continuidadeLocal, repeticoesProximas } from '../src/main/insights/engine'

function ficha(id: string, nome: string, extra: Partial<Ficha> = {}): Ficha {
  return {
    id,
    tipo: 'personagem',
    nome,
    apelidos: [],
    papel: '',
    grupo: '',
    campos: [],
    relacoes: [],
    notas: '',
    retrato: '',
    criadoEm: '',
    atualizadoEm: '',
    ...extra
  }
}

function cartao(id: string, extra: Partial<Cartao> = {}): Cartao {
  return { id, tipo: 'cena', titulo: id, texto: '', fichas: [], x: 0, y: 0, origem: 'autor', estado: 'canonico', criadoEm: '', capitulo: '001-a.md', ...extra }
}

function sug(extra: Partial<Sugestao>): Sugestao {
  return { id: 'x', categoria: 'estilo', motivo: 'm', original: 'o', substituto: 's', antes: '', depois: '', ...extra }
}

const resumo = (i: number): { file: string; titulo: string; resumo: string } => ({
  file: `${String(i).padStart(3, '0')}-c.md`,
  titulo: `Cap ${i}`,
  resumo: `Acontecimentos do capítulo ${i}. `.repeat(10)
})

describe('montarContexto: orçamento e prioridade', () => {
  it('cabe tudo: sem avisos, saída em ordem de leitura', () => {
    const f: FontesContexto = { ...FONTES_VAZIAS, resumos: [resumo(1), resumo(2)], fichas: [{ ficha: ficha('a', 'Ana'), mencoes: 2 }], todas: [ficha('a', 'Ana')] }
    const m = montarContexto(f, 100_000)
    expect(m.avisos).toEqual([])
    expect(m.texto.indexOf('Cap 1')).toBeLessThan(m.texto.indexOf('Cap 2'))
    expect(m.texto.indexOf('Cap 2')).toBeLessThan(m.texto.indexOf('Ana'))
  })

  it('corta os resumos mais antigos primeiro e avisa', () => {
    const resumos = Array.from({ length: 15 }, (_, i) => resumo(i + 1))
    const f: FontesContexto = { ...FONTES_VAZIAS, resumos, fichas: [{ ficha: ficha('a', 'Ana'), mencoes: 2 }], todas: [ficha('a', 'Ana')] }
    const m = montarContexto(f, 700)
    // os 3 mais recentes e a ficha entram; os antigos saem
    expect(m.texto).toContain('Cap 15')
    expect(m.texto).toContain('Cap 13')
    expect(m.texto).toContain('Ana')
    expect(m.texto).not.toContain('Cap 1:')
    expect(m.avisos.some((a) => /Resumos de \d+ capítulos antigos omitidos por tamanho/.test(a))).toBe(true)
    expect(m.tokens).toBeLessThanOrEqual(700)
  })

  it('é determinístico', () => {
    const f: FontesContexto = { ...FONTES_VAZIAS, resumos: Array.from({ length: 9 }, (_, i) => resumo(i + 1)) }
    expect(montarContexto(f, 500)).toEqual(montarContexto(f, 500))
  })

  it('fichas menos citadas saem antes e o aviso diz quais', () => {
    const todas = [ficha('a', 'Ana', { notas: 'x'.repeat(300) }), ficha('b', 'Bruno', { notas: 'y'.repeat(300) })]
    const f: FontesContexto = { ...FONTES_VAZIAS, todas, fichas: [{ ficha: todas[0]!, mencoes: 5 }, { ficha: todas[1]!, mencoes: 1 }] }
    const m = montarContexto(f, 160)
    expect(m.texto).toContain('Ana')
    expect(m.texto).not.toContain('Bruno')
    expect(m.avisos.join(' ')).toContain('Bruno')
  })

  it('cartão provisório vai marcado; descartado não entra', () => {
    const f: FontesContexto = {
      ...FONTES_VAZIAS,
      cartoes: [cartao('fato', { titulo: 'Plano' }), cartao('ideia', { titulo: 'Talvez', estado: 'provisorio', origem: 'ia' }), cartao('lixo', { titulo: 'Velho', estado: 'descartado' })]
    }
    const m = montarContexto(f, 10_000)
    expect(m.texto).toContain('Plano')
    expect(m.texto).toContain(`Talvez ${MARCA_PROVISORIO}`)
    expect(m.texto).not.toContain('Velho')
  })

  it('cena resolve ids para nomes', () => {
    const todas = [ficha('ana', 'Ana'), ficha('porto', 'Porto Velho', { tipo: 'lugar' })]
    const m = montarContexto({ ...FONTES_VAZIAS, todas, cena: { sinopse: 'Ana chega.', pov: 'ana', cenario: 'porto' } }, 10_000)
    expect(m.texto).toContain('ponto de vista: Ana')
    expect(m.texto).toContain('cenário: Porto Velho')
  })

  it('Ollama: o capítulo come o orçamento', () => {
    expect(orcamentoEfetivo(12_000, false, 90_000, 2000)).toBe(12_000)
    expect(orcamentoEfetivo(12_000, true, 60_000, 2000)).toBeLessThan(12_000)
    expect(orcamentoEfetivo(12_000, true, 200_000, 2000)).toBe(0)
  })
})

describe('fichas, causas e voz', () => {
  it('fichaTexto traz grupo e relações com o nome do alvo', () => {
    const todas = [ficha('a', 'Ana', { grupo: 'Guilda', relacoes: [{ alvo: 'b', rotulo: 'irmã de' }] }), ficha('b', 'Bruno')]
    const t = fichaTexto(todas[0]!, todas)
    expect(t).toContain('grupo: Guilda')
    expect(t).toContain('relações: irmã de Bruno')
  })

  it('ligações de causa que tocam os cartões, sem descartados', () => {
    const board = {
      cartoes: [cartao('a'), cartao('b', { capitulo: '002-b.md' }), cartao('c', { estado: 'descartado' })],
      ligacoes: [
        { id: 'l1', de: 'a', para: 'b', rotulo: 'provoca', tipo: 'causa' as const },
        { id: 'l2', de: 'a', para: 'c', rotulo: '', tipo: 'causa' as const },
        { id: 'l3', de: 'a', para: 'b', rotulo: '', tipo: 'relacao' as const }
      ]
    }
    const cs = causasDosCartoes(board, new Set(['a']), (f) => (f === '002-b.md' ? 'Dois' : ''))
    expect(cs).toHaveLength(1)
    expect(cs[0]?.para).toContain('(Dois)')
    expect(cs[0]?.rotulo).toBe('provoca')
  })

  it('amostras de voz: capítulos mais próximos, anterior primeiro', () => {
    const caps = ['001', '002', '003', '004', '005'].map((n) => ({ file: `${n}-x.md`, id: `ch-${n}`, title: n, kind: 'capitulo' as const, words: 500 }))
    expect(escolherCapitulosDeVoz(caps, '003-x.md').map((c) => c.file)).toEqual(['002-x.md', '004-x.md', '001-x.md'])
  })
})

describe('decisões de revisão', () => {
  const decisoes: DecisaoRevisao[] = [
    { id: '1', tipo: 'manter-palavra', valor: 'Sombra', criadoEm: '' },
    { id: '2', tipo: 'ignorar-regra', valor: 'PT_REGRA', criadoEm: '' },
    { id: '3', tipo: 'manter-trecho', valor: 'era uma vez, era uma vez', criadoEm: '' },
    { id: '4', tipo: 'continuidade', valor: 'ana|Olhos|olhos azuis', capitulo: 'ch-1', criadoEm: '' }
  ]

  it('filtra por palavra (sem acento/caixa), regra, trecho e conflito do capítulo', () => {
    const lista = [
      sug({ id: 'p', categoria: 'repeticao', palavra: 'sombra', soAviso: true }),
      sug({ id: 'o', categoria: 'ortografia', original: 'sombra' }),
      sug({ id: 'r', categoria: 'gramatica', regra: 'PT_REGRA' }),
      sug({ id: 't', original: 'era uma vez' }),
      sug({ id: 'c', categoria: 'continuidade', chave: 'ana|Olhos|olhos azuis' }),
      sug({ id: 'fica', original: 'outra coisa' })
    ]
    expect(filtrarSugestoes(lista, decisoes, [], 'ch-1').map((s) => s.id)).toEqual(['fica'])
    // a decisão de continuidade vale só no capítulo dela
    expect(filtrarSugestoes(lista, decisoes, [], 'ch-2').map((s) => s.id)).toEqual(['c', 'fica'])
  })

  it('"Foi de propósito" do capítulo vale junto com as decisões', () => {
    const c = { fichaId: 'b', campo: 'Cabelo', trecho: 'cabelo ruivo' }
    expect(conflitoMantido(c, [chaveConflito(c)], [], 'ch-9')).toBe(true)
    expect(conflitoMantido(c, [], [], 'ch-9')).toBe(false)
  })

  it('decisaoPara escolhe o tipo certo', () => {
    expect(decisaoPara(sug({ categoria: 'ortografia', original: 'Kaelith' })).tipo).toBe('manter-palavra')
    expect(decisaoPara(sug({ categoria: 'gramatica', regra: 'R1' })).tipo).toBe('ignorar-regra')
    expect(decisaoPara(sug({ categoria: 'continuidade', chave: 'k' }))).toMatchObject({ tipo: 'continuidade', soCapitulo: true })
    expect(decisaoPara(sug({ original: 'a frase toda' })).tipo).toBe('manter-trecho')
  })

  it('insights proativos respeitam ignorados e palavras mantidas', () => {
    const lista = [ficha('ana', 'Ana', { campos: [{ nome: 'Olhos', valor: 'verdes' }] })]
    const texto = 'Ana olhou para trás. Os olhos azuis brilharam.'
    const caps = [{ file: '001-a.md', id: 'ch-1', kind: 'capitulo' as const }]
    const todos = continuidadeLocal(texto, '001-a.md', lista, caps)
    expect(todos).toHaveLength(1)
    const chave = chaveConflito(continuidadeDeterministica(texto, '001-a.md', lista, caps)[0]!)
    expect(continuidadeLocal(texto, '001-a.md', lista, caps, {}, [chave])).toHaveLength(0)

    const rep = 'A sombra caiu. Depois a sombra cresceu e a sombra venceu.'
    expect(repeticoesProximas(rep)).toHaveLength(1)
    expect(repeticoesProximas(rep, 3, 30, palavrasMantidas([decisoes[0]!]))).toHaveLength(0)
  })

  it('dicionário do livro tira falso erro de ortografia', () => {
    const dic = new Set(['kaelith', 'vor'])
    expect(noDicionario('Kaelith', dic)).toBe(true)
    expect(noDicionario('Vor-kaelith', dic)).toBe(false)
    expect(noDicionario('casa', dic)).toBe(false)
  })
})

describe('perfil da obra e continuidade local', () => {
  const lista = [ficha('ana', 'Ana', { campos: [{ nome: 'Olhos', valor: 'verdes' }] })]

  it('reconhece fala por travessão e por aspas', () => {
    const t = 'Narração.\n\n— Ana tem olhos azuis — mentiu ele.\n\nEle disse: “Ana tem olhos azuis”, e riu.'
    expect(dentroDeFala(t, t.indexOf('olhos azuis'))).toBe(true)
    expect(dentroDeFala(t, t.lastIndexOf('olhos azuis'))).toBe(true)
    expect(dentroDeFala(t, 2)).toBe(false)
  })

  it('narrador não confiável: não confere atributo dentro de fala', () => {
    const t = '— Ana? Os olhos azuis dela me assustam — disse Bruno.\n\nAna piscou. Os olhos azuis brilharam.'
    expect(continuidadeDeterministica(t, '001-a.md', lista)).toHaveLength(2)
    const r = continuidadeDeterministica(t, '001-a.md', lista, undefined, { narradorNaoConfiavel: true })
    expect(r).toHaveLength(1)
    expect(r[0]?.trecho).toContain('brilharam')
  })

  it('não linear: morto que fala depois não é acusado', () => {
    const fichas = [ficha('ze', 'Zé', { campos: [{ nome: 'Status', valor: 'morto@cap1' }] })]
    const caps = [
      { file: '001-a.md', id: 'ch-1', kind: 'capitulo' as const },
      { file: '002-b.md', id: 'ch-2', kind: 'capitulo' as const }
    ]
    const t = 'Zé disse que voltaria.'
    expect(continuidadeDeterministica(t, '002-b.md', fichas, caps)).toHaveLength(1)
    expect(continuidadeDeterministica(t, '002-b.md', fichas, caps, { naoLinear: true })).toHaveLength(0)
  })

  it('instruções do perfil só aparecem quando ligadas', () => {
    expect(instrucoesPerfil(sanearPerfil({}))).toBe('')
    const t = instrucoesPerfil(sanearPerfil({ narradorNaoConfiavel: true, notasIa: 'magia cobra preço' }))
    expect(t).toContain('podem ser falsas DE PROPÓSITO')
    expect(t).toContain('magia cobra preço')
  })
})

describe('repetição local no Revisor', () => {
  it('sem limite de 3, mensagem explicável, só aviso com marcas', () => {
    const t = ['A sombra caiu e a sombra.', 'O ventos soprou e o ventos.', 'A chuva veio e a chuva.', 'O frios bateu e o frios.'].join('\n\n')
    const r = repeticoesRevisor(t)
    expect(r.map((x) => x.palavra)).toEqual(['sombra', 'ventos', 'chuva', 'frios'])
    const s = r[0]!
    expect(s.categoria).toBe('repeticao')
    expect(s.soAviso).toBe(true)
    expect(s.motivo).toMatch(/^“sombra” 2× em \d+ palavras$/)
    expect(s.marcas).toHaveLength(2)
    const [a, b] = s.marcas![0]!
    expect(s.original.slice(a, b)).toBe('sombra')
  })
})

describe('métricas de ritmo', () => {
  it('frase, parágrafo, diálogo e inícios repetidos', () => {
    const md = ['Ele andou. Ele parou. Ele olhou o mar.', '— Vem comigo — disse ela.', '# Título', 'Ele voltou para casa cedo.'].join('\n\n')
    const m = metricasRitmo(md)
    expect(m.paragrafos).toBe(3)
    expect(m.frases).toBe(5)
    expect(m.palavras).toBe(17)
    expect(m.mediaFrase).toBe(3.4)
    expect(m.pctDialogo).toBe(Math.round((4 / 17) * 100))
    expect(m.iniciosRepetidos).toEqual([{ inicio: 'ele', n: 4 }])
  })

  it('texto vazio não divide por zero', () => {
    expect(metricasRitmo('')).toMatchObject({ palavras: 0, mediaFrase: 0, mediaParagrafo: 0, pctDialogo: 0 })
  })
})

describe('cartão: origem e estado', () => {
  it('legado vira autor/canônico; valores válidos ficam', () => {
    const b = sanearBoard({
      cartoes: [
        { id: 'velho', tipo: 'cena', titulo: '', texto: '', fichas: [], x: 0, y: 0 },
        { id: 'novo', tipo: 'ideia', titulo: '', texto: '', fichas: [], x: 0, y: 0, origem: 'ia', estado: 'provisorio' }
      ]
    })
    expect(b.cartoes[0]).toMatchObject({ origem: 'autor', estado: 'canonico' })
    expect(b.cartoes[1]).toMatchObject({ origem: 'ia', estado: 'provisorio' })
  })
})
