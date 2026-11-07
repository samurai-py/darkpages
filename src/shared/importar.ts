/**
 * Contratos da importação de "regras e dados" do livro inteiro (formato
 * "folio-livro", versão 1 — ver docs/modelo-livro.yaml e docs/IMPORTAR.md).
 * Métodos 'importar.*' em src/main/features/importar.ts. DONO: Biblioteca.
 */
import type { Project } from './types'

export const FORMATO_LIVRO = 'folio-livro'
export const VERSAO_LIVRO = 1
/** tamanho máximo do arquivo de importação (caracteres) */
export const MAX_IMPORTACAO = 2 * 1024 * 1024

export type SecaoImport =
  | 'livro'
  | 'metas'
  | 'perfil'
  | 'nomes'
  | 'ficha'
  | 'capitulo'
  | 'parte'
  | 'cartao'
  | 'ligacao'
  | 'manter'
  | 'paginas'

/** Uma coisa que a importação cria ou atualiza. */
export interface ItemPrevia {
  secao: SecaoImport
  /** nome da ficha, título do capítulo/cartão, "Perfil da obra"… */
  nome: string
  /** o que muda ("Olhos: verdes → cinzentos", "sinopse") — só em "atualizar" */
  mudancas?: string[]
}

/** Aviso ou erro, com a linha do arquivo quando dá para saber. */
export interface MsgPrevia {
  linha?: number
  texto: string
}

export interface PreviaImport {
  criar: ItemPrevia[]
  atualizar: ItemPrevia[]
  avisos: MsgPrevia[]
  /** com qualquer erro, nada é gravado */
  erros: MsgPrevia[]
  /** explicações fixas (ordem dos capítulos, texto preservado…) */
  notas: string[]
}

/** 'importar.aplicar' / 'importar.novoLivro' → o que foi feito e o livro reaberto. */
export interface ResultadoImport extends PreviaImport {
  project: Project
}

export interface OpcoesExport {
  /** inclui o texto dos capítulos (padrão: não) */
  comTexto?: boolean
}
