import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema, type Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import type { Ctx } from '../src/main/api/context'
import type { AiRequest } from '../src/main/ai/index'
import type { ResultadoIaCorrigir, SugestaoCorrigir } from '../src/shared/corrigir'
import {
  aplicarCorrecoes,
  blocosNoIntervalo,
  correcoesDoRevisor,
  correcoesLocais,
  semSobreposicao,
  textoParaRevisor
} from '../src/renderer/src/features/manuscrito/corrigir'

// provedor de IA falso: nenhuma chamada real
const pedidos: AiRequest[] = []
let resposta = ''
vi.mock('../src/main/ai/index', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/main/ai/index')>()
  return {
    ...orig,
    aiSettings: async () => ({ ...orig.AI_DEFAULTS, provider: 'anthropic' as const, anthropicKey: 'x' }),
    aiChat: async (_ctx: Ctx, req: AiRequest) => {
      pedidos.push(req)
      return resposta
    }
  }
})

const { handlers, partesDoTexto } = await import('../src/main/features/corrigir')

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    nota: { group: 'inline', inline: true, atom: true }
  },
  marks: { italic: {}, bold: {} }
})
const t = (s: string, ...marks: Array<'italic' | 'bold'>): PMNode => schema.text(s, marks.map((m) => schema.marks[m]!.create()))
const p = (...c: PMNode[]): PMNode => schema.node('paragraph', null, c)
const doc = (...c: PMNode[]): PMNode => schema.node('doc', null, c)

const iaSug = (original: string, substituto: string, inicio: number, categoria: SugestaoCorrigir['categoria'] = 'repeticao'): SugestaoCorrigir => ({
  id: `ia-${inicio}-0`,
  categoria,
  motivo: 'repetição',
  original,
  substituto,
  antes: '',
  depois: '',
  inicio
})

describe('trocas da IA no documento', () => {
  it('aplica só o que mudou: o itálico do resto do trecho fica', () => {
    const d = doc(p(t('A sombra cobria a '), t('sombra', 'italic'), t(' do muro.')))
    const { texto, mapa } = textoParaRevisor(blocosNoIntervalo(d, 0, d.content.size))
    const original = 'A sombra cobria a sombra do muro.'
    expect(texto).toBe(original)
    const cs = correcoesDoRevisor([iaSug(original, 'A penumbra cobria a sombra do muro.', 0)], mapa, d, 0, d.content.size, true)
    expect(cs).toHaveLength(1)
    expect(cs[0]!.ia).toBe(true)
    expect(cs[0]!.tipo).toBe('repeticao')
    const st = EditorState.create({ doc: d })
    const r = st.apply(aplicarCorrecoes(st.tr, cs)).doc
    expect(r.textContent).toBe('A penumbra cobria a sombra do muro.')
    let italico = ''
    r.descendants((n) => {
      if (n.isText && n.marks.length) italico += n.text
    })
    expect(italico).toBe('sombra')
  })

  it('repetição e estilo só valem vindos da IA', () => {
    const d = doc(p(t('Ele viu.')))
    const { mapa } = textoParaRevisor(blocosNoIntervalo(d, 0, d.content.size))
    expect(correcoesDoRevisor([iaSug('viu', 'olhou', 4, 'estilo')], mapa, d, 0, d.content.size)).toEqual([])
    expect(correcoesDoRevisor([iaSug('viu', 'olhou', 4, 'estilo')], mapa, d, 0, d.content.size, true)).toHaveLength(1)
  })

  it('a tipografia convive com a reescrita da IA no mesmo trecho quando mexem em lugares diferentes', () => {
    const d = doc(p(t('Ele disse "sim" e disse mais.')))
    const loc = correcoesLocais(d, 0, d.content.size)
    expect(loc.length).toBeGreaterThan(0)
    const { mapa } = textoParaRevisor(blocosNoIntervalo(d, 0, d.content.size))
    const orig = 'Ele disse "sim" e disse mais.'
    const ia = correcoesDoRevisor([iaSug(orig, 'Ele disse "sim" e falou mais.', 0)], mapa, d, 0, d.content.size, true)
    const tudo = semSobreposicao(loc, ia)
    expect(tudo.some((c) => c.ia)).toBe(true)
    const st = EditorState.create({ doc: d })
    expect(st.apply(aplicarCorrecoes(st.tr, tudo)).doc.textContent).toBe('Ele disse “sim” e falou mais.')
  })
})

