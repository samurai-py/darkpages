import type { Ctx } from '../api/context'
import { readSection } from '../store/settings'

/**
 * Ponto único de chamada de IA de texto. Toda feature (ideias, revisor,
 * beta-reader, continuidade, sinônimos) chama `aiChat` e nunca fala com o
 * provedor direto. A seção "ia" das configurações escolhe o provedor.
 *
 * DONO: feature IA (src/main/features/ia.ts). Os provedores abaixo são a
 * implementação base; a feature IA pode refinar (timeouts, modelos, erros).
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
  maxTokens?: number
  temperature?: number
}

export interface AiSettings {
  provider: 'off' | 'ollama' | 'anthropic' | 'openai' | 'gemini'
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
  ollamaModel: 'qwen2.5:7b',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-5-5',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  geminiKey: '',
  geminiModel: 'gemini-2.0-flash'
}

export async function aiSettings(ctx: Ctx): Promise<AiSettings> {
  return { ...AI_DEFAULTS, ...(await readSection<AiSettings>(ctx.dataDir, 'ia')) } as AiSettings
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`IA respondeu ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as unknown
}

/** Extrai o primeiro objeto/lista JSON de um texto (modelos às vezes cercam com ```json). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) throw new Error('A IA não devolveu JSON')
  const open = raw[start]
  const close = open === '[' ? ']' : '}'
  const end = raw.lastIndexOf(close)
  return JSON.parse(raw.slice(start, end + 1)) as T
}

export async function aiChat(ctx: Ctx, req: AiRequest): Promise<string> {
  const s = await aiSettings(ctx)
  const maxTokens = req.maxTokens ?? 1500
  const temperature = req.temperature ?? 0.7
  const system = (req.system ?? '') + (req.json ? '\nResponda somente com JSON válido, sem texto fora do JSON.' : '')
  switch (s.provider) {
    case 'off':
      throw new Error('IA desligada nas configurações.')
    case 'ollama': {
      const r = (await post(
        `${s.ollamaUrl.replace(/\/$/, '')}/api/chat`,
        {},
        {
          model: s.ollamaModel,
          stream: false,
          ...(req.json ? { format: 'json' } : {}),
          options: { temperature, num_predict: maxTokens },
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...req.messages]
        },
        600_000
      )) as { message?: { content?: string } }
      return r.message?.content ?? ''
    }
    case 'anthropic': {
      if (!s.anthropicKey) throw new Error('Chave da Anthropic não configurada.')
      const r = (await post(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': s.anthropicKey, 'anthropic-version': '2023-06-01' },
        { model: s.anthropicModel, max_tokens: maxTokens, temperature, system: system || undefined, messages: req.messages },
        180_000
      )) as { content?: Array<{ type: string; text?: string }> }
      return (r.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    }
    case 'openai': {
      if (!s.openaiKey) throw new Error('Chave da OpenAI não configurada.')
      const r = (await post(
        'https://api.openai.com/v1/chat/completions',
        { authorization: `Bearer ${s.openaiKey}` },
        {
          model: s.openaiModel,
          temperature,
          max_tokens: maxTokens,
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...req.messages]
        },
        180_000
      )) as { choices?: Array<{ message?: { content?: string } }> }
      return r.choices?.[0]?.message?.content ?? ''
    }
    case 'gemini': {
      if (!s.geminiKey) throw new Error('Chave do Gemini não configurada.')
      const r = (await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`,
        { 'x-goog-api-key': s.geminiKey },
        {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(req.json ? { responseMimeType: 'application/json' } : {})
          }
        },
        180_000
      )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    }
  }
}
