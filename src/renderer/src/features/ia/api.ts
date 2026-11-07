import { call } from '../../api'
import type { BetaLeitura, Conflito, IdeiasResult, SinonimosResult, Sugestao } from '../../../../shared/models'

/** Chamadas tipadas da feature IA (métodos "ia.*" do processo principal). */

export type Provedor = 'off' | 'ollama' | 'anthropic' | 'openai' | 'gemini'
export type LtModo = 'off' | 'local' | 'publico'

export interface SugestaoModelo {
  ramGb: number
  faixa: 'pequeno' | 'medio' | 'grande'
  modelo: string
  tamanhoGb: number
  motivo: string
}

export interface StatusIa {
  provedor: Provedor
  nomeProvedor: string
  modelo: string
  /** true quando o texto sai da máquina (provedor em nuvem) */
  externo: boolean
  configurado: boolean
  lt: { modo: LtModo; url: string; externo: boolean }
  ram: SugestaoModelo
}

export interface TesteIa {
  ok: boolean
  provedor: Provedor
  modelo: string
  ms: number
  erro?: string
}

export interface ModeloOllama {
  nome: string
  tamanhoGb: number
  parametros: string
  familia: string
}

export interface RevisaoDetalhada {
  sugestoes: Sugestao[]
  avisos: string[]
  geradoEm: string
}

export interface ResultadoAplicar {
  aplicadas: number
  falhas: Array<{ original: string; motivo: string }>
  words: number
  savedAt: string
}

export interface IaSettings {
  provider?: Provedor
  ollamaUrl?: string
  ollamaModel?: string
  anthropicKey?: string
  anthropicModel?: string
  openaiKey?: string
  openaiModel?: string
  geminiKey?: string
  geminiModel?: string
}

export interface RevisorSettings {
  ltModo?: LtModo
  ltUrl?: string
}

export const ia = {
  status: () => call<StatusIa>('ia.status'),
  testar: () => call<TesteIa>('ia.testar'),
  modelosOllama: (url?: string) => call<ModeloOllama[]>('ia.modelosOllama', url ?? ''),
  sugestaoModelo: () => call<SugestaoModelo>('ia.sugestaoModelo'),
  salvarIa: (patch: IaSettings) => call<IaSettings>('ia.salvarAjustes', 'ia', patch),
  salvarRevisor: (patch: RevisorSettings) => call<RevisorSettings>('ia.salvarAjustes', 'revisor', patch),
  ideias: (dir: string, file: string, pedido?: string) => call<IdeiasResult>('ia.ideias', dir, file, pedido ?? ''),
  sinonimos: (palavra: string, frase: string) => call<SinonimosResult>('ia.sinonimos', palavra, frase),
  continuidade: (dir: string, file: string) => call<Conflito[]>('ia.continuidade', dir, file),
  beta: (dir: string, file: string) => call<BetaLeitura>('ia.beta', dir, file),
  betaGet: (dir: string, file: string) => call<BetaLeitura | null>('ia.betaGet', dir, file),
  resumo: (dir: string, file: string) => call<{ resumo: string }>('ia.resumo', dir, file),
  revisar: (dir: string, file: string) => call<Sugestao[]>('ia.revisar', dir, file),
  revisarDetalhado: (dir: string, file: string) => call<RevisaoDetalhada>('ia.revisarDetalhado', dir, file),
  revisaoGet: (dir: string, file: string) => call<RevisaoDetalhada | null>('ia.revisaoGet', dir, file),
  aplicar: (dir: string, file: string, alvo: string[] | Array<{ original: string; substituto: string; antes?: string; depois?: string }>) =>
    call<ResultadoAplicar>('ia.aplicar', dir, file, alvo)
}
