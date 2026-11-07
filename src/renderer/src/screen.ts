import type { Project } from '../../shared/types'

export type Screen =
  | 'biblioteca'
  | 'manuscrito'
  | 'universo'
  | 'enredo'
  | 'mapas'
  | 'idioma'
  | 'revisor'
  | 'arte'
  | 'diagramar'
  | 'ajustes'

/** Parâmetros opcionais de navegação (ex.: abrir uma ficha ou um capítulo específico). */
export interface NavParams {
  chapter?: string
  ficha?: string
  [k: string]: string | undefined
}

/** Props comuns de toda tela que trabalha dentro de um livro. */
export interface ScreenProps {
  project: Project
  onProject: (p: Project) => void
  go: (screen: Screen, params?: NavParams) => void
  params: NavParams
}
