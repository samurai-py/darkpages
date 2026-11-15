/**
 * Atualização do app (só na versão instalada; prefixo "atualizacao.").
 * Contratos, tratados em src/main/atualizar.ts (nunca passam pelo modo web):
 * - 'atualizacao.estado'() → EstadoAtualizacao
 * - 'atualizacao.verificar'() → EstadoAtualizacao (consulta as releases do GitHub)
 * - 'atualizacao.baixar'() → EstadoAtualizacao (só se há versão nova; baixa e confere o hash)
 * - 'atualizacao.instalar'() → fecha o app e instala (só depois de baixada)
 * Nada é baixado nem instalado sem o clique do usuário.
 */

export type FaseAtualizacao = 'indisponivel' | 'parado' | 'verificando' | 'atual' | 'disponivel' | 'baixando' | 'pronto' | 'erro'

export interface EstadoAtualizacao {
  fase: FaseAtualizacao
  /** versão instalada agora */
  versaoAtual: string
  /** versão nova encontrada */
  versao?: string
  /** 0 a 100, enquanto baixa */
  progresso?: number
  /** por que não atualiza sozinho (portátil, modo web…) ou o que deu errado */
  mensagem?: string
  /** página da release, para ler o que mudou */
  url?: string
}
