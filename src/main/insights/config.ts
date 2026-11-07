import type { Ctx } from '../api/context'
import { readSection, writeSection } from '../store/settings'
import { INSIGHT_TIPOS, type InsightTipo, type ProativoModo, type ProativoSettings } from '../../shared/models'

/**
 * Configuração do modo proativo (seção "proativo") e contador diário de
 * chamadas de IA (seção "proativo-uso": { dia, chamadas }, somando livros).
 */

export const PROATIVO_PADRAO: ProativoSettings = {
  modo: 'leve',
  limiteDiario: 20,
  silencioInicio: '22:00',
  silencioFim: '07:00',
  tipos: { continuidade: true, estilo: true, ideias: true, pistas: true, resumo: true },
  palavrasMin: 250,
  pausaS: 60
}

const MODOS: ProativoModo[] = ['off', 'leve', 'completo']
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export async function proativoSettings(ctx: Ctx): Promise<ProativoSettings> {
  const s = await readSection<ProativoSettings>(ctx.dataDir, 'proativo')
  const tipos = { ...PROATIVO_PADRAO.tipos }
  for (const t of INSIGHT_TIPOS) if (typeof s.tipos?.[t] === 'boolean') tipos[t] = s.tipos[t]
  return {
    modo: MODOS.includes(s.modo as ProativoModo) ? (s.modo as ProativoModo) : PROATIVO_PADRAO.modo,
    limiteDiario: inteiro(s.limiteDiario, 0, 500, PROATIVO_PADRAO.limiteDiario),
    silencioInicio: typeof s.silencioInicio === 'string' && HORA.test(s.silencioInicio) ? s.silencioInicio : PROATIVO_PADRAO.silencioInicio,
    silencioFim: typeof s.silencioFim === 'string' && HORA.test(s.silencioFim) ? s.silencioFim : PROATIVO_PADRAO.silencioFim,
    tipos,
    palavrasMin: inteiro(s.palavrasMin, 0, 20_000, PROATIVO_PADRAO.palavrasMin),
    pausaS: inteiro(s.pausaS, 10, 3600, PROATIVO_PADRAO.pausaS)
  }
}

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : padrao
}

/** Valida e grava a seção "proativo" (vinda da tela Ajustes). */
export async function salvarProativo(ctx: Ctx, patch: Record<string, unknown>): Promise<void> {
  const out: Record<string, unknown> = {}
  if ('modo' in patch) {
    if (!MODOS.includes(patch.modo as ProativoModo)) throw new Error('Modo proativo inválido.')
    out.modo = patch.modo
  }
  const num = (k: string, min: number, max: number, rot: string): void => {
    if (!(k in patch)) return
    const v = patch[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${rot}: use um número entre ${min} e ${max}.`)
    out[k] = Math.round(v)
  }
  num('limiteDiario', 0, 500, 'Limite diário')
  num('palavrasMin', 0, 20_000, 'Palavras novas mínimas')
  num('pausaS', 10, 3600, 'Pausa')
  for (const k of ['silencioInicio', 'silencioFim']) {
    if (!(k in patch)) continue
    if (typeof patch[k] !== 'string' || !HORA.test(patch[k] as string)) throw new Error('Horário silencioso: use HH:MM.')
    out[k] = patch[k]
  }
  if ('tipos' in patch) {
    const t = patch.tipos as Record<string, unknown> | null
    if (!t || typeof t !== 'object') throw new Error('Tipos inválidos.')
    const atual = (await proativoSettings(ctx)).tipos
    const novo: Record<InsightTipo, boolean> = { ...atual }
    for (const k of INSIGHT_TIPOS) if (typeof t[k] === 'boolean') novo[k] = t[k] as boolean
    out.tipos = novo
  }
  await writeSection(ctx.dataDir, 'proativo', out)
}

export async function silenciarTipo(ctx: Ctx, tipo: InsightTipo): Promise<void> {
  const atual = (await proativoSettings(ctx)).tipos
  await writeSection(ctx.dataDir, 'proativo', { tipos: { ...atual, [tipo]: false } })
}

function minutos(h: string): number {
  const [a, b] = h.split(':').map(Number)
  return (a ?? 0) * 60 + (b ?? 0)
}

/** true dentro do horário silencioso (aceita intervalo que cruza a meia-noite). */
export function emSilencio(s: ProativoSettings, agora = new Date()): boolean {
  const ini = minutos(s.silencioInicio)
  const fim = minutos(s.silencioFim)
  if (ini === fim) return false
  const m = agora.getHours() * 60 + agora.getMinutes()
  return ini < fim ? m >= ini && m < fim : m >= ini || m < fim
}

export function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Uso {
  dia: string
  chamadas: number
}

export async function usoHoje(ctx: Ctx): Promise<number> {
  const u = await readSection<Uso>(ctx.dataDir, 'proativo-uso')
  return u.dia === diaLocal() && typeof u.chamadas === 'number' ? u.chamadas : 0
}

let filaUso: Promise<unknown> = Promise.resolve()

/**
 * Reserva uma chamada de IA do limite diário. Devolve false se o limite acabou.
 * Serializado para dois livros não passarem do limite ao mesmo tempo.
 */
export function reservarChamada(ctx: Ctx, limite: number): Promise<boolean> {
  const p = filaUso.then(async () => {
    const n = await usoHoje(ctx)
    if (n >= limite) return false
    await writeSection(ctx.dataDir, 'proativo-uso', { dia: diaLocal(), chamadas: n + 1 })
    return true
  })
  filaUso = p.catch(() => undefined)
  return p
}
