import { getDoc, listDocs, newId, putDoc } from '../store/docs'
import type { DecisaoRevisao, DecisaoTipo, Ficha } from '../../shared/models'
import { normalizar } from '../../shared/decisoes'

/**
 * Decisões de revisão do livro (coleção "revisao", doc "decisoes"):
 * { itens: DecisaoRevisao[] }. Lógica de filtro em src/shared/decisoes.ts.
 * Também monta o dicionário do livro para o LanguageTool.
 */

const COL = 'revisao'
const DOC = 'decisoes'
const TIPOS: DecisaoTipo[] = ['manter-palavra', 'manter-trecho', 'ignorar-regra', 'continuidade']
const MAX = 2000
const CAP_ID = /^[a-z0-9][a-z0-9-]{0,80}$/

function sanear(v: unknown): DecisaoRevisao | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const tipo = o.tipo as DecisaoTipo
  const valor = typeof o.valor === 'string' ? o.valor.trim().slice(0, 2000) : ''
  if (!TIPOS.includes(tipo) || !valor) return null
  const out: DecisaoRevisao = {
    id: typeof o.id === 'string' && /^[a-z0-9-]{1,80}$/.test(o.id) ? o.id : newId('dec'),
    tipo,
    valor,
    criadoEm: typeof o.criadoEm === 'string' ? o.criadoEm.slice(0, 40) : new Date().toISOString()
  }
  if (typeof o.capitulo === 'string' && CAP_ID.test(o.capitulo)) out.capitulo = o.capitulo
  if (typeof o.rotulo === 'string' && o.rotulo.trim()) out.rotulo = o.rotulo.trim().slice(0, 200)
  return out
}

export async function listarDecisoes(dir: string): Promise<DecisaoRevisao[]> {
  const d = await getDoc<{ itens?: unknown[] }>(dir, COL, DOC).catch(() => null)
  return (Array.isArray(d?.itens) ? d.itens : []).map(sanear).filter((x): x is DecisaoRevisao => !!x)
}

async function gravar(dir: string, itens: DecisaoRevisao[]): Promise<DecisaoRevisao[]> {
  await putDoc(dir, COL, DOC, { itens: itens.slice(-MAX) })
  return itens.slice(-MAX)
}

/** Acrescenta (sem duplicar o mesmo tipo+valor+capítulo). → lista atual */
export async function adicionarDecisao(dir: string, dados: unknown): Promise<DecisaoRevisao[]> {
  const nova = sanear({ ...(dados as object), id: undefined, criadoEm: undefined })
  if (!nova) throw new Error('Decisão inválida.')
  const atual = await listarDecisoes(dir)
  const igual = atual.some((d) => d.tipo === nova.tipo && d.valor === nova.valor && (d.capitulo ?? '') === (nova.capitulo ?? ''))
  return igual ? atual : gravar(dir, [...atual, nova])
}

export async function removerDecisao(dir: string, id: string): Promise<DecisaoRevisao[]> {
  return gravar(
    dir,
    (await listarDecisoes(dir)).filter((d) => d.id !== id)
  )
}

/**
 * Dicionário do livro (palavras que não são erro de ortografia): nomes e
 * apelidos das fichas (cada palavra), nome e termos do léxico de cada língua
 * do Idioma (coleção "idioma", campo `lexico[].termo`) e as palavras que o
 * autor mandou manter. Normalizado (sem acento, minúsculo).
 */
export async function dicionarioDoLivro(dir: string, decisoes?: DecisaoRevisao[]): Promise<Set<string>> {
  const out = new Set<string>()
  const add = (s: unknown): void => {
    if (typeof s !== 'string') return
    for (const w of s.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []) {
      const n = normalizar(w)
      if (n.length >= 2) out.add(n)
    }
  }
  for (const f of await listDocs<Ficha>(dir, 'universo').catch(() => [])) {
    add(f.nome)
    for (const a of Array.isArray(f.apelidos) ? f.apelidos : []) add(a)
  }
  for (const l of await listDocs<{ nome?: unknown; lexico?: Array<{ termo?: unknown }> }>(dir, 'idioma').catch(() => [])) {
    add(l.nome)
    for (const e of Array.isArray(l.lexico) ? l.lexico : []) add(e?.termo)
  }
  for (const d of decisoes ?? (await listarDecisoes(dir))) if (d.tipo === 'manter-palavra') add(d.valor)
  return out
}
