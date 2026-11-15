import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_DEFAULTS, aiChatCom } from '../src/main/ai/index'

const settings = { ...AI_DEFAULTS, provider: 'groq' as const, groqKey: 'gsk_teste', groqModel: 'openai/gpt-oss-120b' }
const ok = (texto: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: texto }, finish_reason: 'stop' }] }), { status: 200 })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('provedor Groq', () => {
  it('usa o endereço do Groq, teto baixo de resposta e raciocínio leve', async () => {
    const f = vi.fn(async () => ok('oi'))
    vi.stubGlobal('fetch', f)
    expect(await aiChatCom(settings, { messages: [{ role: 'user', content: 'x' }], maxTokens: 2500 })).toBe('oi')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.max_completion_tokens).toBeLessThanOrEqual(3000)
    expect(body.reasoning_effort).toBe('low')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_teste')
  })

  it('num 429 espera o tempo pedido e tenta de novo', async () => {
    vi.useFakeTimers()
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(ok('depois da espera'))
    vi.stubGlobal('fetch', f)
    const p = aiChatCom(settings, { messages: [{ role: 'user', content: 'x' }] })
    await vi.advanceTimersByTimeAsync(6_000)
    expect(f).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await p).toBe('depois da espera')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('desiste depois de 3 tentativas com a mensagem de limite', async () => {
    vi.useFakeTimers()
    const f = vi.fn(async () => new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'retry-after': '1' } }))
    vi.stubGlobal('fetch', f)
    const p = aiChatCom(settings, { messages: [{ role: 'user', content: 'x' }] })
    const visto = expect(p).rejects.toThrow(/Limite de uso de Groq atingido/)
    await vi.advanceTimersByTimeAsync(10_000)
    await visto
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('OpenAI não muda: teto de resposta antigo e sem raciocínio extra', async () => {
    const f = vi.fn(async () => ok('oi'))
    vi.stubGlobal('fetch', f)
    await aiChatCom({ ...AI_DEFAULTS, provider: 'openai', openaiKey: 'sk-x' }, { messages: [{ role: 'user', content: 'x' }], maxTokens: 1500 })
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>
    expect(body.max_completion_tokens).toBe(6000)
    expect(body.reasoning_effort).toBeUndefined()
  })
})
