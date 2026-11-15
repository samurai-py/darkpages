import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A pasta de configurações do app mudou de nome (versão 0.1.1: nome fixo
 * "Darkpages"). Sem isto, quem já tinha usado o app abria uma lista de livros
 * vazia e sem as chaves e a conexão do Drive, mesmo com os livros intactos no
 * disco. Na primeira abertura copia os arquivos .json da pasta antiga
 * (settings.json, recentes.json…) para a nova, só os que ainda não existem lá.
 * Copia, não move: a pasta antiga fica como estava.
 */
export async function migrarDadosAntigos(nova: string, antigas: string[]): Promise<string[]> {
  const copiados: string[] = []
  const vistos = new Set([nova.toLowerCase()])
  for (const a of antigas) {
    if (vistos.has(a.toLowerCase())) continue
    vistos.add(a.toLowerCase())
    let nomes: string[]
    try {
      nomes = await readdir(a)
    } catch {
      continue
    }
    for (const n of nomes) {
      if (!/^[A-Za-z0-9._-]+\.json$/.test(n)) continue
      try {
        if (!(await stat(join(a, n))).isFile()) continue
        const destino = join(nova, n)
        const existe = await stat(destino).then(() => true, () => false)
        if (existe) continue
        await mkdir(nova, { recursive: true })
        await copyFile(join(a, n), destino)
        copiados.push(n)
      } catch {
        /* um arquivo ruim não impede os outros */
      }
    }
  }
  return copiados
}
