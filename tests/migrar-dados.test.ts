import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrarDadosAntigos } from '../src/main/migrar-dados'

let raiz = ''
beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'dp-migrar-'))
})
afterEach(() => rm(raiz, { recursive: true, force: true }))

describe('migrarDadosAntigos', () => {
  it('copia settings e recentes da pasta antiga e a deixa como estava', async () => {
    const velha = join(raiz, 'folio')
    const nova = join(raiz, 'Darkpages')
    await mkdir(velha)
    await writeFile(join(velha, 'recentes.json'), '[{"dir":"C:\\\\livros\\\\a"}]')
    await writeFile(join(velha, 'settings.json'), '{"ia":{"provider":"groq"}}')
    await writeFile(join(velha, 'Cookies'), 'x')
    const r = await migrarDadosAntigos(nova, [velha])
    expect(r.sort()).toEqual(['recentes.json', 'settings.json'])
    expect(await readFile(join(nova, 'recentes.json'), 'utf8')).toContain('livros')
    expect((await readdir(velha)).sort()).toEqual(['Cookies', 'recentes.json', 'settings.json'])
    expect(await readdir(nova)).not.toContain('Cookies')
  })

  it('não sobrescreve o que já existe na pasta nova', async () => {
    const velha = join(raiz, 'folio')
    const nova = join(raiz, 'Darkpages')
    await mkdir(velha)
    await mkdir(nova)
    await writeFile(join(velha, 'settings.json'), 'antigo')
    await writeFile(join(nova, 'settings.json'), 'novo')
    expect(await migrarDadosAntigos(nova, [velha])).toEqual([])
    expect(await readFile(join(nova, 'settings.json'), 'utf8')).toBe('novo')
  })

  it('pasta antiga inexistente ou igual à nova: nada acontece', async () => {
    const nova = join(raiz, 'Darkpages')
    expect(await migrarDadosAntigos(nova, [join(raiz, 'nao-existe'), nova, nova.toUpperCase()])).toEqual([])
  })
})
