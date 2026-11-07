import type { Ctx } from '../api/context'
import { readSection, writeSection } from '../store/settings'
import { erroDeRede, validarUrlLocal } from './rede'
import { mascararMarkdown, contexto } from './texto'
import type { Sugestao, SugestaoCategoria } from '../../shared/models'

/**
 * Ortografia e gramática via LanguageTool (POST /v2/check, form-urlencoded,
 * language=pt-BR). Seção "revisor" das configurações:
 *   ltModo: 'off' | 'local' | 'publico'
 *   ltUrl:  servidor próprio (recomendado), ex. http://127.0.0.1:8081
 * O modo 'publico' usa https://api.languagetool.org e envia o texto para fora:
 * só é usado se o usuário escolheu isso explicitamente em Ajustes.
 */

export type LtModo = 'off' | 'local' | 'publico'

export interface RevisorSettings {
  ltModo: LtModo
  ltUrl: string
}

export const REVISOR_DEFAULTS: RevisorSettings = { ltModo: 'off', ltUrl: 'http://127.0.0.1:8081' }
export const LT_PUBLICO = 'https://api.languagetool.org'

export async function revisorSettings(ctx: Ctx): Promise<RevisorSettings> {
  const s = { ...REVISOR_DEFAULTS, ...(await readSection<RevisorSettings>(ctx.dataDir, 'revisor')) }
  if (!['off', 'local', 'publico'].includes(s.ltModo)) s.ltModo = 'off'
  return s
}

export async function salvarRevisorSettings(ctx: Ctx, patch: Record<string, unknown>): Promise<void> {
  const out: Record<string, unknown> = {}
  if ('ltModo' in patch) {
    if (!['off', 'local', 'publico'].includes(patch.ltModo as string)) throw new Error('Modo do LanguageTool inválido.')
    out.ltModo = patch.ltModo
  }
  if ('ltUrl' in patch) out.ltUrl = normalizarLt(validarUrlLocal(patch.ltUrl, 'LanguageTool'))
  await writeSection(ctx.dataDir, 'revisor', out)
}

/** Aceita "http://host:8081", ".../v2" ou ".../v2/check" e devolve a base. */
function normalizarLt(url: string): string {
  return url.replace(/\/v2(\/check)?$/, '')
}

export function ltBase(s: RevisorSettings): string | null {
  if (s.ltModo === 'off') return null
  if (s.ltModo === 'publico') return LT_PUBLICO
  return normalizarLt(validarUrlLocal(s.ltUrl, 'LanguageTool'))
}

interface LtMatch {
  message?: string
  shortMessage?: string
  offset: number
  length: number
  replacements?: Array<{ value?: string }>
  rule?: { id?: string; description?: string; issueType?: string; category?: { id?: string; name?: string } }
}

function categoria(m: LtMatch): SugestaoCategoria {
  const cat = m.rule?.category?.id ?? ''
  const tipo = m.rule?.issueType ?? ''
  if (tipo === 'misspelling' || cat === 'TYPOS') return 'ortografia'
  if (tipo === 'duplication' || /REPET/i.test(m.rule?.id ?? '')) return 'repeticao'
  if (tipo === 'style' || tipo === 'locale-violation' || cat === 'STYLE' || cat === 'REDUNDANCY') return 'estilo'
  return 'gramatica'
}

