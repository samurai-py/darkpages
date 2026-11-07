import { totalmem } from 'node:os'
import type { Ctx } from '../api/context'
import { readSection, writeSection } from '../store/settings'
import { erroDeRede, validarUrlLocal } from './rede'

/**
 * Ponto único de chamada de IA de texto. Toda feature (ideias, revisor,
 * beta-reader, continuidade, sinônimos, e outras que precisem) chama `aiChat`
 * e nunca fala com o provedor direto. A seção "ia" das configurações escolhe
 * o provedor.
 *
 * DONO: feature IA (src/main/features/ia.ts).
 *
 * Formatos conferidos na documentação oficial (nov/2026):
 * - Ollama: POST /api/chat {model, messages, stream:false, format:'json', options:{temperature,num_predict,num_ctx}}; GET /api/tags
 * - Anthropic: POST /v1/messages, header anthropic-version 2026-10-21 (nessa versão temperature/top_p/top_k dão 400)
 * - OpenAI: POST /v1/chat/completions com max_completion_tokens e response_format json_object
 * - Gemini: POST /v1beta/models/{modelo}:generateContent com header x-goog-api-key (chave nunca vai na URL)
 */

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRequest {
  system?: string
  messages: AiMessage[]
  /** pede resposta em JSON (o texto devolvido deve ser JSON válido) */
  json?: boolean
  /** tamanho máximo da resposta visível */
  maxTokens?: number
  /** só usado no Ollama; os provedores em nuvem usam a amostragem padrão */
  temperature?: number
  /** esforço de raciocínio em modelos que aceitam (Claude 4.6+) */
  esforco?: 'low' | 'medium' | 'high'
  /** tempo limite em ms (padrão: 5 min local, 2 min nuvem) */
  timeoutMs?: number
}

import { chatViaCli, conversaComoTexto } from './cli'

export type Provedor = 'off' | 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'claude-cli' | 'codex-cli'
export const PROVEDORES: Provedor[] = ['off', 'ollama', 'claude-cli', 'codex-cli', 'anthropic', 'openai', 'gemini']

export interface AiSettings {
  provider: Provedor
  ollamaUrl: string
  ollamaModel: string
  anthropicKey: string
  anthropicModel: string
  openaiKey: string
  openaiModel: string
  geminiKey: string
  geminiModel: string
}

export const AI_DEFAULTS: AiSettings = {
  provider: 'ollama',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-5-5',
  openaiKey: '',
  openaiModel: 'gpt-5.4-mini-2026-03-17',
  geminiKey: '',
  geminiModel: 'gemini-3.8-flash'
}

export const ANTHROPIC_VERSION = '2026-10-21'

// ---------------------------------------------------------------------------
// Sugestão de modelo local pela RAM (R4)
// ---------------------------------------------------------------------------

export interface SugestaoModelo {
  ramGb: number
  faixa: 'pequeno' | 'medio' | 'grande'
  modelo: string
  tamanhoGb: number
  motivo: string
}

export function sugestaoPorRam(ramBytes = totalmem()): SugestaoModelo {
  const ramGb = Math.round((ramBytes / 1024 ** 3) * 10) / 10
  if (ramGb < 10) {
    return { ramGb, faixa: 'pequeno', modelo: 'qwen2.5:3b', tamanhoGb: 1.9, motivo: `Com ${ramGb} GB de RAM, um modelo de ~2 GB roda sem travar o computador.` }
  }
  if (ramGb <= 20) {
    return { ramGb, faixa: 'medio', modelo: 'qwen2.5:7b', tamanhoGb: 4.7, motivo: `Com ${ramGb} GB de RAM, um modelo médio (~5 GB) equilibra qualidade e velocidade.` }
  }
  return { ramGb, faixa: 'grande', modelo: 'qwen2.5:14b', tamanhoGb: 9, motivo: `Com ${ramGb} GB de RAM, cabe um modelo grande (~9 GB), melhor para estilo e leitura crítica.` }
}

export async function aiSettings(ctx: Ctx): Promise<AiSettings> {
  const s = { ...AI_DEFAULTS, ...(await readSection<AiSettings>(ctx.dataDir, 'ia')) } as AiSettings
  if (!PROVEDORES.includes(s.provider)) s.provider = 'off'
  if (!s.ollamaModel) s.ollamaModel = sugestaoPorRam().modelo
  return s
}

/** Modelo efetivo do provedor ativo. */
export function modeloAtivo(s: AiSettings): string {
  switch (s.provider) {
    case 'ollama':
      return s.ollamaModel
    case 'anthropic':
      return s.anthropicModel
    case 'openai':
      return s.openaiModel
    case 'gemini':
      return s.geminiModel
    case 'claude-cli':
    case 'codex-cli':
      return 'assinatura'
    default:
      return ''
  }
}

