import { describe, expect, it } from 'vitest'
import { Schema, type Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import {
  aplicarCorrecoes,
  corrigirTipografia,
  correcoesDoRevisor,
  correcoesLocais,
  edicoes,
  edicoesTipografia,
  intervaloDoEscopo,
  OBJ,
  semSobreposicao,
  textoParaRevisor,
  blocosNoIntervalo
} from '../src/renderer/src/features/manuscrito/corrigir'
import { posicaoDaSugestao, type SugestaoCorrigir } from '../src/shared/corrigir'

// esquema mínimo com os mesmos nomes do editor (nota inline atômica, cena e figura em bloco)
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    blockquote: { group: 'block', content: 'block+' },
    cena: { group: 'block', atom: true },
    figura: { group: 'block', atom: true, attrs: { src: { default: '' } } },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true },
    nota: { group: 'inline', inline: true, atom: true, attrs: { texto: { default: '' } } }
  },
  marks: { italic: {}, bold: {} }
})

const t = (s: string, ...marks: Array<'italic' | 'bold'>): PMNode => schema.text(s, marks.map((m) => schema.marks[m]!.create()))
const p = (...c: PMNode[]): PMNode => schema.node('paragraph', null, c)
const doc = (...c: PMNode[]): PMNode => schema.node('doc', null, c)

function corrigirDoc(d: PMNode): PMNode {
  const st = EditorState.create({ doc: d })
  const cs = correcoesLocais(d, 0, d.content.size)
  return st.apply(aplicarCorrecoes(st.tr, cs)).doc
}

describe('corrigirTipografia', () => {
  it('diálogo: hífen, meia-risca e travessão colado viram "— "', () => {
    expect(corrigirTipografia('- Oi.')).toBe('— Oi.')
    expect(corrigirTipografia('-- Oi.')).toBe('— Oi.')
    expect(corrigirTipografia('– Oi.')).toBe('— Oi.')
    expect(corrigirTipografia('—Oi.')).toBe('— Oi.')
    expect(corrigirTipografia('—   Oi.')).toBe('— Oi.')
    expect(corrigirTipografia('  - Oi -- disse ele -- e saiu.')).toBe('— Oi — disse ele — e saiu.')
  })
  it('não transforma números em fala nem em travessão', () => {
    expect(corrigirTipografia('-5 graus lá fora.')).toBe('-5 graus lá fora.')
    expect(corrigirTipografia('Eram 1.000 homens, 10 - 5 = 5.')).toBe('Eram 1.000 homens, 10 - 5 = 5.')
    expect(corrigirTipografia('Custa 3,50.')).toBe('Custa 3,50.')
  })
  it('aspas aninhadas e apóstrofos', () => {
    expect(corrigirTipografia('Ele disse: "Ela gritou \'socorro\'".')).toBe('Ele disse: “Ela gritou ‘socorro’”.')
    expect(corrigirTipografia("Copo d'água, pau-d'arco e os anos '90.")).toBe('Copo d’água, pau-d’arco e os anos ’90.')
    expect(corrigirTipografia('— "Vem", disse.')).toBe('— “Vem”, disse.')
    expect(corrigirTipografia(`("sim")`)).toBe('(“sim”)')
  })
  it('reticências, espaços e pontuação', () => {
    expect(corrigirTipografia('Era... noite  ,  disse ele !  ')).toBe('Era… noite, disse ele!')
    expect(corrigirTipografia('Então . . . nada.')).toBe('Então… nada.')
    expect(corrigirTipografia('— …e depois?')).toBe('— …e depois?')
    expect(corrigirTipografia('linha  \nseguinte')).toBe('linha\nseguinte')
  })
  it('texto já correto fica igual (idempotente)', () => {
    const certos = [
      '— Oi — disse ele —, e saiu.',
      'Copo d’água, “aspas” e ‘simples’…',
      'Eram 1.000 homens; 10 - 5 = 5.',
      `Nota${OBJ} aqui. E outra${OBJ}.`,
      '— …e depois?'
    ]
    for (const s of certos) expect(corrigirTipografia(s)).toBe(s)
    const sujos = ['- "Oi"... disse  ela -- triste .', "  'sim' , d'água  ", '—Ah ! ...']
    for (const s of sujos) {
      const um = corrigirTipografia(s)
      expect(corrigirTipografia(um)).toBe(um)
    }
  })
  it('nunca mexe em marcadores de nota e quebra', () => {
    const s = `Palavra${OBJ} ."ok"\n  "fim"`
    const r = corrigirTipografia(s)
    expect(r.split(OBJ).length).toBe(2)
    expect(r.split('\n').length).toBe(2)
    expect(r).toBe(`Palavra${OBJ}.”ok”\n  “fim”`)
  })
})

