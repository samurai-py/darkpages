import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ctx } from '../src/main/api/context'
import type { AiRequest } from '../src/main/ai/index'
import type { ConferenciaPlano } from '../src/shared/models'

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

const { handlers } = await import('../src/main/features/ia')
const { openProject } = await import('../src/main/project')
const { putDoc } = await import('../src/main/store/docs')

describe('ia.conferirPlano com provedor falso', () => {
  let dir = ''
  let ctx: Ctx
  beforeEach(async () => {
    pedidos.length = 0
    dir = await mkdtemp(join(tmpdir(), 'folio-plano-'))
    await mkdir(join(dir, 'manuscrito'))
    await writeFile(join(dir, 'projeto.yaml'), 'title: Teste\nauthor: Eu\n')
    await writeFile(
      join(dir, 'manuscrito', '001-a.md'),
      '---\ntitulo: A igreja\ncena:\n  sinopse: Tomé ouve o sino e foge.\n---\n\nTomé entrou na igreja. O sino tocou sozinho.\n\nEle ficou parado.\n'
    )
    ctx = {
      web: false,
      resourcesDir: dir,
      dataDir: dir,
      libraryDir: dir,
      isAllowed: async () => true,
      remember: async (p) => p,
      pickDirectory: async () => null,
      openExternal: async () => undefined,
      reveal: async () => undefined
    }
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('manda o plano à IA e valida a resposta (trecho precisa existir no texto)', async () => {
    const capId = (await openProject(dir)).chapters[0]?.id ?? ''
    await putDoc(dir, 'enredo', 'board', {
      cartoes: [
        { id: 'c1', tipo: 'cena', titulo: 'Tomé foge', texto: '', fichas: [], x: 0, y: 0, capitulo: '001-a.md', ordem: 0, origem: 'autor', estado: 'canonico', criadoEm: '' },
        { id: 'c2', tipo: 'cena', titulo: 'Velha ideia', texto: '', fichas: [], x: 0, y: 0, capitulo: '001-a.md', origem: 'ia', estado: 'descartado', criadoEm: '' },
        { id: 'f1', tipo: 'fato', titulo: 'O sino é amaldiçoado', texto: '', fichas: [], x: 0, y: 0, revelarEm: capId, origem: 'autor', estado: 'canonico', criadoEm: '' }
      ],
      ligacoes: []
    })
    resposta = JSON.stringify({
      itens: [
        { alvo: 'S', tipo: 'divergente', explicacao: 'Ele ouve o sino, mas não foge.', trecho: 'O sino tocou sozinho.' },
        { alvo: 'C1', tipo: 'faltando', explicacao: 'Não há fuga.', trecho: 'Tomé correu para a rua.' },
        { alvo: 'C9', tipo: 'cumprido', explicacao: 'inventado' }
      ]
    })
    const r = (await handlers['ia.conferirPlano']!(ctx, dir, '001-a.md')) as ConferenciaPlano
    expect(r.itens).toEqual([
      { tipo: 'divergente', alvo: { tipo: 'sinopse', titulo: 'Sinopse da cena' }, explicacao: 'Ele ouve o sino, mas não foge.', trecho: 'O sino tocou sozinho.' },
      { tipo: 'faltando', alvo: { tipo: 'cartao', id: 'c1', titulo: 'Tomé foge' }, explicacao: 'Não há fuga.' }
    ])
    expect(r.semResposta).toEqual([{ tipo: 'fato', id: 'f1', titulo: 'O sino é amaldiçoado' }])
    expect(pedidos).toHaveLength(1)
    const msg = pedidos[0]?.messages[0]?.content ?? ''
    expect(msg).toContain('- S: Tomé ouve o sino e foge.')
    expect(msg).toContain('- C1: [cena] Tomé foge')
    expect(msg).toContain('- R1: fato que o leitor passa a saber neste capítulo: O sino é amaldiçoado')
    expect(msg).not.toContain('Velha ideia')
    // o fato revelado aqui já vale como fato do livro no contexto
    expect(msg).toContain('## Fatos do livro (o leitor já sabe)')
  })

  it('sem plano, explica o que fazer; resposta vazia vira erro legível', async () => {
    await writeFile(join(dir, 'manuscrito', '001-a.md'), '---\ntitulo: A\n---\n\nTexto.\n')
    await expect(handlers['ia.conferirPlano']!(ctx, dir, '001-a.md')).rejects.toThrow(/ainda não tem plano/)
    await writeFile(join(dir, 'manuscrito', '001-a.md'), '---\ntitulo: A\ncena:\n  sinopse: algo\n---\n\nTexto.\n')
    resposta = '{"itens":[]}'
    await expect(handlers['ia.conferirPlano']!(ctx, dir, '001-a.md')).rejects.toThrow(/não devolveu/)
  })
})