/** true quando o texto do livro sai desta máquina/rede ao usar o provedor. */
export function provedorExterno(p: Provedor): boolean {
  return p === 'anthropic' || p === 'openai' || p === 'gemini' || p === 'claude-cli' || p === 'codex-cli'
}

export const NOME_PROVEDOR: Record<Provedor, string> = {
  off: 'IA desligada',
  ollama: 'Ollama (local)',
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini (Google)',
  'claude-cli': 'Claude (sua assinatura, via Claude Code)',
  'codex-cli': 'ChatGPT (sua assinatura, via Codex)'
}

const MODELO_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/

function checaModelo(m: unknown, rotulo: string): string {
  if (typeof m !== 'string' || !MODELO_RE.test(m)) throw new Error(`Nome de modelo inválido para ${rotulo}.`)
  return m
}

/**
 * Valida e grava a seção "ia" (usado pela tela Ajustes). Segredos vazios ou
 * mascarados mantêm o valor atual (regra do store).
 */
export async function salvarAiSettings(ctx: Ctx, patch: Record<string, unknown>): Promise<void> {
  const out: Record<string, unknown> = {}
  if ('provider' in patch) {
    if (!PROVEDORES.includes(patch.provider as Provedor)) throw new Error('Provedor de IA inválido.')
    out.provider = patch.provider
  }
  if ('ollamaUrl' in patch) out.ollamaUrl = validarUrlLocal(patch.ollamaUrl, 'Ollama')
  for (const [k, rot] of [
    ['ollamaModel', 'Ollama'],
    ['anthropicModel', 'Claude'],
    ['openaiModel', 'OpenAI'],
    ['geminiModel', 'Gemini']
  ] as const) {
    if (k in patch) out[k] = patch[k] === '' && k === 'ollamaModel' ? '' : checaModelo(patch[k], rot)
  }
  for (const k of ['anthropicKey', 'openaiKey', 'geminiKey'] as const) {
    if (k in patch) {
      const v = patch[k]
      if (typeof v !== 'string' || v.length > 400 || /\s/.test(v.trim()) || /[\r\n]/.test(v)) throw new Error('Chave de API inválida.')
      out[k] = v.trim()
    }
  }
  await writeSection(ctx.dataDir, 'ia', out)
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface Resposta {
  status: number
  json: unknown
  texto: string
}

async function postar(
  servico: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<Resposta> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (e) {
    throw erroDeRede(e, servico, new URL(url).origin, timeoutMs)
  }
  let texto: string
  try {
    texto = await res.text()
  } catch (e) {
    throw erroDeRede(e, servico, new URL(url).origin, timeoutMs)
  }
  let json: unknown = null
  try {
    json = JSON.parse(texto)
  } catch {
    /* corpo não-JSON (proxy, HTML de erro) */
  }
  return { status: res.status, json, texto }
}

function mensagemApi(r: Resposta): string {
  const j = r.json as { error?: unknown; message?: unknown } | null
  if (j && typeof j.error === 'string') return j.error
  if (j && j.error && typeof j.error === 'object') {
    const m = (j.error as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  if (j && typeof j.message === 'string') return j.message
  return r.texto.replace(/\s+/g, ' ').slice(0, 240)
}

/** Converte status HTTP de provedor em nuvem em mensagem clara. */
function erroNuvem(nome: string, r: Resposta, modelo: string): Error {
  const det = mensagemApi(r)
  switch (r.status) {
    case 400:
      return new Error(`${nome} recusou o pedido: ${det}`)
    case 401:
      return new Error(`A chave de ${nome} foi recusada (401). Confira em Ajustes.`)
    case 402:
      return new Error(`${nome} informou problema de cobrança na conta (402): ${det}`)
    case 403:
      return new Error(`A chave de ${nome} não tem permissão para isso (403): ${det}`)
    case 404:
      return new Error(`O modelo "${modelo}" não existe ou não está disponível na sua conta (${nome}).`)
    case 413:
      return new Error(`O texto ficou grande demais para ${nome}.`)
    case 429:
      return new Error(`Limite de uso de ${nome} atingido (429). Espere um pouco e tente de novo.`)
    case 529:
    case 503:
      return new Error(`${nome} está sobrecarregado agora (${r.status}). Tente de novo em instantes.`)
    default:
      return new Error(`${nome} respondeu ${r.status}: ${det}`)
  }
}

/** Extrai o primeiro objeto/lista JSON de um texto (modelos às vezes cercam com ```json). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) throw new Error('A IA não devolveu JSON. Tente de novo ou use outro modelo.')
  const open = raw[start]
  const close = open === '[' ? ']' : '}'
  const end = raw.lastIndexOf(close)
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T
  } catch {
    throw new Error('A IA devolveu um JSON quebrado. Tente de novo ou use um modelo maior.')
  }
}

/** Claude 4.6+ aceita output_config.effort; modelos antigos dão erro com ele. */
function aceitaEsforco(model: string): boolean {
  return /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[6-9])/.test(model)
}

// ---------------------------------------------------------------------------
// Chamada
// ---------------------------------------------------------------------------

export async function aiChat(ctx: Ctx, req: AiRequest): Promise<string> {
  return aiChatCom(await aiSettings(ctx), req)
}

export async function aiChatCom(s: AiSettings, req: AiRequest): Promise<string> {
  if (!req.messages.length) throw new Error('Pedido de IA vazio.')
  const maxTokens = Math.max(16, Math.min(req.maxTokens ?? 1500, 8000))
  const system = (req.system ?? '') + (req.json ? '\nResponda somente com JSON válido, sem texto fora do JSON.' : '')
  const tamanho = system.length + req.messages.reduce((n, m) => n + m.content.length, 0)

  switch (s.provider) {
    case 'off':
      throw new Error('A IA está desligada. Ligue em Ajustes → IA (Ollama local ou um provedor com sua chave).')

    case 'ollama': {
      const base = validarUrlLocal(s.ollamaUrl, 'Ollama')
      const model = checaModelo(s.ollamaModel, 'Ollama')
      const timeoutMs = req.timeoutMs ?? 300_000
      // janela de contexto suficiente para o capítulo inteiro (padrão do Ollama é pequeno e corta o texto)
      const numCtx = Math.min(32768, Math.max(4096, Math.ceil(tamanho / 3) + maxTokens + 512))
      let r: Resposta
      try {
        r = await postar(
          'O Ollama',
          `${base}/api/chat`,
          {},
          {
            model,
            stream: false,
            ...(req.json ? { format: 'json' } : {}),
            options: { temperature: req.temperature ?? 0.7, num_predict: maxTokens, num_ctx: numCtx },
            messages: [...(system ? [{ role: 'system', content: system }] : []), ...req.messages]
          },
          timeoutMs
        )
      } catch (e) {
        const msg = (e as Error).message
        if (/conexão recusada|não encontrei/i.test(msg)) {
          throw new Error(
            `${msg}\nPara usar a IA local: instale o Ollama (ollama.com), abra o aplicativo ou rode "ollama serve" no terminal, ` +
              `e baixe o modelo com "ollama pull ${model}". Depois confira a URL em Ajustes.`
          )
        }
        throw e
      }
      if (r.status === 404 || /not found/i.test(mensagemApi(r))) {
        throw new Error(`O modelo "${model}" não está instalado no Ollama. No terminal: ollama pull ${model}`)
      }
      if (r.status >= 400) throw new Error(`O Ollama respondeu ${r.status}: ${mensagemApi(r)}`)
      const content = (r.json as { message?: { content?: string } } | null)?.message?.content ?? ''
      if (!content.trim()) throw new Error('O Ollama devolveu uma resposta vazia. Tente de novo ou troque de modelo.')
      return content
    }

    case 'anthropic': {
      if (!s.anthropicKey) throw new Error('Chave da Anthropic não configurada. Cole a chave em Ajustes → IA.')
      const model = checaModelo(s.anthropicModel, 'Claude')
      // o raciocínio adaptativo conta dentro de max_tokens: deixa folga
      const max = Math.min(16000, Math.max(8000, maxTokens * 4))
      const r = await postar(
        'A Anthropic',
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': s.anthropicKey, 'anthropic-version': ANTHROPIC_VERSION },
        {
          model,
          max_tokens: max,
          ...(system ? { system } : {}),
          ...(aceitaEsforco(model) ? { output_config: { effort: req.esforco ?? 'medium' } } : {}),
          messages: req.messages
        },
        req.timeoutMs ?? 180_000
      )
      if (r.status >= 400) throw erroNuvem('Claude', r, model)
      const j = r.json as { content?: Array<{ type: string; text?: string }>; stop_reason?: string } | null
      if (j?.stop_reason === 'refusal') throw new Error('Claude recusou este pedido por política de segurança. Reformule ou use outro provedor.')
      const text = (j?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (!text.trim()) {
        if (j?.stop_reason === 'max_tokens') throw new Error('A resposta de Claude foi cortada pelo limite de tamanho. Tente um trecho menor.')
        throw new Error('Claude devolveu uma resposta vazia.')
      }
      return text
    }

    case 'openai': {
      if (!s.openaiKey) throw new Error('Chave da OpenAI não configurada. Cole a chave em Ajustes → IA.')
      const model = checaModelo(s.openaiModel, 'OpenAI')
      const r = await postar(
        'A OpenAI',
        'https://api.openai.com/v1/chat/completions',
        { authorization: `Bearer ${s.openaiKey}` },
        {
          model,
          // inclui tokens de raciocínio nos modelos que raciocinam
          max_completion_tokens: Math.min(16000, Math.max(4000, maxTokens * 4)),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...req.messages]
        },
        req.timeoutMs ?? 180_000
      )
      if (r.status >= 400) throw erroNuvem('OpenAI', r, model)
      const j = r.json as { choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }> } | null
      const c = j?.choices?.[0]
      if (c?.message?.refusal) throw new Error(`A OpenAI recusou o pedido: ${c.message.refusal}`)
      const text = c?.message?.content ?? ''
      if (!text.trim()) {
        if (c?.finish_reason === 'length') throw new Error('A resposta da OpenAI foi cortada pelo limite de tamanho.')
        throw new Error('A OpenAI devolveu uma resposta vazia.')
      }
      return text
    }

    case 'claude-cli':
    case 'codex-cli':
      return chatViaCli(s.provider === 'claude-cli' ? 'claude' : 'codex', system, conversaComoTexto(req.messages), req.timeoutMs ?? 600_000)

    case 'gemini': {
      if (!s.geminiKey) throw new Error('Chave do Gemini não configurada. Cole a chave em Ajustes → IA.')
      const model = checaModelo(s.geminiModel, 'Gemini')
      const r = await postar(
        'O Gemini',
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': s.geminiKey },
        {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: Math.min(16000, Math.max(4000, maxTokens * 4)),
            ...(req.json ? { responseMimeType: 'application/json' } : {})
          }
        },
        req.timeoutMs ?? 180_000
      )
      if (r.status >= 400) throw erroNuvem('Gemini', r, model)
      const j = r.json as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>
        promptFeedback?: { blockReason?: string }
      } | null
      if (j?.promptFeedback?.blockReason) throw new Error(`O Gemini bloqueou o pedido (${j.promptFeedback.blockReason}).`)
      const cand = j?.candidates?.[0]
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      if (!text.trim()) {
        if (cand?.finishReason === 'MAX_TOKENS') throw new Error('A resposta do Gemini foi cortada pelo limite de tamanho.')
        throw new Error(`O Gemini devolveu uma resposta vazia${cand?.finishReason ? ` (${cand.finishReason})` : ''}.`)
      }
      return text
    }
  }
}