describe('corrigir.ia com provedor falso', () => {
  let dir = ''
  let ctx: Ctx
  beforeEach(async () => {
    pedidos.length = 0
    dir = await mkdtemp(join(tmpdir(), 'folio-corrigir-ia-'))
    await mkdir(join(dir, 'manuscrito'))
    await writeFile(join(dir, 'projeto.yaml'), 'title: Teste\nauthor: Eu\n')
    await writeFile(join(dir, 'manuscrito', '001-a.md'), '---\ntitulo: A\n---\n\nTexto.\n')
    ctx = {
      web: false,
      resourcesDir: dir,
      dataDir: dir,
      libraryDir: dir,
      isAllowed: async () => true,
      remember: async (x) => x,
      pickDirectory: async () => null,
      openExternal: async () => undefined,
      reveal: async () => undefined
    }
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('manda achados e repetições; só volta troca cujo trecho existe', async () => {
    const texto = 'Ele caminhava pela sombra. A sombra crescia e a sombra o seguia.\n\nEla fes o jantar.'
    const achados = [{ categoria: 'ortografia', inicio: texto.indexOf('fes'), original: 'fes', substituto: 'fez', motivo: 'erro de grafia' }]
    resposta = JSON.stringify({
      trocas: [
        { categoria: 'ortografia', motivo: 'grafia', original: 'Ela fes', substituto: 'Ela fez' },
        { categoria: 'repeticao', motivo: 'sombra 3x', original: 'e a sombra o seguia', substituto: 'e ela o seguia' },
        { categoria: 'estilo', motivo: 'inventado', original: 'trecho que não existe', substituto: 'x' },
        // aparece duas vezes sem desempate perto de um achado: fora
        { categoria: 'estilo', motivo: 'ambíguo', original: 'a sombra', substituto: 'o escuro' }
      ]
    })
    const r = (await handlers['corrigir.ia']!(ctx, dir, '001-a.md', texto, achados, 0)) as ResultadoIaCorrigir
    expect(r.total).toBe(1)
    expect(r.sugestoes.map((s) => [s.categoria, s.original, s.substituto, s.inicio])).toEqual([
      ['ortografia', 'Ela fes', 'Ela fez', texto.indexOf('Ela fes')],
      ['repeticao', 'e a sombra o seguia', 'e ela o seguia', texto.indexOf('e a sombra o seguia')]
    ])
    expect(r.avisos.join(' ')).toMatch(/2 trocas da IA descartadas/)
    const prompt = pedidos[0]?.messages[0]?.content ?? ''
    expect(prompt).toContain('[ortografia] "fes"')
    expect(prompt).toContain('[repeticao]')
    expect(prompt).toContain('## Trecho\n')
  })

  it('texto longo vai em partes, com posições no texto inteiro', async () => {
    const par = 'Uma frase qualquer que ocupa espaço no parágrafo. '.repeat(30).trim()
    const texto = [par, par, par, 'Fim com erro aqui.'].join('\n\n')
    const partes = partesDoTexto(texto)
    expect(partes.length).toBeGreaterThan(1)
    const ult = partes.length - 1
    resposta = JSON.stringify({ trocas: [{ categoria: 'gramatica', motivo: 'x', original: 'erro aqui', substituto: 'acerto aqui' }] })
    const r = (await handlers['corrigir.ia']!(ctx, dir, '001-a.md', texto, [], ult)) as ResultadoIaCorrigir
    expect(r.total).toBe(partes.length)
    expect(r.sugestoes[0]!.inicio).toBe(texto.indexOf('erro aqui'))
  })
})
