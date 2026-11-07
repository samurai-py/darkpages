import { DEFAULT_ROTULO_PARTE, numerarItens, rotuloDe, type RotuloCfg } from '../../shared/rotulo'
import type { ChapterContent } from '../../shared/types'

export { extenso, romano } from '../../shared/rotulo'

/** Rótulo acima do título ("Capítulo três", "Primeiro Círculo", "Prólogo", "Parte um"), já na caixa do livro, ou null. */
export function chapterLabelText(kind: ChapterContent['kind'], n: number, cfg: RotuloCfg, cfgParte: RotuloCfg = DEFAULT_ROTULO_PARTE): string | null {
  return rotuloDe(kind, n, cfg, cfgParte)
}

/** Mostra o título quando ele acrescenta algo ao rótulo (prólogo chamado só "Prólogo" não repete). */
export function showsTitle(c: ChapterContent, label: string | null): boolean {
  const t = c.title.trim()
  if (!t) return false
  return !label || t.toLowerCase() !== label.toLowerCase()
}

/**
 * Número de cada item do livro: capítulos (recomeçando em cada parte quando
 * `reiniciar`), partes com o número da parte; prólogo e epílogo ficam com 0.
 */
export function numberChapters(chapters: Array<Pick<ChapterContent, 'kind'>>, reiniciar = false): number[] {
  return numerarItens(chapters, reiniciar)
}
