import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, openProject, readChapter } from '../src/main/project'
import { getDoc, listDocs } from '../src/main/store/docs'
import { lerArquivo } from '../src/main/features/importar-ler'
import { estadoVazio, exportarYaml, importarNoLivro, lerEstado, planejarTexto } from '../src/main/features/importar-livro'
import { handlers } from '../src/main/features/importar'
import type { Ctx } from '../src/main/api/context'
import type { DecisaoRevisao, EnredoBoard, Ficha, PerfilObra } from '../src/shared/models'
import type { ResultadoImport } from '../src/shared/importar'
import type { Project } from '../src/shared/types'
import { resolveRotuloParte } from '../src/shared/rotulo'

const MODELO = resolve(__dirname, '../docs/modelo-livro.yaml')

let raiz = ''
let modelo = ''
beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'folio-importar-'))
  modelo = await readFile(MODELO, 'utf8')
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

const semComentarios = (y: string): string =>
  y
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim()

describe('leitura do modelo', () => {
  it('o arquivo de exemplo lê sem erros e a prévia (livro novo) não tem erros', () => {
    const lido = lerArquivo(modelo)
    expect(lido.erros).toEqual([])
    expect(lido.dados?.fichas.map((f) => f.nome)).toEqual(['Viktor', 'Elisa', 'Limbo'])
    const { previa } = planejarTexto(estadoVazio('MEU LIVRO', 'Mario'), modelo)
    expect(previa.erros).toEqual([])
    expect(previa.criar.filter((i) => i.secao === 'ficha')).toHaveLength(3)
    expect(previa.criar.filter((i) => i.secao === 'capitulo' || i.secao === 'parte')).toHaveLength(4)
    expect(previa.criar.filter((i) => i.secao === 'cartao')).toHaveLength(4)
  })

  it('referência que não existe vira aviso (com linha), não erro', () => {
    const { previa } = planejarTexto(estadoVazio('MEU LIVRO', 'Mario'), modelo)
    const textos = previa.avisos.map((a) => a.texto).join('\n')
    expect(textos).toMatch(/Nunca é Suficiente/)
    expect(textos).toMatch(/Sem Perdão/)
    expect(previa.avisos.every((a) => typeof a.linha === 'number')).toBe(true)
  })

  it('valor fora da lista é erro do item, com a linha', () => {
    const y = 'formato: folio-livro\nversao: 1\nfichas:\n  - nome: Viktor\n    tipo: heroi\n  - nome: Elisa\n'
    const { previa } = planejarTexto(estadoVazio('X', 'Y'), y)
    expect(previa.erros).toHaveLength(1)
    expect(previa.erros[0]?.linha).toBe(5)
    expect(previa.erros[0]?.texto).toMatch(/heroi/)
    // o item com erro sai; o outro segue
    expect(previa.criar.map((i) => i.nome)).toEqual(['Elisa (personagem)'])
  })

  it('chave desconhecida é aviso; YAML quebrado é erro com linha', () => {
    const a = planejarTexto(estadoVazio('X', 'Y'), 'formato: folio-livro\nfichas:\n  - nome: A\n    olhos: verdes\n').previa
    expect(a.erros).toEqual([])
    expect(a.avisos.some((m) => /olhos/.test(m.texto) && m.linha === 4)).toBe(true)
    const b = planejarTexto(estadoVazio('X', 'Y'), 'fichas:\n  - nome: A\n   tipo: lugar\n').previa
    expect(b.erros.length).toBeGreaterThan(0)
    expect(b.erros[0]?.linha).toBe(3)
  })

  it('formato e versão errados são erro', () => {
    expect(planejarTexto(estadoVazio(), 'formato: outro\n').previa.erros).toHaveLength(1)
    expect(planejarTexto(estadoVazio(), 'formato: folio-livro\nversao: 2\n').previa.erros).toHaveLength(1)
  })
})

