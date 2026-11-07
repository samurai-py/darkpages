import type { Ctx, Handler, Handlers } from './context'
import { core } from './core'
import { handlers as manuscrito } from '../features/manuscrito'
import { handlers as universo } from '../features/universo'
import { handlers as enredo } from '../features/enredo'
import { handlers as ia } from '../features/ia'
import { handlers as diagramacao } from '../features/diagramacao'
import { handlers as mapas } from '../features/mapas'
import { handlers as idioma } from '../features/idioma'
import { handlers as sync } from '../features/sync'
import { handlers as arte } from '../features/arte'

/** Todos os métodos da API, iguais no desktop (IPC) e no web (HTTP). */
export const registry: Handlers = {
  ...core,
  ...manuscrito,
  ...universo,
  ...enredo,
  ...ia,
  ...diagramacao,
  ...mapas,
  ...idioma,
  ...sync,
  ...arte
}

export async function dispatch(ctx: Ctx, method: string, args: unknown[]): Promise<unknown> {
  const fn: Handler | undefined = Object.prototype.hasOwnProperty.call(registry, method) ? registry[method] : undefined
  if (!fn) throw new Error(`Método desconhecido: ${method}`)
  return fn(ctx, ...args)
}