// ---------------------------------------------------------------------------
// Utilidades para a tela Ajustes
// ---------------------------------------------------------------------------

export interface TesteIa {
  ok: boolean
  provedor: Provedor
  modelo: string
  ms: number
  erro?: string
}

/** Chamada mínima para conferir provedor, chave e modelo. */
export async function testarIa(ctx: Ctx): Promise<TesteIa> {
  const s = await aiSettings(ctx)
  const t0 = Date.now()
  const base = { provedor: s.provider, modelo: modeloAtivo(s) }
  try {
    const r = await aiChatCom(s, {
      messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }],
      maxTokens: 16,
      temperature: 0,
      esforco: 'low',
      timeoutMs: s.provider === 'ollama' ? 120_000 : 60_000
    })
    if (!r.trim()) throw new Error('Resposta vazia.')
    return { ok: true, ...base, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, ...base, ms: Date.now() - t0, erro: (e as Error).message }
  }
}

export interface ModeloOllama {
  nome: string
  tamanhoGb: number
  parametros: string
  familia: string
}

/** Lista os modelos instalados no Ollama (GET /api/tags). */
export async function modelosOllama(ctx: Ctx, urlOpcional?: unknown): Promise<ModeloOllama[]> {
  const s = await aiSettings(ctx)
  const base = validarUrlLocal(urlOpcional === undefined || urlOpcional === '' ? s.ollamaUrl : urlOpcional, 'Ollama')
  let res: Response
  try {
    res = await fetch(`${base}/api/tags`, { redirect: 'error', signal: AbortSignal.timeout(8000) })
  } catch (e) {
    const err = erroDeRede(e, 'O Ollama', base, 8000)
    throw new Error(`${err.message}\nAbra o aplicativo Ollama ou rode "ollama serve" no terminal.`)
  }
  if (!res.ok) throw new Error(`O Ollama respondeu ${res.status} ao listar modelos.`)
  const j = (await res.json()) as { models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string; family?: string } }> }
  return (j.models ?? [])
    .filter((m) => typeof m.name === 'string')
    .map((m) => ({
      nome: m.name as string,
      tamanhoGb: Math.round(((m.size ?? 0) / 1024 ** 3) * 10) / 10,
      parametros: m.details?.parameter_size ?? '',
      familia: m.details?.family ?? ''
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}
