import { folio } from '../../api'
import type { Metas } from './ChapterList'

/**
 * Metas de palavras do livro — fonte única: coleção "escrita", doc "metas"
 * ({ metaCapitulo, metaLivro }). A Biblioteca e o Manuscrito leem e gravam
 * aqui.
 *
 * Livros antigos guardavam a meta do livro também em "config/metas"
 * ({ palavras }), editada só pela Biblioteca. Na primeira leitura ela migra
 * para "escrita/metas" (se lá ainda não houver meta do livro) e o doc antigo
 * é apagado.
 */

export const METAS_PADRAO: Metas = { metaCapitulo: 3000, metaLivro: 80000 }

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)

/** Metas gravadas no livro (só os campos que existem). */
export async function lerMetas(dir: string): Promise<Partial<Metas>> {
  const atual = await folio.docs.get<Partial<Metas>>(dir, 'escrita', 'metas').catch(() => null)
  const out: Partial<Metas> = {}
  const cap = num(atual?.metaCapitulo)
  const livro = num(atual?.metaLivro)
  if (cap !== undefined) out.metaCapitulo = cap
  if (livro !== undefined) out.metaLivro = livro
  const legado = await folio.docs.get<{ palavras?: unknown }>(dir, 'config', 'metas').catch(() => null)
  if (legado) {
    const palavras = num(legado.palavras)
    if (out.metaLivro === undefined && palavras) {
      out.metaLivro = palavras
      await salvarMetas(dir, out)
    }
    await folio.docs.delete(dir, 'config', 'metas').catch(() => undefined)
  }
  return out
}

/** Grava as metas (mescla com o que já existe). */
export async function salvarMetas(dir: string, patch: Partial<Metas>): Promise<void> {
  const atual = (await folio.docs.get<Partial<Metas>>(dir, 'escrita', 'metas').catch(() => null)) ?? {}
  const { id: _id, ...resto } = atual as Partial<Metas> & { id?: string }
  await folio.docs.put(dir, 'escrita', 'metas', { ...resto, ...patch })
}
