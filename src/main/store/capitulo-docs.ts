import { idDoCapitulo } from '../project'
import { deleteDoc, getDoc, putDoc } from './docs'
import type { ChapterInfo } from '../../shared/types'

/**
 * Documentos "um por capítulo" (resumos, leitura beta, revisão, estado dos
 * insights) ficam chaveados pelo id estável do capítulo (front-matter "id"),
 * e não pelo nome do arquivo: reordenar renomeia o arquivo, o id fica.
 *
 * Livros antigos têm esses documentos com o nome do arquivo como chave
 * ("014-a-ponte"). Eles migram sozinhos: na primeira leitura (preguiçosa) ou
 * antes de reordenar (`migrarDocsLegados`), enquanto o nome do arquivo ainda
 * aponta para o capítulo certo.
 */

export const COLECOES_POR_CAPITULO = ['resumos', 'beta', 'revisoes', 'insights-estado'] as const
export type ColecaoPorCapitulo = (typeof COLECOES_POR_CAPITULO)[number]

/** Chave antiga: nome do arquivo sem .md (014-x.md → 014-x). */
export function chaveLegada(file: string): string {
  return file.replace(/\.md$/, '')
}

/** Move o documento legado para a chave do id (se ainda não existe lá). */
async function migrarUm<T extends object>(dir: string, col: ColecaoPorCapitulo, file: string, id: string): Promise<(T & { id: string }) | null> {
  const velho = chaveLegada(file)
  const legado = await getDoc<T>(dir, col, velho)
  if (!legado) return null
  const atual = await getDoc<T>(dir, col, id)
  if (atual) {
    await deleteDoc(dir, col, velho)
    return atual
  }
  const { id: _velho, ...resto } = legado
  const novo = await putDoc(dir, col, id, resto as T)
  await deleteDoc(dir, col, velho)
  return novo
}

/** Lê o documento do capítulo (migrando o legado, se houver). `id` evita reler o capítulo quando já se sabe. */
export async function getDocCapitulo<T extends object>(dir: string, col: ColecaoPorCapitulo, file: string, id?: string): Promise<(T & { id: string }) | null> {
  const chave = id ?? (await idDoCapitulo(dir, file))
  return (await getDoc<T>(dir, col, chave)) ?? (await migrarUm<T>(dir, col, file, chave))
}

export async function putDocCapitulo<T extends object>(dir: string, col: ColecaoPorCapitulo, file: string, data: T, id?: string): Promise<T & { id: string }> {
  const chave = id ?? (await idDoCapitulo(dir, file))
  return putDoc(dir, col, chave, data)
}

/** Antes de renomear arquivos: leva para o id todos os documentos ainda chaveados pelo nome. */
export async function migrarDocsLegados(dir: string, chapters: ChapterInfo[]): Promise<void> {
  for (const c of chapters) {
    for (const col of COLECOES_POR_CAPITULO) await migrarUm(dir, col, c.file, c.id)
  }
}