/** Divide o texto em blocos ≤ max caracteres em fronteira de parágrafo, guardando o deslocamento. */
function blocos(texto: string, max: number): Array<{ inicio: number; texto: string }> {
  const out: Array<{ inicio: number; texto: string }> = []
  let i = 0
  while (i < texto.length) {
    let fim = Math.min(texto.length, i + max)
    if (fim < texto.length) {
      const quebra = texto.lastIndexOf('\n', fim)
      if (quebra > i + max / 2) fim = quebra + 1
      else {
        const ponto = texto.lastIndexOf('. ', fim)
        if (ponto > i + max / 2) fim = ponto + 2
      }
    }
    out.push({ inicio: i, texto: texto.slice(i, fim) })
    i = fim
  }
  return out
}

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Normaliza para comparar com o dicionário do livro (sem acento, minúsculo). */
function chaveDicionario(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Erro de ortografia sobre uma palavra do dicionário do livro (nomes das
 * fichas, termos do Idioma, palavras mantidas)? Então não é erro.
 *
 * O dicionário é aplicado aqui, nas respostas, e não enviado ao servidor: a
 * API /v2/check só aceita dicionário próprio em contas premium (parâmetros
 * username/apiKey + palavras salvas na conta), o que não vale para servidor
 * local nem para o público gratuito.
 */
export function noDicionario(original: string, dicionario: Set<string> | undefined): boolean {
  if (!dicionario?.size) return false
  const palavras = original.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []
  return palavras.length > 0 && palavras.every((w) => dicionario.has(chaveDicionario(w)))
}

/**
 * Roda o LanguageTool no corpo Markdown do capítulo e devolve sugestões com o
 * trecho original exato. A marcação Markdown é trocada por espaços do mesmo
 * tamanho antes do envio, então os deslocamentos batem com o texto original.
 * `dicionario`: palavras do livro (ver ai/decisoes.ts) que não contam como erro de ortografia.
 */
export async function checarLanguageTool(ctx: Ctx, corpo: string, dicionario?: Set<string>): Promise<Sugestao[]> {
  const s = await revisorSettings(ctx)
  const base = ltBase(s)
  if (!base) return []
  const publico = s.ltModo === 'publico'
  const plano = mascararMarkdown(corpo)
  // a API pública aceita até 20 KB por pedido e ~20 pedidos/minuto
  const partes = blocos(plano, publico ? 15_000 : 60_000)
  const out: Sugestao[] = []
  const vistos = new Set<string>()
  for (const [n, parte] of partes.entries()) {
    if (!parte.texto.trim()) continue
    if (n > 0 && publico) await espera(3200)
    const form = new URLSearchParams({ text: parte.texto, language: 'pt-BR' })
    let res: Response
    try {
      res = await fetch(`${base}/v2/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: form.toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000)
      })
    } catch (e) {
      const err = erroDeRede(e, 'O LanguageTool', base, 60_000)
      throw new Error(
        publico
          ? err.message
          : `${err.message}\nInicie seu servidor LanguageTool (ex.: docker run -p 8081:8010 erikvl87/languagetool) ou desligue-o em Ajustes → Revisor.`
      )
    }
    if (res.status === 429) throw new Error('O LanguageTool público limitou os pedidos (429). Espere um minuto ou use um servidor próprio.')
    if (res.status === 413) throw new Error('Capítulo grande demais para o LanguageTool público. Use um servidor próprio.')
    if (!res.ok) throw new Error(`O LanguageTool respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = (await res.json()) as { matches?: LtMatch[] }
    for (const m of j.matches ?? []) {
      const ini = parte.inicio + m.offset
      const original = corpo.slice(ini, ini + m.length)
      const subs = (m.replacements ?? [])
        .map((r) => r.value)
        .filter((v): v is string => typeof v === 'string' && v !== original)
        .filter((v, i, a) => a.indexOf(v) === i)
      const sub = subs[0]
      if (sub === undefined || !original.trim()) continue
      // pula trechos que tocam marcação Markdown mascarada
      if (plano.slice(ini, ini + m.length) !== original) continue
      const cat = categoria(m)
      if (cat === 'ortografia' && noDicionario(original, dicionario)) continue
      const { antes, depois } = contexto(corpo, ini, m.length)
      const chave = `${ini}:${original}:${sub}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      out.push({
        id: `lt-${ini}-${out.length}`,
        categoria: cat,
        motivo: m.shortMessage || m.message || m.rule?.description || 'Regra do LanguageTool',
        original,
        substituto: sub,
        antes,
        depois,
        ...(subs.length > 1 ? { alternativas: subs.slice(1, 4) } : {}),
        ...(m.rule?.id ? { regra: m.rule.id.slice(0, 120) } : {})
      })
    }
  }
  return out
}
