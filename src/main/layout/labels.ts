import { rotuloDe, type RotuloCfg } from '../../shared/rotulo'
import type { ChapterContent } from '../../shared/types'

export { extenso, romano } from '../../shared/rotulo'

/** Rótulo acima do título ("Capítulo três", "Primeiro Círculo", "Prólogo"), já na caixa do livro, ou null. */
export function chapterLabelText(kind: ChapterContent['kind'], n: number, cfg: RotuloCfg): string | null {
  return rotuloDe(kind, n, cfg)
}

/** Mostra o título quando ele acrescenta algo ao rótulo (prólogo chamado só "Prólogo" não repete). */
export function showsTitle(c: ChapterContent, label: string | null): boolean {
  const t = c.title.trim()
  if (!t) return false
  return !label || t.toLowerCase() !== label.toLowerCase()
}

/** Numera só os capítulos (prólogo e epílogo ficam sem número). */
export function numberChapters(chapters: ChapterContent[]): number[] {
  let n = 0
  return chapters.map((c) => (c.kind === 'capitulo' ? (n += 1) : 0))
}
