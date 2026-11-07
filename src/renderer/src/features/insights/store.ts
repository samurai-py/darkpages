import { useSyncExternalStore } from 'react'
import { call } from '../../api'
import type { Insight } from '../../../../shared/models'

/**
 * Estado dos insights do livro aberto, compartilhado entre o sininho (App),
 * o painel e o aviso na margem do Manuscrito. O App faz o polling.
 */

export interface EstadoInsights {
  dir: string
  lista: Insight[]
  erro: string | null
  painel: boolean
  /** filtro de capítulo pedido ao abrir o painel (ex.: aviso da margem) */
  capitulo: string
}

let estado: EstadoInsights = { dir: '', lista: [], erro: null, painel: false, capitulo: '' }
const ouvintes = new Set<() => void>()

function mudar(patch: Partial<EstadoInsights>): void {
  estado = { ...estado, ...patch }
  ouvintes.forEach((f) => f())
}

export const insightsStore = {
  get: (): EstadoInsights => estado,
  subscribe(f: () => void): () => void {
    ouvintes.add(f)
    return () => ouvintes.delete(f)
  },
  usarLivro(dir: string): void {
    if (dir !== estado.dir) mudar({ dir, lista: [], erro: null, painel: false, capitulo: '' })
  },
  async atualizar(): Promise<void> {
    const dir = estado.dir
    if (!dir) return
    try {
      const r = await call<{ insights: Insight[]; erro: string | null }>('insights.listar', dir)
      if (dir === estado.dir) mudar({ lista: Array.isArray(r.insights) ? r.insights : [], erro: r.erro })
    } catch (e) {
      if (dir === estado.dir) mudar({ erro: e instanceof Error ? e.message : String(e) })
    }
  },
  /** troca o status localmente e no servidor */
  async marcar(id: string, status: Insight['status']): Promise<void> {
    const dir = estado.dir
    mudar({ lista: estado.lista.map((i) => (i.id === id ? { ...i, status } : i)) })
    await call('insights.marcar', dir, id, status)
  },
  abrir(capitulo = ''): void {
    mudar({ painel: true, capitulo })
  },
  fechar(): void {
    mudar({ painel: false, capitulo: '' })
  }
}

export function useInsights(): EstadoInsights {
  return useSyncExternalStore(insightsStore.subscribe, insightsStore.get, insightsStore.get)
}