describe('edições mínimas', () => {
  it('aplicar as edições de trás para frente reproduz o texto corrigido', () => {
    const a = '- "Oi"... disse  ela -- triste .'
    const es = edicoes(a, corrigirTipografia(a))!
    let s = a
    for (const e of [...es].reverse()) s = s.slice(0, e.de) + e.por + s.slice(e.ate)
    expect(s).toBe(corrigirTipografia(a))
  })
  it('classifica cada edição', () => {
    const tipos = edicoesTipografia('- "Oi"... disse  ela -- triste .').map((e) => e.tipo)
    expect(tipos).toEqual(['dialogo', 'aspas', 'aspas', 'reticencias', 'espacos', 'travessao', 'pontuacao'])
  })
})

describe('no documento', () => {
  it('preserva itálico, negrito e notas; cena e figura intactas', () => {
    const d = doc(
      p(t('- '), t('"Oi"...', 'italic'), t('  disse', 'bold'), schema.node('nota', { texto: 'n' }), t(' .')),
      schema.node('cena'),
      schema.node('figura', { src: 'assets/x.png' }),
      p(t('Fim .'))
    )
    const r = corrigirDoc(d)
    const p0 = r.child(0)
    const runs: Array<[string, string]> = []
    p0.forEach((n) => runs.push([n.isText ? n.text! : `[${n.type.name}]`, n.marks.map((m) => m.type.name).join(',')]))
    expect(runs).toEqual([
      ['— ', ''],
      ['“Oi”…', 'italic'],
      [' disse', 'bold'],
      ['[nota]', ''],
      ['.', '']
    ])
    expect(r.child(1).type.name).toBe('cena')
    expect(r.child(2).attrs.src).toBe('assets/x.png')
    expect(r.child(3).textContent).toBe('Fim.')
  })
  it('parágrafos vazios: mais de um seguido vira um', () => {
    const d = doc(p(t('a')), p(), p(), p(), p(t('b')), p(), p(t('c')))
    const r = corrigirDoc(d)
    expect(r.childCount).toBe(5)
    expect(r.child(1).content.size).toBe(0)
    expect(r.child(2).textContent).toBe('b')
  })
  it('é uma transação só e uma segunda passada não acha nada', () => {
    const d = doc(p(t('- Oi -- disse ... ele .')), p(t('"Outro"  parágrafo')))
    const r = corrigirDoc(d)
    expect(r.child(0).textContent).toBe('— Oi — disse… ele.')
    expect(correcoesLocais(r, 0, r.content.size)).toEqual([])
  })
  it('escopo: seleção só corrige o que está inteiro dentro dela', () => {
    const d = doc(p(t('a  b  c... d')))
    // seleciona "b  c.." (posições 4..10): os dois espaços entre b e c entram, as reticências não
    const st = EditorState.create({ doc: d, selection: TextSelection.create(d, 4, 10) })
    const iv = intervaloDoEscopo(st, 'selecao')!
    expect(iv).toEqual({ de: 4, ate: 10 })
    const cs = correcoesLocais(d, iv.de, iv.ate)
    expect(cs.map((c) => c.tipo)).toEqual(['espacos'])
    expect(cs[0]!.de).toBeGreaterThanOrEqual(5)
    expect(cs[0]!.ate).toBeLessThanOrEqual(7)
    const r = st.apply(aplicarCorrecoes(st.tr, cs)).doc
    expect(r.textContent).toBe('a  b c... d')
  })
  it('escopo: parágrafo atual e seleção vazia', () => {
    const d = doc(p(t('um  dois')), p(t('três  quatro')))
    const st = EditorState.create({ doc: d, selection: TextSelection.create(d, 13) })
    expect(intervaloDoEscopo(st, 'selecao')).toBeNull()
    const iv = intervaloDoEscopo(st, 'paragrafo')!
    const cs = correcoesLocais(d, iv.de, iv.ate)
    expect(cs).toHaveLength(1)
    expect(st.apply(aplicarCorrecoes(st.tr, cs)).doc.child(0).textContent).toBe('um  dois')
  })
})

