import { useSyncExternalStore } from 'react'
import { call, isWeb } from '../../api'
import type { EstadoAtualizacao } from '../../../../shared/atualizacao'

/** Estado da atualização do app, compartilhado entre a faixa do topo e Ajustes. No modo web não existe. */

let estado: EstadoAtualizacao = { fase: 'parado', versaoAtual: '' }
const ouvintes = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function mudar(e: EstadoAtualizacao): void {
  estado = e
  ouvintes.forEach((f) => f())
  // enquanto algo está em andamento, pergunta de novo a cada 1,5 s
  const ocupado = e.fase === 'verificando' || e.fase === 'baixando'
  if (ocupado && !timer) timer = setInterval(() => void atualizacaoStore.ler(), 1500)
  if (!ocupado && timer) {
    clearInterval(timer)
    timer = null
  }
}

function falhou(e: unknown): void {
  mudar({ ...estado, fase: 'erro', mensagem: e instanceof Error ? e.message : String(e) })
}

export const atualizacaoStore = {
  get: (): EstadoAtualizacao => estado,
  subscribe(f: () => void): () => void {
    ouvintes.add(f)
    return () => ouvintes.delete(f)
  },
  async ler(): Promise<void> {
    if (isWeb) return
    try {
      mudar(await call<EstadoAtualizacao>('atualizacao.estado'))
    } catch (e) {
      falhou(e)
    }
  },
  async verificar(): Promise<void> {
    if (isWeb) return
    try {
      mudar(await call<EstadoAtualizacao>('atualizacao.verificar'))
    } catch (e) {
      falhou(e)
    }
  },
  async baixar(): Promise<void> {
    try {
      mudar(await call<EstadoAtualizacao>('atualizacao.baixar'))
    } catch (e) {
      falhou(e)
    }
  },
  async instalar(): Promise<void> {
    try {
      await call('atualizacao.instalar')
    } catch (e) {
      falhou(e)
    }
  }
}

export function useAtualizacao(): EstadoAtualizacao {
  return useSyncExternalStore(atualizacaoStore.subscribe, atualizacaoStore.get)
}
