/**
 * Ponte entre o painel de Insights (no topo do app) e o Manuscrito aberto.
 * O Manuscrito registra as funções enquanto está montado; o painel usa para
 * salvar antes de aplicar uma troca no arquivo e recarregar depois.
 */
export interface PonteManuscrito {
  /** capítulo aberto no editor */
  file: string | null
  flush: () => Promise<void>
  recarregar: (file: string) => void
  rascunhoPendente: () => boolean
}

export const ponte: { atual: PonteManuscrito | null } = { atual: null }
