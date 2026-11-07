import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Ctx } from '../api/context'
import { recentsStore } from '../recents'
import { DriveRemote } from './drive'
import { BookSync, type BookStatus } from './engine'
import { GoogleAuth } from './google'
import { registrar } from './progresso'
import { SpotifyClient } from './spotify'

/**
 * Worker de sincronização no processo principal (desktop) ou no servidor
 * (modo web). Começa no primeiro uso de um método sync./spotify./biblioteca.
 * A cada ~30 s: para cada livro recente (os mesmos que o app autoriza),
 * registra o progresso do dia e, se o Drive estiver conectado, envia o que
 * mudou.
 */

const TICK_MS = 30_000

export interface Services {
  ctx: Ctx
  google: GoogleAuth
  spotify: SpotifyClient
  book(dir: string): Promise<BookSync>
  tick(only?: string): Promise<void>
}

let services: Services | null = null

async function isBook(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, 'projeto.yaml'))).isFile()
  } catch {
    return false
  }
}

export function startServices(ctx: Ctx): Services {
  if (services) return services
  const google = new GoogleAuth(ctx.dataDir, ctx.web)
  const spotify = new SpotifyClient(ctx.dataDir, ctx.web)
  const remote = new DriveRemote(
    () => google.token(),
    () => google.invalidate()
  )
  const books = new Map<string, BookSync>()
  let incluirArca: boolean | null = null

  const book = async (dir: string): Promise<BookSync> => {
    const arca = Boolean((await google.settings()).incluirArca)
    if (incluirArca !== null && arca !== incluirArca) books.clear()
    incluirArca = arca
    let b = books.get(dir)
    if (!b) {
      b = new BookSync(dir, remote, { incluirArca: arca })
      books.set(dir, b)
    }
    return b
  }

  let running = false
  const tick = async (only?: string): Promise<void> => {
    if (running && !only) return
    if (!only) running = true
    try {
      const dirs = only ? [only] : (await recentsStore(ctx.dataDir).list()).map((r) => r.dir)
      const connected = await google.conectado()
      for (const dir of dirs) {
        if (!(await isBook(dir))) continue
        try {
          await registrar(dir)
        } catch {
          /* progresso é secundário: não trava o sync */
        }
        if (!connected) continue
        try {
          await (await book(dir)).push()
        } catch {
          /* o erro fica no estado do livro (BookSync.erro/offline) */
        }
      }
    } finally {
      if (!only) running = false
    }
  }

  const timer = setInterval(() => void tick(), TICK_MS)
  timer.unref()
  setTimeout(() => void tick(), 3_000).unref()

  services = { ctx, google, spotify, book, tick }
  return services
}

export interface SyncStatus extends BookStatus {
  conectado: boolean
  conta: string
}

export async function statusOf(s: Services, dir: string): Promise<SyncStatus> {
  const c = await s.google.conexao()
  const b = await (await s.book(dir)).status()
  return { ...b, conectado: c.conectado, conta: c.conta, erro: b.erro ?? (c.conectado ? c.erro : null) }
}
