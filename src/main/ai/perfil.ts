import { getDoc, putDoc } from '../store/docs'
import { PERFIL_PADRAO, type PerfilObra } from '../../shared/models'

/**
 * Perfil da obra (coleção "config", doc "perfil"): como a IA e as checagens
 * locais devem ler este livro. Cada opção só acrescenta instruções aos
 * prompts (ver `instrucoesPerfil`) e deixa a continuidade local menos
 * agressiva (ver ai/continuidade.ts).
 */

const COL = 'config'
const DOC = 'perfil'
const MAX_NOTAS = 2000

export function sanearPerfil(v: unknown): PerfilObra {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    narradorNaoConfiavel: o.narradorNaoConfiavel === true,
    ambiguidadeDeliberada: o.ambiguidadeDeliberada === true,
    naoLinear: o.naoLinear === true,
    notasIa: typeof o.notasIa === 'string' ? o.notasIa.slice(0, MAX_NOTAS) : ''
  }
}

export async function lerPerfil(dir: string): Promise<PerfilObra> {
  const d = await getDoc<PerfilObra>(dir, COL, DOC).catch(() => null)
  return d ? sanearPerfil(d) : { ...PERFIL_PADRAO }
}

export async function salvarPerfil(dir: string, patch: unknown): Promise<PerfilObra> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Perfil inválido.')
  const novo = sanearPerfil({ ...(await lerPerfil(dir)), ...(patch as Record<string, unknown>) })
  const { id: _id, ...dados } = await putDoc(dir, COL, DOC, novo)
  return dados
}

/**
 * Instruções que vão no fim do prompt de sistema de todo método de IA.
 * Vazio quando o perfil está no padrão e sem notas.
 */
export function instrucoesPerfil(p: PerfilObra): string {
  const l: string[] = []
  if (p.narradorNaoConfiavel) {
    l.push(
      'Esta obra tem narrador ou personagens não confiáveis: afirmações dentro de falas ou da narração podem ser falsas DE PROPÓSITO. ' +
        'Não as trate como contradição nem as corrija; aponte só contradição com um FATO das fichas ou dos cartões canônicos, e nunca dentro de uma fala.'
    )
  }
  if (p.ambiguidadeDeliberada) {
    l.push('A ambiguidade é deliberada: não resolva lacunas, não explique o que o texto deixa em aberto e não aponte duplo sentido como erro.')
  }
  if (p.naoLinear) {
    l.push(
      'A narrativa não é linear: a ordem dos capítulos não é a ordem dos acontecimentos. Um personagem morto pode aparecer vivo em outro tempo; ' +
        'não trate isso como erro de continuidade sem marca clara de que é o mesmo momento.'
    )
  }
  const notas = p.notasIa.trim()
  if (notas) l.push(`Notas do autor sobre a obra (tom, regras do universo) — respeite sempre:\n${notas}`)
  return l.length ? `\n\n## Perfil da obra\n${l.map((x) => `- ${x}`).join('\n')}` : ''
}
