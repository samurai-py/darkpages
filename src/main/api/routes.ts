import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ctx } from './context'

/**
 * Rotas HTTP extras do modo web (ex.: callback de OAuth, download de arquivo).
 * Cada rota devolve true se tratou a requisição.
 * Features registram aqui; o servidor (src/server/index.ts) consulta em ordem.
 */
export type HttpRoute = (ctx: Ctx, req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>

export const httpRoutes: HttpRoute[] = []