describe('aplicar no livro', () => {
  it('cria fichas, histórico, relações, capítulos, partes, cartões, ligação, perfil, manter e páginas', async () => {
    const p = await createProject(raiz, 'Rascunho', 'Alguém')
    const dir = p.dir
    const { previa } = await importarNoLivro(dir, modelo)
    expect(previa.erros).toEqual([])

    const proj = await openProject(dir)
    expect(proj.meta.title).toBe('MEU LIVRO')
    expect(proj.meta.author).toBe('Mario')
    // o capítulo que já existia fica no começo; os novos entram na ordem do arquivo
    expect(proj.chapters.map((c) => [c.title, c.kind])).toEqual([
      ['Capítulo um', 'capitulo'],
      ['O Portão', 'prologo'],
      ['A Descida', 'parte'],
      ['Segunda Morte', 'capitulo'],
      ['Tudo o Que Amamos', 'capitulo']
    ])
    const segunda = proj.chapters[3]!
    const tudo = proj.chapters[4]!

    const fichas = await listDocs<Ficha>(dir, 'universo')
    const por = (n: string): Ficha => fichas.find((f) => f.nome === n)!
    expect(fichas).toHaveLength(3)
    const viktor = por('Viktor')
    expect(viktor.apelidos).toEqual(['Vik', 'o Condenado'])
    expect(viktor.campos.find((c) => c.nome === 'Idade')?.valor).toBe('41')
    expect(viktor.campos.find((c) => c.nome === 'Status')).toEqual({ nome: 'Status', valor: 'vivo', historico: [{ valor: 'morto', desde: segunda.id }] })
    expect(viktor.relacoes).toEqual([{ alvo: por('Elisa').id, rotulo: 'marido de' }])
    expect(por('Limbo').tipo).toBe('lugar')

    const cap = await readChapter(dir, segunda.file)
    expect(cap.cena).toEqual({
      sinopse: 'Viktor descobre que pode morrer de novo no inferno.',
      pov: viktor.id,
      cenario: por('Limbo').id,
      notas: 'Fechar com a primeira pista sobre Elisa.'
    })
    expect(cap.epigrafe).toEqual({ texto: "Lasciate ogne speranza, voi ch'intrate.", autor: 'Dante' })
    expect((await readChapter(dir, tudo.file)).body).toMatch(/Você não lembra o nome dela/)

    const board = (await getDoc<EnredoBoard>(dir, 'enredo', 'board'))!
    expect(board.cartoes).toHaveLength(4)
    const card = (t: string) => board.cartoes.find((c) => c.titulo === t)!
    const morre = card('Viktor morre pela segunda vez')
    expect(morre).toMatchObject({ tipo: 'cena', capitulo: segunda.file, fichas: [viktor.id], origem: 'autor', estado: 'canonico', ordem: 0 })
    expect(card('O nome da esposa é Elisa')).toMatchObject({ tipo: 'fato', perspectiva: { tipo: 'verdade' }, termos: ['Elisa'] })
    expect(card('O nome da esposa é Elisa').revelarEm).toBeUndefined()
    expect(card('Viktor acredita que está aqui por ter matado o irmão').perspectiva).toEqual({ tipo: 'crenca', fichaId: viktor.id })
    expect(card('Quem empurrou Viktor?')).toMatchObject({ tipo: 'ideia', fio: { status: 'aberto' }, capitulo: segunda.file, ordem: 1 })
    // grade sem sobreposição
    const pos = new Set(board.cartoes.map((c) => `${c.x},${c.y}`))
    expect(pos.size).toBe(4)
    expect(board.ligacoes).toEqual([
      expect.objectContaining({ de: morre.id, para: card('Quem empurrou Viktor?').id, tipo: 'causa', rotulo: 'abre a pergunta' })
    ])

    const perfil = (await getDoc<PerfilObra>(dir, 'config', 'perfil'))!
    expect(perfil).toMatchObject({ narradorNaoConfiavel: true, ambiguidadeDeliberada: true, naoLinear: false })
    expect(perfil.notasIa).toMatch(/nove círculos/)

    const dec = (await getDoc<{ itens: DecisaoRevisao[] }>(dir, 'revisao', 'decisoes'))!.itens
    expect(dec.map((d) => [d.tipo, d.valor])).toEqual([
      ['manter-palavra', 'sombra'],
      ['manter-palavra', 'cinza'],
      ['manter-trecho', 'Nunca é suficiente.']
    ])

    expect(await getDoc(dir, 'escrita', 'metas')).toMatchObject({ metaLivro: 90000, metaCapitulo: 3000 })

    const l = proj.meta.layout
    expect(l.rotulo).toMatchObject({ estilo: 'ordinal-palavra', palavra: 'Círculo', genero: 'm', caixa: 'maiusculas' })
    // as partes do modelo são iguais ao padrão: nada a gravar, o efetivo continua "Parte um"
    expect(resolveRotuloParte(l)).toMatchObject({ estilo: 'classico-extenso', palavra: 'Parte' })
    expect(l.front).toMatchObject({
      dedicatoria: true,
      dedicatoriaTexto: 'Para quem desceu e voltou.',
      epigrafe: true,
      epigrafeAutor: 'Dante Alighieri',
      editora: 'Edição do autor',
      cidade: 'São Paulo',
      ano: '2027',
      agradecimentos: true,
      sobreAutor: true,
      sobreAutorTexto: 'Mario escreve à noite.',
      posfacio: false
    })
    expect(l.cover?.sinopse).toBe('Um homem morre. Depois morre de novo.')

    // versão de segurança antes de gravar
    const arca = await import('../src/main/arca')
    const snaps = await arca.listarSnapshots(dir)
    expect(snaps.some((s) => s.motivo === 'antes de importar regras')).toBe(true)
  })

  it('importar de novo é idempotente (nada a criar nem atualizar, sem duplicados)', async () => {
    const { dir } = await createProject(raiz, 'Rascunho', 'Alguém')
    await importarNoLivro(dir, modelo)
    const antes = await lerEstado(dir)
    const { previa } = planejarTexto(antes, modelo)
    expect(previa.criar).toEqual([])
    expect(previa.atualizar).toEqual([])
    expect(previa.notas.join(' ')).toMatch(/a ordem do livro não muda/)
    await importarNoLivro(dir, modelo)
    const depois = await lerEstado(dir)
    expect(depois.fichas).toHaveLength(3)
    expect(depois.capitulos).toHaveLength(5)
    expect(depois.board.cartoes).toHaveLength(4)
    expect(depois.board.ligacoes).toHaveLength(1)
    expect(depois.decisoes).toHaveLength(3)
    expect(JSON.stringify(depois.board)).toBe(JSON.stringify(antes.board))
  })

  it('atualiza só os campos presentes e casa nomes sem acento/maiúsculas', async () => {
    const { dir } = await createProject(raiz, 'Rascunho', 'Alguém')
    await importarNoLivro(dir, modelo)
    const y = 'formato: folio-livro\nfichas:\n  - nome: VIKTOR\n    campos: { Olhos: verdes }\ncapitulos:\n  - titulo: segunda morte\n    sinopse: Outra sinopse.\n'
    const { previa } = planejarTexto(await lerEstado(dir), y)
    expect(previa.criar).toEqual([])
    expect(previa.atualizar.map((i) => i.nome)).toEqual(['Viktor', 'Segunda Morte'])
    await importarNoLivro(dir, y)
    const e = await lerEstado(dir)
    const v = e.fichas.find((f) => f.nome === 'Viktor')!
    expect(v.campos.find((c) => c.nome === 'Olhos')?.valor).toBe('verdes')
    expect(v.apelidos).toEqual(['Vik', 'o Condenado'])
    const c = e.capitulos.find((x) => x.titulo === 'Segunda Morte')!
    expect(c.cena.sinopse).toBe('Outra sinopse.')
    expect(c.cena.notas).toBe('Fechar com a primeira pista sobre Elisa.')
  })

  it('texto de capítulo existente só muda com substituir_texto: true', async () => {
    const { dir } = await createProject(raiz, 'Rascunho', 'Alguém')
    const a = 'capitulos:\n  - titulo: Capítulo um\n    texto: Novo texto.\n'
    const p1 = planejarTexto(await lerEstado(dir), a).previa
    expect(p1.avisos.some((m) => /substituir_texto/.test(m.texto))).toBe(true)
    expect(p1.atualizar).toEqual([])
    await importarNoLivro(dir, `${a}    substituir_texto: true\n`)
    const p = await openProject(dir)
    expect((await readChapter(dir, p.chapters[0]!.file)).body.trim()).toBe('Novo texto.')
  })

  it('com erro, aplicar não grava nada', async () => {
    const { dir } = await createProject(raiz, 'Rascunho', 'Alguém')
    await expect(importarNoLivro(dir, 'fichas:\n  - nome: A\n    tipo: heroi\n  - nome: B\n')).rejects.toThrow(/Linha 3/)
    expect(await listDocs(dir, 'universo')).toEqual([])
  })
})

