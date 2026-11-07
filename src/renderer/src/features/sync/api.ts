import { useEffect, useRef } from 'react'
import { call } from '../../api'
import type { SyncStatus } from '../../../../main/sync/worker'
import type { ConexaoGoogle } from '../../../../main/sync/google'
import type { PullResult } from '../../../../main/sync/engine'
import type { Diario, Destaque } from '../../../../main/sync/progresso'
import type { Agora, EstadoSpotify, Playlist } from '../../../../main/sync/spotify'

export type { SyncStatus, ConexaoGoogle, Diario, Destaque, Agora, EstadoSpotify, Playlist }

/** Chamadas tipadas da feature Sync/Spotify/Biblioteca. */
export const syncApi = {
  status: (dir: string) => call<SyncStatus>('sync.status', dir),
  agora: (dir: string) => call<SyncStatus>('sync.agora', dir),
  puxar: (dir: string) => call<PullResult & { conectado: boolean }>('sync.puxar', dir),
  resolver: (dir: string, arquivo: string, escolha: 'local' | 'remoto') => call<SyncStatus>('sync.resolver', dir, arquivo, escolha),
  conectar: () => call<ConexaoGoogle>('sync.conectar'),
  conexao: () => call<ConexaoGoogle>('sync.conexao'),
  desconectar: () => call<ConexaoGoogle>('sync.desconectar')
}

export const spotifyApi = {
  estado: () => call<EstadoSpotify>('spotify.estado'),
  conectar: () => call<EstadoSpotify>('spotify.conectar'),
  finalizar: (url: string) => call<EstadoSpotify>('spotify.finalizar', url),
  desconectar: () => call<EstadoSpotify>('spotify.desconectar'),
  agora: () => call<Agora>('spotify.agora'),
  comando: (cmd: 'play' | 'pause' | 'next' | 'previous') => call<Agora>('spotify.comando', cmd),
  playlists: () => call<Playlist[]>('spotify.playlists'),
  imagem: (url: string) => call<string | null>('spotify.imagem', url),
  tocarPlaylist: (uri: string) => call<null>('spotify.tocarPlaylist', uri)
}

export const bibliotecaApi = {
  registrar: (dir: string) => call<Diario>('biblioteca.registrar', dir),
  destaque: (dir: string) => call<Destaque>('biblioteca.destaque', dir)
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** "há 3 min", "há 2 h", "ontem"… */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'nunca'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'agora há pouco'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Executa `fn` a cada `ms` só enquanto a aba/janela está visível
 * (e uma vez ao voltar a ficar visível).
 */
export function useVisiblePolling(fn: () => void | Promise<void>, ms: number, enabled = true): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!enabled) return
    let timer: number | null = null
    const run = (): void => {
      void ref.current()
    }
    const start = (): void => {
      if (timer !== null || document.visibilityState !== 'visible') return
      run()
      timer = window.setInterval(run, ms)
    }
    const stop = (): void => {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    }
    const onVis = (): void => (document.visibilityState === 'visible' ? start() : stop())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms, enabled])
}