describe('LanguageTool no documento', () => {
  const d = doc(p(t('Ele '), t('fes', 'italic'), t(' isso'), schema.node('nota'), t(' hoje.')), p(t('Caza bonita.')))
  const blocos = blocosNoIntervalo(d, 0, d.content.size)
  const { texto, mapa } = textoParaRevisor(blocos)
  const sug = (original: string, substituto: string, inicio: number): SugestaoCorrigir => ({
    id: `lt-${inicio}-0`,
    categoria: 'ortografia',
    motivo: 'erro',
    original,
    substituto,
    antes: '',
    depois: '',
    inicio
  })

  it('texto sem notas, parágrafos separados por linha em branco', () => {
    expect(texto).toBe('Ele fes isso hoje.\n\nCaza bonita.')
  })
  it('mapeia para o documento e mantém as marcas', () => {
    const cs = correcoesDoRevisor([sug('fes', 'fez', 4), sug('Caza', 'Casa', texto.indexOf('Caza'))], mapa, d, 0, d.content.size)
    expect(cs.map((c) => c.original)).toEqual(['fes', 'Caza'])
    const st = EditorState.create({ doc: d })
    const r = st.apply(aplicarCorrecoes(st.tr, cs)).doc
    expect(r.textBetween(0, r.content.size, '|', '¹')).toBe('Ele fez isso¹ hoje.|Casa bonita.')
    let italico = ''
    r.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'italic')) italico += n.text
    })
    expect(italico).toBe('fez')
  })
  it('descarta trecho que atravessa uma nota ou sai do escopo', () => {
    const atravessa = sug('isso hoje', 'isto hoje', texto.indexOf('isso'))
    expect(correcoesDoRevisor([atravessa], mapa, d, 0, d.content.size)).toEqual([])
    const fora = sug('Caza', 'Casa', texto.indexOf('Caza'))
    expect(correcoesDoRevisor([fora], mapa, d, 0, d.child(0).nodeSize)).toEqual([])
  })
  it('tipografia vence quando as duas mexem no mesmo trecho', () => {
    const d2 = doc(p(t('Um  dois')))
    const loc = correcoesLocais(d2, 0, d2.content.size)
    const lt = correcoesDoRevisor([{ ...sug('  ', ' ', 2), categoria: 'gramatica' }], textoParaRevisor(blocosNoIntervalo(d2, 0, 4)).mapa, d2, 0, d2.content.size)
    expect(lt).toHaveLength(1)
    const tudo = semSobreposicao(loc, lt)
    expect(tudo).toHaveLength(1)
    expect(tudo[0]!.tipo).toBe('espacos')
  })
  it('posição da sugestão: pelo id ou pelo contexto', () => {
    expect(posicaoDaSugestao('a fes b', { id: 'lt-2-0', original: 'fes', antes: 'a ', depois: ' b' })).toBe(2)
    expect(posicaoDaSugestao('a fes b fes', { id: 'x', original: 'fes', antes: 'b ', depois: '' })).toBe(8)
    expect(posicaoDaSugestao('fes fes', { id: 'x', original: 'fes', antes: '', depois: '' })).toBe(-1)
  })
})