describe('exportar e importar de novo', () => {
  it('exportar → criar livro a partir do arquivo reproduz os mesmos dados', async () => {
    const { dir } = await createProject(raiz, 'Rascunho', 'Alguém')
    await importarNoLivro(dir, modelo)
    const yaml = exportarYaml(await lerEstado(dir), { comTexto: true })
    expect(planejarTexto(estadoVazio('MEU LIVRO', 'Mario'), yaml).previa.erros).toEqual([])

    const ctx = ctxTeste()
    const r = (await handlers['importar.novoLivro']!(ctx, yaml)) as ResultadoImport
    expect(r.erros).toEqual([])
    expect(r.project.dir).not.toBe(dir)
    expect(r.project.chapters.map((c) => c.title)).toEqual(['Capítulo um', 'O Portão', 'A Descida', 'Segunda Morte', 'Tudo o Que Amamos'])
    const copia = exportarYaml(await lerEstado(r.project.dir), { comTexto: true })
    expect(semComentarios(copia)).toBe(semComentarios(yaml))

    // e reimportar a exportação no livro original não muda nada
    const { previa } = planejarTexto(await lerEstado(dir), yaml)
    expect(previa.criar).toEqual([])
    expect(previa.atualizar).toEqual([])
  })

  it('a prévia sem livro exige título e autor', async () => {
    const r = (await handlers['importar.previa']!(ctxTeste(), null, 'fichas:\n  - nome: A\n')) as { erros: unknown[] }
    expect(r.erros).toHaveLength(2)
  })
})

describe('project.yaml colado no importador', () => {
  it('explica que é o arquivo do livro e como abrir a pasta, em vez de reclamar de livro/titulo', () => {
    const { previa } = planejarTexto(estadoVazio('X', 'Y'), 'title: Meu Livro\nauthor: Eu\n')
    expect(previa.erros).toHaveLength(1)
    expect(previa.erros[0]!.texto).toMatch(/project\.yaml/)
    expect(previa.erros[0]!.texto).toMatch(/Abrir livro existente/)
  })
})

