import { call } from '../../api'
import { ASSET_NAMES, type ArteConfig } from '../../../../shared/models'
import type {
  Alvo,
  ArteSettings,
  EstadoFila,
  EstiloArte,
  ItemFila,
  PromptMontado,
  TesteResultado
} from '../../../../main/arte/tipos'

export type { Alvo, ArteSettings, EstadoFila, EstiloArte, ItemFila, PromptMontado, TesteResultado }
export type { GeracaoMeta, Paleta, Proporcao, StatusItem, TipoSaida, ProvedorId } from '../../../../main/arte/tipos'

/** Chamadas da feature Arte (métodos "arte.*" no processo principal). */
export const arte = {
  estilos: (dir: string) => call<EstiloArte[]>('arte.estilos', dir),
  salvarEstilo: (dir: string, e: Omit<EstiloArte, 'preset'>) => call<EstiloArte>('arte.salvarEstilo', dir, e),
  excluirEstilo: (dir: string, id: string) => call<void>('arte.excluirEstilo', dir, id),
  config: (dir: string) => call<ArteConfig>('arte.config', dir),
  salvarConfig: (dir: string, patch: Partial<ArteConfig>) => call<ArteConfig>('arte.salvarConfig', dir, patch),
  prompt: (dir: string, alvo: Alvo) => call<PromptMontado>('arte.prompt', dir, alvo),
  gerar: (dir: string, alvo: Alvo, prompt?: string, opcoes?: { variar?: boolean }) =>
    call<ItemFila>('arte.gerar', dir, alvo, prompt ?? '', opcoes ?? {}),
  lote: (dir: string, chapterFiles: string[], opcoes?: { refazer?: boolean }) =>
    call<EstadoFila>('arte.lote', dir, chapterFiles, opcoes ?? {}),
  fila: (dir: string) => call<EstadoFila>('arte.fila', dir),
  cancelar: (dir: string, chave?: string) => call<EstadoFila>('arte.cancelar', dir, chave ?? null),
  limpar: (dir: string) => call<EstadoFila>('arte.limpar', dir),
  validarUrl: (url: string) => call<string>('arte.validarUrl', url),
  testar: (patch?: Partial<ArteSettings>) => call<TesteResultado & { provedor: string }>('arte.testar', patch ?? {})
}

export function chaveDe(alvo: Alvo): string {
  if (alvo.tipo === 'abertura') return `abertura:${alvo.chapterFile}`
  if (alvo.tipo === 'retrato') return `retrato:${alvo.fichaId}`
  return 'capa'
}

export function assetDe(alvo: Alvo): string {
  if (alvo.tipo === 'abertura') return ASSET_NAMES.abertura(alvo.chapterFile)
  if (alvo.tipo === 'retrato') return ASSET_NAMES.retrato(alvo.fichaId)
  return ASSET_NAMES.capa
}

export const NOME_PROVEDOR: Record<'off' | 'comfyui' | 'openai', string> = {
  off: 'Gerador desligado',
  comfyui: 'Gerador local (ComfyUI)',
  openai: 'OpenAI Images'
}

/** "≈ 6 min" / "≈ 40 s" */
export function duracao(ms: number): string {
  if (ms < 60_000) return `≈ ${Math.max(5, Math.round(ms / 5000) * 5)} s`
  const min = Math.round(ms / 60_000)
  return min < 60 ? `≈ ${min} min` : `≈ ${Math.floor(min / 60)} h ${min % 60} min`
}
