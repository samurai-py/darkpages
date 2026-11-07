/** Tipos compartilhados entre o processo principal e a interface. */

export interface Trim {
  /** largura do miolo em mm (ex.: 160) */
  widthMm: number
  /** altura do miolo em mm (ex.: 230) */
  heightMm: number
}

export interface Margins {
  topMm: number
  bottomMm: number
  insideMm: number
  outsideMm: number
}

export interface Paper {
  name: string
  /** espessura de uma folha (2 páginas) em mm */
  caliperMm: number
}

export interface LayoutSettings {
  trim: Trim
  margins: Margins
  paper: Paper
  font: string
  bodyPt: number
  /** altura de linha relativa ao corpo (ex.: 1.32) */
  lineHeight: number
  bleedMm: number
  cropMarks: boolean
}

export interface ProjectMeta {
  title: string
  author: string
  layout: LayoutSettings
}

export type ChapterKind = 'capitulo' | 'prologo' | 'epilogo'

export interface ChapterInfo {
  /** nome do arquivo dentro de manuscrito/ (ex.: 001-o-ultimo-sino.md) */
  file: string
  title: string
  kind: ChapterKind
  words: number
}

export interface Project {
  dir: string
  meta: ProjectMeta
  chapters: ChapterInfo[]
}

export interface ChapterContent {
  file: string
  title: string
  kind: ChapterKind
  body: string
}

export interface SaveResult {
  savedAt: string
  words: number
  snapshot: boolean
}

export interface ExportResult {
  pdfPath: string
  pages: number
  spineMm: number
}

export interface RecentProject {
  dir: string
  title: string
  openedAt: string
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  trim: { widthMm: 160, heightMm: 230 },
  margins: { topMm: 20, bottomMm: 22, insideMm: 18, outsideMm: 15 },
  paper: { name: 'Pólen 80 g', caliperMm: 0.1 },
  font: 'EB Garamond',
  bodyPt: 10.5,
  lineHeight: 1.32,
  bleedMm: 5,
  cropMarks: true
}

/** Lombada = folhas × caliper. Folhas = páginas / 2 (arredondado para cima). */
export function spineWidthMm(pages: number, caliperMm: number): number {
  return Math.round(Math.ceil(pages / 2) * caliperMm * 10) / 10
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}
