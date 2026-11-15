import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoAtualizacao } from '../src/shared/atualizacao'

const call = vi.fn()
vi.mock('../src/renderer/src/api', () => ({ call: (...a: unknown[]) => call(...a), isWeb: false, folio: {} }))
const { atualizacaoStore } = await import('../src/renderer/src/features/atualizacao/store')

const est = (e: Partial<EstadoAtualizacao>): EstadoAtualizacao => ({ fase: 'parado', versaoAtual: '0.1.1', ...e })

beforeEach(() => {
  vi.useFakeTimers()
  call.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('estado da atualização na interface', () => {
  it('verificar: guarda o resultado e não baixa nada sozinho', async () => {
    call.mockResolvedValueOnce(est({ fase: 'disponivel', versao: '0.2.0' }))
    await atualizacaoStore.verificar()
    expect(atualizacaoStore.get().fase).toBe('disponivel')
    expect(call.mock.calls.map((c) => c[0])).toEqual(['atualizacao.verificar'])
  })

  it('enquanto baixa, pergunta de novo até ficar pronta', async () => {
    call.mockResolvedValueOnce(est({ fase: 'baixando', versao: '0.2.0', progresso: 0 }))
    await atualizacaoStore.baixar()
    call.mockResolvedValueOnce(est({ fase: 'baixando', versao: '0.2.0', progresso: 60 }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(atualizacaoStore.get().progresso).toBe(60)
    call.mockResolvedValue(est({ fase: 'pronto', versao: '0.2.0', progresso: 100 }))
    await vi.advanceTimersByTimeAsync(1500)
    expect(atualizacaoStore.get().fase).toBe('pronto')
    const n = call.mock.calls.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(call.mock.calls.length).toBe(n) // parou de perguntar
  })

  it('erro vira estado de erro com a mensagem', async () => {
    call.mockRejectedValueOnce(new Error('Não há versão nova para baixar.'))
    await atualizacaoStore.baixar()
    expect(atualizacaoStore.get().fase).toBe('erro')
    expect(atualizacaoStore.get().mensagem).toMatch(/Não há versão nova/)
  })
})
