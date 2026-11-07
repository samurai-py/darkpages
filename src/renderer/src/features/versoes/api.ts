import { call } from '../../api'
import type { ChapterContent, Project } from '../../../../shared/types'
import type { DiffConflito, DiffVersao, ItemLixeira, SnapshotInfo, VersaoCapitulo } from '../../../../shared/versoes'

export type { DiffConflito, DiffVersao, ItemLixeira, SnapshotInfo, VersaoCapitulo }

/** Chamadas tipadas da feature Versões (backend: src/main/features/versoes.ts). */
export const versoesApi = {
  listar: (dir: string) => call<SnapshotInfo[]>('versoes.listar', dir),
  capitulo: (dir: string, file: string) => call<VersaoCapitulo[]>('versoes.capitulo', dir, file),
  diff: (dir: string, id: string, file: string) => call<DiffVersao>('versoes.diff', dir, id, file),
  restaurar: (dir: string, id: string, file: string) => call<{ project: Project; capitulo: ChapterContent }>('versoes.restaurar', dir, id, file),
  salvar: (dir: string, rotulo?: string) => call<SnapshotInfo>('versoes.salvar', dir, rotulo ?? ''),
  rotular: (dir: string, id: string, rotulo: string) => call<SnapshotInfo>('versoes.rotular', dir, id, rotulo),
  lixeira: (dir: string) => call<ItemLixeira[]>('versoes.lixeira', dir),
  recuperar: (dir: string, nome: string) => call<{ project: Project; arquivo: string }>('versoes.recuperar', dir, nome),
  conflito: (dir: string, arquivo: string, copia: string) => call<DiffConflito>('versoes.conflito', dir, arquivo, copia)
}

/** "07 nov · 14:03" */
export function quando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
  return `${dia.replace('.', '')} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
