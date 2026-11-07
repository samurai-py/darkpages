/**
 * Tipos da feature Arte, usados pelo processo principal e pela interface
 * (a interface importa só tipos daqui: `import type`).
 */

export type Paleta = 'mono' | 'sepia' | 'cor'
export type TipoSaida = 'abertura' | 'retrato' | 'capa'

/** Proporção largura:altura, ou 'livro' (mesma proporção do miolo do livro). */
export type Proporcao = [number, number] | 'livro'

export type Alvo = { tipo: 'abertura'; chapterFile: string } | { tipo: 'retrato'; fichaId: string } | { tipo: 'capa' }

export interface EstiloArte {
  id: string
  nome: string
  descricao: string
  /** prompt base do estilo (inglês: os modelos locais entendem melhor) */
  prompt: string
  negativo: string
  paleta: Paleta
  proporcoes: Record<TipoSaida, Proporcao>
  /** true nos 6 estilos de fábrica (não editáveis) */
  preset: boolean
  /** estilo de fábrica usado como ponto de partida (para a prévia do cartão) */
  base?: string
}

export interface Chip {
  rotulo: string
  valor: string
}

export interface PromptMontado {
  chave: string
  alvo: Alvo
  /** rótulo legível do alvo: "Cap. 3 · A ponte" */
  rotulo: string
  estilo: string
  estiloNome: string
  paleta: Paleta
  prompt: string
  negativo: string
  chips: Chip[]
  semente: number
  variacao: number
  proporcao: [number, number]
  largura: number
  altura: number
  /** aviso quando a IA de texto não pôde ajudar (prompt montado só com dados do livro) */
  aviso?: string
}

export type StatusItem = 'fila' | 'gerando' | 'pronto' | 'erro' | 'cancelado'

export interface ItemFila {
  id: string
  chave: string
  alvo: Alvo
  rotulo: string
  status: StatusItem
  erro?: string
  /** prompt editado à mão (vazio = montar na hora de gerar) */
  promptManual?: string
  /** true = nova variação (semente deslocada) */
  variar: boolean
  criadoEm: string
  inicio?: number
  fim?: number
  asset?: string
}

export interface GeracaoMeta {
  chave: string
  alvo: Alvo
  asset: string
  prompt: string
  negativo: string
  estilo: string
  semente: number
  variacao: number
  provedor: string
  modelo: string
  largura: number
  altura: number
  posProcesso: string
  criadoEm: string
  duracaoMs: number
}

export interface EstadoFila {
  itens: ItemFila[]
  /** última geração gravada por chave ("abertura:003-x.md", "retrato:<id>", "capa") */
  geradas: Record<string, GeracaoMeta>
  /** duração média recente de uma geração (ms) no provedor atual */
  mediaMs: number | null
  /** estimativa do que falta para esvaziar a fila deste livro (ms) */
  restanteMs: number | null
  provedor: ProvedorId
}

export type ProvedorId = 'off' | 'comfyui' | 'openai'

export interface ArteSettings {
  provedor: ProvedorId
  comfyUrl: string
  comfyCheckpoint: string
  /** lado base em px: a área gerada é lado×lado distribuída na proporção pedida */
  comfyLado: number
  comfyPassos: number
  comfyCfg: number
  /** workflow próprio em formato API, com {{prompt}} {{negativo}} {{semente}} {{largura}} {{altura}}; vazio = padrão */
  comfyWorkflow: string
  openaiKey: string
  openaiModel: string
  openaiQualidade: 'auto' | 'low' | 'medium' | 'high'
}

export interface TesteResultado {
  ok: boolean
  mensagem: string
  checkpoints?: string[]
}

export function chaveDe(alvo: Alvo): string {
  if (alvo.tipo === 'abertura') return `abertura:${alvo.chapterFile}`
  if (alvo.tipo === 'retrato') return `retrato:${alvo.fichaId}`
  return 'capa'
}
