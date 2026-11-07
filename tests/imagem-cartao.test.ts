import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../src/main/project'
import { getDoc, putAsset } from '../src/main/store/docs'
import { handlers as enredo, imagensOrfas, sanearBoard } from '../src/main/features/enredo'
import { lerArquivo } from '../src/main/features/importar-ler'
import { estadoVazio, exportarYaml, importarNoLivro, lerEstado, planejarTexto } from '../src/main/features/importar-livro'
import type { Ctx } from '../src/main/api/context'
import type { EnredoBoard } from '../src/shared/models'
import type { Project } from '../src/shared/types'

/** PNG 1×1 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let raiz = ''
beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'folio-imagem-'))
})
afterEach(async () => {
  await rm(raiz, { recursive: true, force: true })
})

function ctxTeste(): Ctx {
  return {
    web: true,
    resourcesDir: raiz,
    dataDir: raiz,
    libraryDir: join(raiz, 'biblioteca'),
    isAllowed: async () => true,
    remember: async (p: Project) => p,
    pickDirectory: async () => null,
    openExternal: async () => undefined,
    reveal: async () => undefined
  }
}

const cartao = (id: string, imagem?: unknown): Record<string, unknown> => ({ id, tipo: 'cena', titulo: id, texto: '', fichas: [], x: 0, y: 0, imagem })

describe('sanearBoard: imagem do cartão', () => {
  it('aceita só nome de arquivo png/jpg/jpeg/webp', () => {
    const ok = ['cartao-c1-lx2k9a.png', 'rio.JPG', 'mapa_velho.jpeg', 'capa-2.webp']
    const b = sanearBoard({ cartoes: ok.map((n, i) => cartao(`c${i}`, n)) })
    expect(b.cartoes.map((c) => c.imagem)).toEqual(ok)
  })

  it('recusa caminhos, "..", extensões erradas e não-texto', () => {
    const ruins = ['../segredo.png', '..%2fx.png', 'a/b.png', 'a\\b.png', '/etc/x.png', '..png', 'x..png', '.png', 'x.svg', 'x.gif', 'x.png.exe', '', `${'a'.repeat(120)}.png`, 42, { nome: 'x.png' }]
    const b = sanearBoard({ cartoes: ruins.map((n, i) => cartao(`c${i}`, n)) })
    expect(b.cartoes).toHaveLength(ruins.length)
    expect(b.cartoes.every((c) => c.imagem === undefined && !('imagem' in c))).toBe(true)
  })

  it('imagensOrfas: só as do Enredo ("cartao-…") que nenhum cartão usa mais', () => {
    const antes = sanearBoard({
      cartoes: [cartao('a', 'cartao-a-1.png'), cartao('b', 'cartao-b-1.png'), cartao('c', 'rio.png'), cartao('d', 'cartao-x-1.png'), cartao('e', 'cartao-x-1.png')]
    })
    // a trocou a imagem, b saiu do quadro, c (importada) saiu, d saiu mas e ainda usa a mesma
    const depois = sanearBoard({ cartoes: [cartao('a', 'cartao-a-2.png'), cartao('e', 'cartao-x-1.png')] })
    expect(imagensOrfas(antes, depois).sort()).toEqual(['cartao-a-1.png', 'cartao-b-1.png'])
  })

  it('enredo.salvar apaga de assets/ a imagem que ficou sem cartão', async () => {
    const { dir } = await createProject(raiz, 'Livro', 'Alguém')
    await putAsset(dir, 'cartao-a-1.png', PNG)
    await putAsset(dir, 'rio.png', PNG)
    const ctx = ctxTeste()
    await enredo['enredo.salvar']!(ctx, dir, { cartoes: [cartao('a', 'cartao-a-1.png'), cartao('b', 'rio.png')], ligacoes: [] })
    await enredo['enredo.salvar']!(ctx, dir, { cartoes: [cartao('a')], ligacoes: [] })
    const arquivos = await readdir(join(dir, 'assets'))
    expect(arquivos).not.toContain('cartao-a-1.png')
    expect(arquivos).toContain('rio.png')
    const b = await getDoc<EnredoBoard>(dir, 'enredo', 'board')
    expect(b?.cartoes[0]?.imagem).toBeUndefined()
  })
})

describe('importar/exportar: imagem do cartão', () => {
  const yaml = (imagem: string): string => `formato: folio-livro\ncartoes:\n  - titulo: O rio\n    tipo: cena\n    imagem: ${imagem}\n`

  it('o leitor aceita o nome e avisa (sem erro) quando tem pasta', () => {
    expect(lerArquivo(yaml('rio.png')).dados?.cartoes[0]?.imagem).toBe('rio.png')
    const lido = lerArquivo(yaml('../fora.png'))
    expect(lido.erros).toEqual([])
    expect(lido.dados?.cartoes[0]?.imagem).toBeUndefined()
    expect(lido.avisos.some((a) => /fora\.png/.test(a.texto) && a.linha === 5)).toBe(true)
  })

  it('imagem que está em assets/ entra no cartão', async () => {
    const { dir } = await createProject(raiz, 'Livro', 'Alguém')
    await putAsset(dir, 'rio.png', PNG)
    const { previa } = await importarNoLivro(dir, yaml('rio.png'))
    expect(previa.erros).toEqual([])
    expect(previa.avisos).toEqual([])
    const e = await lerEstado(dir)
    expect(e.board.cartoes.find((c) => c.titulo === 'O rio')?.imagem).toBe('rio.png')
  })

  it('imagem que não está em assets/ vira aviso e o campo é ignorado', async () => {
    const { dir } = await createProject(raiz, 'Livro', 'Alguém')
    const { previa } = await importarNoLivro(dir, yaml('sumiu.png'))
    expect(previa.erros).toEqual([])
    expect(previa.avisos.some((a) => /sumiu\.png/.test(a.texto) && /assets/.test(a.texto) && a.linha === 3)).toBe(true)
    expect(previa.criar.map((i) => i.nome)).toEqual(['O rio (cena)'])
    const e = await lerEstado(dir)
    expect(e.board.cartoes[0]?.imagem).toBeUndefined()
    // livro novo (sem assets/) também só avisa
    const novo = planejarTexto(estadoVazio('X', 'Y'), yaml('rio.png')).previa
    expect(novo.erros).toEqual([])
    expect(novo.avisos.some((a) => /rio\.png/.test(a.texto))).toBe(true)
  })

  it('exportar escreve a imagem e reimportar mantém (ida e volta)', async () => {
    const { dir } = await createProject(raiz, 'Livro', 'Alguém')
    await putAsset(dir, 'cartao-c1-abc.png', PNG)
    const ctx = ctxTeste()
    await enredo['enredo.salvar']!(ctx, dir, { cartoes: [{ ...cartao('c1', 'cartao-c1-abc.png'), titulo: 'Ponte', origem: 'autor', estado: 'canonico' }], ligacoes: [] })
    const exportado = exportarYaml(await lerEstado(dir))
    expect(exportado).toMatch(/imagem: cartao-c1-abc\.png/)
    expect(lerArquivo(exportado).dados?.cartoes[0]?.imagem).toBe('cartao-c1-abc.png')

    // no mesmo livro: nada muda
    const mesma = planejarTexto(await lerEstado(dir), exportado).previa
    expect(mesma.avisos).toEqual([])
    expect(mesma.atualizar).toEqual([])
    expect(mesma.criar).toEqual([])

    // em outro livro com o arquivo em assets/: o cartão nasce com a imagem
    const outro = await createProject(raiz, 'Outro', 'Alguém')
    await putAsset(outro.dir, 'cartao-c1-abc.png', PNG)
    const r = await importarNoLivro(outro.dir, exportado)
    expect(r.previa.erros).toEqual([])
    const e = await lerEstado(outro.dir)
    expect(e.board.cartoes.find((c) => c.titulo === 'Ponte')?.imagem).toBe('cartao-c1-abc.png')
    expect(exportarYaml(e)).toMatch(/imagem: cartao-c1-abc\.png/)
  })
})
