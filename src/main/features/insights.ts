import { bookDir, str, type Handlers } from '../api/context'
import { INSIGHT_TIPOS, type InsightStatus, type InsightTipo } from '../../shared/models'
import { silenciarTipo } from '../insights/config'
import { estado, listar, marcar, pedirAnalise, resumoDia, tocarLivro, ultimoErro } from '../insights/engine'

/**
 * Métodos do modo proativo (prefixo "insights."). Contratos em
 * src/shared/models.ts (Insight, ProativoSettings, ProativoEstado).
 */

const CAP_RE = /^\d{3}-[a-z0-9-]+\.md$/
const STATUS: InsightStatus[] = ['novo', 'visto', 'aplicado', 'dispensado']

function capFile(v: unknown): string {
  const f = str(v, 200)
  if (!CAP_RE.test(f)) throw new Error('Capítulo inválido.')
  return f
}

export const handlers: Handlers = {
  /** Insights do livro (mais novos primeiro). Também marca o livro como aberto para o resumo do dia. */
  'insights.listar': async (ctx, dir) => {
    const d = await bookDir(ctx, dir)
    tocarLivro(ctx, d)
    return { insights: await listar(d), erro: ultimoErro(d) }
  },

  'insights.marcar': async (ctx, dir, id, status) => {
    const d = await bookDir(ctx, dir)
    if (!STATUS.includes(status as InsightStatus)) throw new Error('Status inválido.')
    return marcar(d, str(id, 100), status as InsightStatus)
  },

  /** "Não mostrar esse tipo": desliga o tipo na seção "proativo". */
  'insights.silenciarTipo': async (ctx, tipo) => {
    if (!INSIGHT_TIPOS.includes(tipo as InsightTipo)) throw new Error('Tipo inválido.')
    await silenciarTipo(ctx, tipo as InsightTipo)
    return estado(ctx)
  },

  /**
   * Gatilho vindo do Manuscrito: pausa na digitação (já salvo) ou troca de capítulo.
   * opcoes: { motivo?: 'pausa' | 'troca', foco?: boolean }. Não espera a análise.
   */
  'insights.pausa': async (ctx, dir, file, opcoes) => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const o = (opcoes && typeof opcoes === 'object' ? opcoes : {}) as { motivo?: unknown; foco?: unknown }
    const motivo = o.motivo === 'troca' ? 'troca' : 'pausa'
    tocarLivro(ctx, d)
    if (o.foco === true) return { enfileirado: false, motivo: 'modo foco ativo' }
    return { enfileirado: pedirAnalise(ctx, d, f, motivo, false) }
  },

  /** Gera o resumo do dia se ainda não houver hoje (devolve o insight ou null). */
  'insights.resumoDia': async (ctx, dir) => {
    const d = await bookDir(ctx, dir)
    tocarLivro(ctx, d)
    return resumoDia(ctx, d)
  },

  /** Configuração, uso de hoje e privacidade do modo proativo. */
  'insights.estado': async (ctx) => estado(ctx)
}
