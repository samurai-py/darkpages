import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { openProject } from '../project'
import { getAsset, getDoc, putDoc } from '../store/docs'
import { ASSET_NAMES } from '../../shared/models'

/**
 * Progresso de escrita (X3): total de palavras do livro no fim de cada dia,
 * em coleção "progresso" doc "diario": { dias: { "2026-11-06": 6840 } }.
 * E o "destaque" da Biblioteca: último capítulo editado e trecho final.
 */

export interface Diario {
  dias: Record<string, number>
}

const KEEP_DAYS = 400

export function hoje(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Registra o total de palavras de hoje. Devolve o diário completo. */
export async function registrar(dir: string): Promise<Diario> {
  const p = await openProject(dir)
  const total = p.chapters.reduce((s, c) => s + c.words, 0)
  const cur = (await getDoc<Diario>(dir, 'progresso', 'diario')) ?? { dias: {} }
  const dias: Record<string, number> = { ...(cur.dias ?? {}) }
  const day = hoje()
  if (dias[day] === total) return { dias }
  dias[day] = total
  const keys = Object.keys(dias).sort()
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete dias[k]
  await putDoc(dir, 'progresso', 'diario', { dias })
  return { dias }
}

export interface Destaque {
  capitulo: { file: string; title: string; numero: number; total: number } | null
  editadoEm: string | null
  trecho: string
  palavras: number
  capa: string | null
}

/** Remove marcação Markdown simples para mostrar um trecho limpo. */
function plain(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[\^[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Últimas ~40 palavras, começando numa fronteira de frase quando possível. */
export function trechoFinal(body: string, max = 240): string {
  const t = plain(body)
  if (t.length <= max) return t
  const tail = t.slice(-max)
  const cut = tail.search(/[.!?…]\s+\S/)
  const start = cut >= 0 && cut < max * 0.6 ? cut + 1 : tail.indexOf(' ') + 1
  return `…${tail.slice(start).trim()}`
}

export async function destaque(dir: string): Promise<Destaque> {
  const p = await openProject(dir)
  let best: { file: string; mtime: number } | null = null
  for (const c of p.chapters) {
    try {
      const st = await stat(join(dir, 'manuscrito', c.file))
      if (!best || st.mtimeMs > best.mtime) best = { file: c.file, mtime: st.mtimeMs }
    } catch {
      /* ignora */
    }
  }
  const idx = best ? p.chapters.findIndex((c) => c.file === best?.file) : -1
  const ch = idx >= 0 ? p.chapters[idx] : undefined
  let trecho = ''
  if (ch) {
    const raw = await readFile(join(dir, 'manuscrito', ch.file), 'utf8')
    trecho = trechoFinal(raw)
  }
  let capa: string | null = null
  try {
    capa = await getAsset(dir, ASSET_NAMES.capa)
  } catch {
    capa = null
  }
  // numeração "cap. N de M" conta só capítulos (prólogo/epílogo não contam)
  const caps = p.chapters.filter((c) => c.kind === 'capitulo')
  const numero = ch && ch.kind === 'capitulo' ? caps.findIndex((c) => c.file === ch.file) + 1 : 0
  return {
    capitulo: ch ? { file: ch.file, title: ch.title, numero, total: caps.length } : null,
    editadoEm: best ? new Date(best.mtime).toISOString() : null,
    trecho,
    palavras: p.chapters.reduce((s, c) => s + c.words, 0),
    capa
  }
}
