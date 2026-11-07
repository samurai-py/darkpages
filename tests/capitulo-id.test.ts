import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addChapter, CHAPTER_ID, idDeMigracao, openProject, planejarIds, readChapter, reorderChapters } from '../src/main/project'
import { getDocCapitulo, migrarDocsLegados } from '../src/main/store/capitulo-docs'
import { getDoc, putDoc } from '../src/main/store/docs'

describe('planejarIds', () => {
  it('mantém ids válidos, migra os que faltam, desfaz duplicados', () => {
    const plano = planejarIds([
      { file: '001-a.md', id: 'ch-aaaaaaaaaaaa', titulo: 'A' },
      { file: '002-b.md', titulo: 'B' },
      { file: '003-c.md', id: 'ch-aaaaaaaaaaaa', titulo: 'C' },
      { file: '004-d.md', id: 'lixo', titulo: 'D' }
    ])
    expect(plano.has('001-a.md')).toBe(false)
    expect(plano.get('002-b.md')?.novo).toBe(idDeMigracao('002-b.md', 'B'))
    expect(plano.get('003-c.md')?.novo).toMatch(CHAPTER_ID)
    expect(plano.get('003-c.md')?.novo).not.toBe('ch-aaaaaaaaaaaa')
    expect(plano.get('004-d.md')).toEqual({ atual: 'lixo', novo: idDeMigracao('004-d.md', 'D') })
  })
  it('id de migração é determinístico (dois computadores, mesmo id)', () => {
    expect(idDeMigracao('001-a.md', 'A')).toBe(idDeMigracao('001-a.md', 'A'))
    expect(idDeMigracao('001-a.md', 'A')).toMatch(CHAPTER_ID)
  })
})

describe('migração preguiçosa no disco', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'folio-teste-'))
    await mkdir(join(dir, 'manuscrito'))
    await writeFile(join(dir, 'projeto.yaml'), 'title: Teste\nauthor: Eu\n')
    await writeFile(join(dir, 'manuscrito', '001-a.md'), '---\ntitulo: A\ntipo: prologo\ncena:\n  pov: tome\nextra: guardado\n---\n\nTexto *um*.\n')
    await writeFile(join(dir, 'manuscrito', '002-b.md'), 'Sem front-matter.\n\nDois parágrafos.\n')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('abre o livro antigo, grava ids e não perde nada', async () => {
    const corpoA = (await readChapter(dir, '001-a.md')).body
    expect((await readChapter(dir, '001-a.md')).id).toBeUndefined()
    const p = await openProject(dir)
    expect(p.chapters.map((c) => c.id)).toEqual([idDeMigracao('001-a.md', 'A'), idDeMigracao('002-b.md', '')])
    const a = await readChapter(dir, '001-a.md')
    expect(a.id).toBe(p.chapters[0]?.id)
    expect(a.kind).toBe('prologo')
    expect(a.cena).toEqual({ pov: 'tome' })
    expect(a.body).toBe(corpoA)
    expect(await readFile(join(dir, 'manuscrito', '001-a.md'), 'utf8')).toContain('extra: guardado')
    // arquivo sem front-matter ganha um: o texto fica igual (só a linha em branco após o "---", como todo capítulo salvo pelo app)
    expect((await readChapter(dir, '002-b.md')).body.trimStart()).toBe('Sem front-matter.\n\nDois parágrafos.\n')
  })

  it('segunda abertura não regrava (idempotente)', async () => {
    await openProject(dir)
    const antes = await readFile(join(dir, 'manuscrito', '002-b.md'), 'utf8')
    const p2 = await openProject(dir)
    expect(await readFile(join(dir, 'manuscrito', '002-b.md'), 'utf8')).toBe(antes)
    expect(p2.chapters[1]?.id).toBe(idDeMigracao('002-b.md', ''))
  })

  it('arquivo duplicado à mão ganha id próprio', async () => {
    await openProject(dir)
    const raw = await readFile(join(dir, 'manuscrito', '001-a.md'), 'utf8')
    await writeFile(join(dir, 'manuscrito', '003-copia.md'), raw)
    const p = await openProject(dir)
    const ids = p.chapters.map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe(idDeMigracao('001-a.md', 'A'))
  })

  it('o id acompanha o capítulo ao reordenar; capítulo novo nasce com id', async () => {
    const p = await openProject(dir)
    const [a, b] = p.chapters
    await reorderChapters(dir, ['002-b.md', '001-a.md'])
    const p2 = await openProject(dir)
    expect(p2.chapters.map((c) => [c.file, c.id])).toEqual([
      ['001-b.md', b?.id],
      ['002-a.md', a?.id]
    ])
    const p3 = await addChapter(dir, 'Novo')
    expect(p3.chapters.at(-1)?.id).toMatch(CHAPTER_ID)
  })

  it('documentos por capítulo saem da chave antiga (nome do arquivo) para o id', async () => {
    const p = await openProject(dir)
    await putDoc(dir, 'resumos', '001-a', { resumo: 'velho', hash: 'h' })
    await putDoc(dir, 'beta', '002-b', { funciona: 'sim' })
    // leitura preguiçosa
    const r = await getDocCapitulo<{ resumo: string }>(dir, 'resumos', '001-a.md')
    expect(r?.resumo).toBe('velho')
    expect(await getDoc(dir, 'resumos', '001-a')).toBeNull()
    expect(await getDoc(dir, 'resumos', p.chapters[0]!.id)).not.toBeNull()
    // antes de reordenar
    await migrarDocsLegados(dir, p.chapters)
    expect(await readdir(join(dir, 'beta'))).toEqual([`${p.chapters[1]!.id}.json`])
  })
})

describe('mapas: ligações com fichas e cartões excluídos', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'folio-mapas-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  it('tira a ponta excluída e a ligação que fica vazia', async () => {
    const { desligarDosMapas } = await import('../src/main/features/mapas')
    await putDoc(dir, 'mapas', 'mapa-1', {
      nome: 'M',
      ligacoes: [
        { id: 'l1', item: 's1', fichaId: 'f-morta' },
        { id: 'l2', item: 's2', fichaId: 'f-morta', cartaoId: 'c-vivo' },
        { id: 'l3', item: 's3', cartaoId: 'c-morto' },
        { id: 'l4', item: 's4', fichaId: 'f-viva' }
      ]
    })
    await putDoc(dir, 'mapas', 'mapa-2', { nome: 'N', ligacoes: [{ id: 'l1', item: 's1', fichaId: 'f-viva' }] })
    expect(await desligarDosMapas(dir, { fichas: ['f-morta'], cartoes: ['c-morto'] })).toBe(1)
    const m = await getDoc<{ ligacoes: unknown[] }>(dir, 'mapas', 'mapa-1')
    expect(m?.ligacoes).toEqual([
      { id: 'l2', item: 's2', cartaoId: 'c-vivo' },
      { id: 'l4', item: 's4', fichaId: 'f-viva' }
    ])
  })
})
