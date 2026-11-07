/**
 * Utilidades de Markdown do Manuscrito no processo principal. A leitura do
 * texto para exportar (DOCX, TXT), diagramar (Typst) e gerar o EPUB é UMA só:
 * layout/markdown.ts. Aqui ficam só atalhos sobre ela.
 */

import { blockText, decodeEntities, parseBody } from '../layout/markdown'

export { decodeEntities }

/** Markdown → texto puro (sem notas; quebra de cena vira "* * *"), pelo leitor único. */
export function mdToPlain(md: string): string {
  return parseBody(md)
    .blocks.map((b) => (b.t === 'scene' ? '* * *' : blockText(b)))
    .filter(Boolean)
    .join('\n\n')
}
