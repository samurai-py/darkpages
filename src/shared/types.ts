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
  /** LEGADO: como numerar o rótulo dos capítulos. Substituído por `rotulo`; lido só quando `rotulo` não existe. */
  chapterLabel?: ChapterLabel
  /** nome dos capítulos do livro (estilo, palavra, gênero, caixa, modelo) — ver shared/rotulo.ts */
  rotulo?: import('./rotulo').RotuloCfg
  /** nome das partes do livro ("Parte um", "Livro I"…) — ver shared/rotulo.ts */
  rotuloParte?: import('./rotulo').RotuloCfg
  /** a numeração dos capítulos recomeça em 1 a cada parte (padrão: continua) */
  reiniciarNumeracao?: boolean
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
  // ---- páginas finais (opcionais em livros antigos; padrão em DEFAULT_LAYOUT) ----
  posfacio?: boolean
  /** texto do posfácio (Markdown simples: parágrafos, itálico, notas) */
  posfacioTexto?: string
  agradecimentos?: boolean
  agradecimentosTexto?: string
  sobreAutor?: boolean
  sobreAutorTexto?: string
  /** foto do autor em <livro>/assets/ (png ou jpg), ou vazio */
  sobreAutorFoto?: string
}

/** Perfil de saída do PDF do miolo. */
export type PerfilPdf = 'grafica' | 'kdp' | 'tela'

/** Epígrafe de abertura de um capítulo (front-matter "epigrafe" do capítulo). DONO: Diagramação */
export interface EpigrafeCap {
  texto: string
  autor?: string
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

/**
 * 'parte' = divisão do livro ("Parte um", "Livro I"): um item da ordem do
 * manuscrito com título e texto curto opcional; os capítulos seguintes
 * pertencem a ela até a próxima parte. Não conta na numeração dos capítulos.
 */
export type ChapterKind = 'capitulo' | 'prologo' | 'epilogo' | 'parte'

export interface ChapterInfo {
  /** nome do arquivo dentro de manuscrito/ (ex.: 001-o-ultimo-sino.md). Muda ao reordenar. */
  file: string
  /** id estável (front-matter "id", ex.: ch-3f9a1c0b7d2e). Nunca muda: use para referências duradouras. */
  id: string
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
  /** id estável (ver ChapterInfo.id); ausente só em capítulo ainda não migrado */
  id?: string
  title: string
  kind: ChapterKind
  body: string
  /** metadados de cena (front-matter "cena"). DONO: Manuscrito */
  cena?: import('./models').CenaMeta
  /** chaves de conflitos de continuidade marcados como "foi de propósito" (front-matter "ignorados") */
  ignorados?: string[]
  /** epígrafe de abertura do capítulo (front-matter "epigrafe"). DONO: Diagramação */
  epigrafe?: EpigrafeCap
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
    colofaoTexto: '',
    posfacio: false,
    posfacioTexto: '',
    agradecimentos: false,
    agradecimentosTexto: '',
    sobreAutor: false,
    sobreAutorTexto: '',
    sobreAutorFoto: ''
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
