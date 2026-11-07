import { describe, expect, it, vi } from 'vitest'
import {
  DICA_TESAURO,
  Tesauro,
  formasBasicas,
  indiceDoDat,
  lerIndice,
  lerVerbete,
  nomeClasse,
  resolverSinonimos,
  resultadoDoVerbete
} from '../src/main/ai/tesauro'
import type { SinonimosResult } from '../src/shared/models'

/** Fixture pequena no formato MyThes (escrita aqui; o dicionário real não vai para o git). */
const DAT = [
  'UTF-8',
  'correr|2',
  '(Sinônimo)disparar|disparar|correr|galopar|voar',
  '(v)fluir|fluir|correr|escorrer|voar',
  'sombra|3',
  '(Sinônimo)escuridão|escuridão|sombra|treva|penumbra',
  '(Sinônimo)vestígio|vestígio|sombra|sinal|indício',
  '(Sinônimo)escuridão|escuridão|treva',
  'coração|1',
  '(s)âmago|âmago|centro|cerne|coração',
  'belo|1',
  '(adj)bonito|bonito|lindo|formoso|belo',
  'olhar|1',
  '(Sinônimo)fitar|fitar|mirar|observar|olhar',
  ''
].join('\n')

function idxDe(dat: Buffer): string {
  const i = indiceDoDat(dat)
  const linhas = [...i].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}|${v}`)
  return `UTF-8\n${linhas.length}\n${linhas.join('\n')}\n`
}

const buf = Buffer.from(DAT, 'utf8')

describe('leitura MyThes', () => {
  it('monta o índice varrendo o .dat (deslocamento em bytes, com acentos)', () => {
    const i = indiceDoDat(buf)
    expect([...i.keys()]).toEqual(['correr', 'sombra', 'coração', 'belo', 'olhar'])
    expect(buf.subarray(i.get('coração')!, i.get('coração')! + Buffer.byteLength('coração|')).toString('utf8')).toBe('coração|')
  })
  it('lê o .idx no mesmo formato do th_gen_idx.pl', () => {
    expect(lerIndice(idxDe(buf))).toEqual(indiceDoDat(buf))
  })
  it('lê sentidos com classe e rótulo', () => {
    const v = lerVerbete(buf, indiceDoDat(buf).get('correr')!, 'utf8')!
    expect(v.entrada).toBe('correr')
    expect(v.sentidos).toEqual([
      { classe: 'Sinônimo', titulo: 'disparar', palavras: ['disparar', 'correr', 'galopar', 'voar'] },
      { classe: 'v', titulo: 'fluir', palavras: ['fluir', 'correr', 'escorrer', 'voar'] }
    ])
  })
  it('aceita arquivo em ISO8859-1', () => {
    const latin = Buffer.from(DAT.replace('UTF-8', 'ISO8859-1'), 'latin1')
    const t = Tesauro.deBuffers(latin)
    expect(t.buscar('coração')?.lema).toBe('coração')
  })
  it('classe legível; "Sinônimo" não é classe', () => {
    expect(nomeClasse('adj')).toBe('adjetivo')
    expect(nomeClasse('v')).toBe('verbo')
    expect(nomeClasse('Sinônimo')).toBe('')
  })
})

describe('busca', () => {
  const t = Tesauro.deBuffers(buf, idxDe(buf))
  it('exata, sem maiúsculas e sem acento', () => {
    expect(t.buscar('Sombra')).toMatchObject({ lema: 'sombra', exato: true })
    expect(t.buscar('coracao')).toMatchObject({ lema: 'coração', exato: true })
  })
  it('forma flexionada → forma básica', () => {
    expect(formasBasicas('olhou')).toContain('olhar')
    expect(t.buscar('olhou')).toMatchObject({ lema: 'olhar', exato: false })
    expect(t.buscar('belas')).toMatchObject({ lema: 'belo', exato: false })
    expect(t.buscar('corações')).toMatchObject({ lema: 'coração' })
  })
  it('cai no radical quando a forma básica não bate', () => {
    expect(t.buscar('correndo')).toMatchObject({ lema: 'correr', exato: false })
    expect(t.buscar('sombras')).toMatchObject({ lema: 'sombra' })
  })
  it('palavra ausente → null', () => {
    expect(t.buscar('xyzzy')).toBeNull()
    expect(t.buscar('  ')).toBeNull()
  })
  it('resultado: sem a própria palavra, rótulos e repetidas primeiro, sentidos separados', () => {
    const r = resultadoDoVerbete('sombra', t.buscar('sombra')!)
    expect(r.sinonimos[0]).toBe('escuridão') // rótulo de 2 sentidos
    expect(r.sinonimos).not.toContain('sombra')
    expect(r.sinonimos).toContain('treva')
    expect(r.sentidos?.map((s) => s.titulo)).toEqual(['escuridão', 'vestígio', 'escuridão'])
    expect(r).toMatchObject({ fortes: [], classe: '', fonte: 'tesauro' })
    expect(r.lema).toBeUndefined()
    expect(resultadoDoVerbete('correndo', t.buscar('correndo')!).lema).toBe('correr')
    expect(resultadoDoVerbete('belo', t.buscar('belo')!).classe).toBe('adjetivo')
  })
})

describe('resolverSinonimos (dicionário primeiro, IA sob pedido)', () => {
  const t = Tesauro.deBuffers(buf)
  const daIa: SinonimosResult = { sinonimos: ['galopou'], fortes: ['disparou'], classe: 'verbo · passado' }
  const deps = (o: { tesauro?: Tesauro | null; ia?: boolean }) => ({
    tesauro: vi.fn(async () => (o.tesauro === undefined ? t : o.tesauro)),
    iaConfigurada: vi.fn(async () => o.ia ?? false),
    ia: vi.fn(async () => daIa)
  })

  it('achou no dicionário: não chama a IA, mas avisa se ela está disponível', async () => {
    const d = deps({ ia: true })
    const r = await resolverSinonimos('correr', 'auto', d)
    expect(r.fonte).toBe('tesauro')
    expect(r.iaDisponivel).toBe(true)
    expect(d.ia).not.toHaveBeenCalled()
  })
  it('modo ia: chama a IA', async () => {
    const d = deps({ ia: true })
    expect(await resolverSinonimos('correr', 'ia', d)).toMatchObject({ ...daIa, fonte: 'ia' })
  })
  it('modo ia sem IA configurada: erro claro', async () => {
    await expect(resolverSinonimos('correr', 'ia', deps({ ia: false }))).rejects.toThrow(/Configure a IA/)
  })
  it('sem dicionário e com IA: comportamento antigo + dica do fetch', async () => {
    const r = await resolverSinonimos('correr', 'auto', deps({ tesauro: null, ia: true }))
    expect(r).toMatchObject({ sinonimos: ['galopou'], fonte: 'ia', aviso: DICA_TESAURO })
  })
  it('sem dicionário e sem IA: lista vazia com a dica, sem erro', async () => {
    const r = await resolverSinonimos('correr', 'auto', deps({ tesauro: null, ia: false }))
    expect(r).toMatchObject({ sinonimos: [], fortes: [], iaDisponivel: false, aviso: DICA_TESAURO })
  })
  it('palavra fora do dicionário: IA se houver, senão aviso', async () => {
    const comIa = deps({ ia: true })
    expect((await resolverSinonimos('xyzzy', 'auto', comIa)).fonte).toBe('ia')
    const semIa = await resolverSinonimos('xyzzy', 'auto', deps({ ia: false }))
    expect(semIa.sinonimos).toEqual([])
    expect(semIa.aviso).toMatch(/não está no dicionário/)
  })
})
