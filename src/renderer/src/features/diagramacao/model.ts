import {
  DEFAULT_LAYOUT,
  type ChapterLabel,
  type CoverSettings,
  type DropCapStyle,
  type FolioPosition,
  type FrontMatter,
  type LayoutSettings,
  type OpeningStyle,
  type SceneOrnament
} from '../../../../shared/types'

// Tipos das respostas da API (só tipos: nada do processo principal entra no bundle da interface).
export type { PreviewResult, PageGeometry } from '../../../../main/layout/preview'
export type { CoverResult } from '../../../../main/layout/cover-export'
export type { EpubResult } from '../../../../main/layout/epub'
export type { ItemChecagem, Nivel } from '../../../../main/layout/preflight'
export type { FonteDisponivel } from '../../../../main/layout/fonts'

export type FullLayout = Required<LayoutSettings> & { front: FrontMatter; cover: CoverSettings }

const D = DEFAULT_LAYOUT as FullLayout

/** Completa o layout salvo com os padrões (projetos antigos não têm os campos novos). */
export function withDefaults(l: LayoutSettings): FullLayout {
  return {
    ...D,
    ...l,
    trim: { ...D.trim, ...l.trim },
    margins: { ...D.margins, ...l.margins },
    paper: { ...D.paper, ...l.paper },
    chapters: l.chapters ?? {},
    front: { ...D.front, ...(l.front ?? {}) },
    cover: { ...D.cover, ...(l.cover ?? {}) }
  } as FullLayout
}

export const TRIMS: { label: string; w: number; h: number }[] = [
  { label: '16 × 23 cm', w: 160, h: 230 },
  { label: '14 × 21 cm', w: 140, h: 210 },
  { label: '15,5 × 23 cm', w: 155, h: 230 },
  { label: 'A5 · 14,8 × 21 cm', w: 148, h: 210 },
  { label: 'Bolso · 11 × 18 cm', w: 110, h: 180 },
  { label: 'KDP 5 × 8 pol', w: 127, h: 203.2 },
  { label: 'KDP 5,5 × 8,5 pol', w: 139.7, h: 215.9 },
  { label: 'KDP 6 × 9 pol', w: 152.4, h: 228.6 }
]

/** Tabela de papéis nacionais (caliper = espessura de uma folha). Ajustável pelo que a gráfica informar. */
export const PAPERS: { name: string; caliperMm: number }[] = [
  { name: 'Pólen Soft 70 g', caliperMm: 0.093 },
  { name: 'Pólen 80 g', caliperMm: 0.1 },
  { name: 'Pólen 90 g', caliperMm: 0.115 },
  { name: 'Offset 63 g', caliperMm: 0.08 },
  { name: 'Offset 75 g', caliperMm: 0.09 },
  { name: 'Offset 90 g', caliperMm: 0.11 },
  { name: 'Couché 115 g', caliperMm: 0.1 }
]

export const OPENINGS: { v: OpeningStyle; label: string }[] = [
  { v: 'classica', label: 'Clássica' },
  { v: 'ornamentada', label: 'Ornamentada' },
  { v: 'arte', label: 'Arte de abertura' },
  { v: 'simples', label: 'Simples' }
]

export const DROPCAPS: { v: DropCapStyle; label: string }[] = [
  { v: 'descida', label: 'Capitular descida' },
  { v: 'elevada', label: 'Capitular elevada' },
  { v: 'nenhuma', label: 'Sem capitular' }
]

export const ORNAMENTS: { v: SceneOrnament; label: string }[] = [
  { v: 'asterismo', label: '⁂ Asterismo' },
  { v: 'asteriscos', label: '* * * Asteriscos' },
  { v: 'losango', label: '—◆— Losango' },
  { v: 'vinheta', label: 'Vinheta desenhada' },
  { v: 'linha', label: 'Filete' },
  { v: 'espaco', label: 'Linha em branco' }
]

export const LABELS: { v: ChapterLabel; label: string }[] = [
  { v: 'numero', label: 'Capítulo 3' },
  { v: 'extenso', label: 'Capítulo três' },
  { v: 'romano', label: 'Capítulo III' },
  { v: 'nenhum', label: 'Só o título' }
]

export const FOLIOS: { v: FolioPosition; label: string }[] = [
  { v: 'rodape-centro', label: 'Rodapé, centro' },
  { v: 'rodape-externo', label: 'Rodapé, canto externo' },
  { v: 'cabecalho-externo', label: 'Cabeçalho, canto externo' }
]

export function spine(pages: number, caliperMm: number): number {
  return Math.round(Math.ceil(pages / 2) * caliperMm * 10) / 10
}

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
