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
  // ---- Diagramação completa (todos opcionais; padrão em DEFAULT_LAYOUT) ----
  /** estilo de abertura padrão dos capítulos */
  opening?: OpeningStyle
  /** em que página entra a arte de abertura: ímpar (a arte abre, o texto começa no verso) ou par (frontispício diante da abertura) */
  openingArtPage?: 'impar' | 'par'
  /** capitular padrão na primeira letra de cada capítulo */
  dropCap?: DropCapStyle
  /** quantas linhas a capitular descida ocupa (2 a 5) */
  dropCapLines?: number
  /** cor da capitular (#rrggbb) */
  dropCapColor?: string
  /** ornamento da quebra de cena (*** ou ⁂ no texto) */
  sceneOrnament?: SceneOrnament
  /** como numerar o rótulo dos capítulos */
  chapterLabel?: ChapterLabel
  /** cabeçalho corrente: título do livro nas pares, do capítulo nas ímpares */
  runningHead?: boolean
  /** posição do número de página */
  folio?: FolioPosition
  /** evitar viúvas e órfãs */
  avoidWidows?: boolean
  /** ajustes por capítulo (chave = arquivo do capítulo) */
  chapters?: Record<string, ChapterLayout>
  /** páginas iniciais e finais */
  front?: FrontMatter
  /** capa para gráfica */
  cover?: CoverSettings
}

export type OpeningStyle = 'classica' | 'ornamentada' | 'arte' | 'simples'
export type DropCapStyle = 'nenhuma' | 'descida' | 'elevada'
export type SceneOrnament = 'asterismo' | 'asteriscos' | 'losango' | 'vinheta' | 'linha' | 'espaco'
export type ChapterLabel = 'numero' | 'extenso' | 'romano' | 'nenhum'
export type FolioPosition = 'rodape-centro' | 'rodape-externo' | 'cabecalho-externo'

export interface ChapterLayout {
  opening?: OpeningStyle
  dropCap?: DropCapStyle
}

export interface FrontMatter {
  falsoRosto: boolean
  rosto: boolean
  creditos: boolean
  dedicatoria: boolean
  epigrafe: boolean
  sumario: boolean
  colofao: boolean
  subtitulo: string
  editora: string
  cidade: string
  ano: string
  edicao: string
  isbn: string
  /** texto livre da ficha catalográfica (CIP), uma linha por linha */
  ficha: string
  /** linhas extras dos créditos (revisão, capa, ilustrações…) */
  creditosTexto: string
  dedicatoriaTexto: string
  epigrafeTexto: string
  epigrafeAutor: string
  colofaoTexto: string
}

export interface CoverSettings {
  /** texto da quarta capa */
  sinopse: string
  /** cor de fundo da capa (#rrggbb) */
  fundo: string
  /** cor do texto (#rrggbb) */
  texto: string
  /** cor de destaque (lombada, filetes) */
  destaque: string
  /** imprimir código de barras EAN-13 do ISBN na quarta capa */
  codigoBarras: boolean
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
  /** metadados de cena (front-matter "cena"). DONO: Manuscrito */
  cena?: import('./models').CenaMeta
  /** chaves de conflitos de continuidade marcados como "foi de propósito" (front-matter "ignorados") */
  ignorados?: string[]
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
  cropMarks: true,
  opening: 'classica',
  openingArtPage: 'impar',
  dropCap: 'descida',
  dropCapLines: 3,
  dropCapColor: '#8A2A1E',
  sceneOrnament: 'asterismo',
  chapterLabel: 'numero',
  runningHead: true,
  folio: 'rodape-centro',
  avoidWidows: true,
  chapters: {},
  front: {
    falsoRosto: true,
    rosto: true,
    creditos: true,
    dedicatoria: false,
    epigrafe: false,
    sumario: true,
    colofao: true,
    subtitulo: '',
    editora: '',
    cidade: '',
    ano: String(new Date().getFullYear()),
    edicao: '1ª edição',
    isbn: '',
    ficha: '',
    creditosTexto: '',
    dedicatoriaTexto: '',
    epigrafeTexto: '',
    epigrafeAutor: '',
    colofaoTexto: ''
  },
  cover: {
    sinopse: '',
    fundo: '#1E1A15',
    texto: '#F3ECDD',
    destaque: '#B8893A',
    codigoBarras: true
  }
}

/** Lombada = folhas × caliper. Folhas = páginas / 2 (arredondado para cima). */
export function spineWidthMm(pages: number, caliperMm: number): number {
  return Math.round(Math.ceil(pages / 2) * caliperMm * 10) / 10
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}
