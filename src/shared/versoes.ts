/**
 * Contratos da feature Versões (prefixo "versoes."): snapshots da Arca,
 * diff por palavra, restauração e lixeira de capítulos.
 */

export type MotivoSnapshot =
  | 'automático'
  | 'antes de reordenar'
  | 'antes de aplicar revisão'
  | 'antes de importar'
  | 'antes de restaurar'
  | 'manual'

export const MOTIVOS: MotivoSnapshot[] = [
  'automático',
  'antes de reordenar',
  'antes de aplicar revisão',
  'antes de importar',
  'antes de restaurar',
  'manual'
]

/** Um snapshot do manuscrito em .arca/<id>/ */
export interface SnapshotInfo {
  /** nome da pasta em .arca/ (carimbo de data) */
  id: string
  motivo: MotivoSnapshot
  rotulo?: string
  criadoEm: string
  /** capítulos guardados no snapshot */
  arquivos: string[]
  /** capítulos atuais que diferem do snapshot (ou não existem nele) e capítulos do snapshot que saíram do livro */
  diferentes: string[]
}

/** Uma versão de um capítulo específico. */
export interface VersaoCapitulo {
  id: string
  motivo: MotivoSnapshot
  rotulo?: string
  criadoEm: string
  /** nome do arquivo dentro do snapshot (pode diferir do atual se houve reordenação) */
  arquivo: string
  titulo: string
  palavras: number
  /** texto idêntico ao atual */
  igual: boolean
}

export type OpDiff = { t: '=' | '+' | '-'; s: string }

export interface ResultadoDiff {
  ops: OpDiff[]
  /** palavras inseridas e removidas */
  adicionadas: number
  removidas: number
  /** false se o diff ficou grande demais e saiu por parágrafo inteiro */
  porPalavra: boolean
}

export interface DiffVersao extends ResultadoDiff {
  tituloVersao: string
  tituloAtual: string
}

export interface ItemLixeira {
  /** nome do arquivo em .arca/lixeira/ */
  nome: string
  /** nome original do capítulo */
  arquivo: string
  titulo: string
  palavras: number
  excluidoEm: string
}

export interface DiffConflito extends ResultadoDiff {
  arquivo: string
  copia: string
  /** false para arquivos binários ou grandes demais (sem diff) */
  texto: boolean
}
