import type { Project } from '../../shared/types'

/**
 * Contexto entregue a todo handler da API. O mesmo handler roda no app
 * desktop (IPC do Electron) e no modo web (HTTP), então nada aqui pode
 * depender de `electron` diretamente.
 */
export interface Ctx {
  /** true no modo web (navegador via servidor HTTP) */
  web: boolean
  /** pasta resources/ (binário do Typst, fontes) */
  resourcesDir: string
  /** dados do app: recentes, configurações (~/.config/folio) */
  dataDir: string
  /** onde livros novos são criados no modo web (~/Folio) */
  libraryDir: string
  isAllowed(dir: string): Promise<boolean>
  remember(p: Project): Promise<Project>
  /** diálogo nativo de pasta; no modo web devolve null */
  pickDirectory(title: string): Promise<string | null>
  /** abre URL no navegador do sistema (OAuth, links) */
  openExternal(url: string): Promise<void>
  /** mostra arquivo na pasta (desktop); no web é ignorado */
  reveal(path: string): Promise<void>
}

export type Handler = (ctx: Ctx, ...args: unknown[]) => Promise<unknown>
export type Handlers = Record<string, Handler>

/** Valida string vinda da interface. */
export function str(v: unknown, max = 2_000_000): string {
  if (typeof v !== 'string' || v.length > max) throw new Error('Valor inválido')
  return v
}

export function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Número inválido')
  return v
}

/** Garante que `dir` é um livro que o usuário abriu. */
export async function bookDir(ctx: Ctx, v: unknown): Promise<string> {
  const d = str(v, 4096)
  if (!(await ctx.isAllowed(d))) throw new Error('Projeto não autorizado')
  return d
}
