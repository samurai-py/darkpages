import type { Ctx } from '../api/context'
import { openProject, readChapter } from '../project'
import { getDoc, listDocs } from '../store/docs'
import { getDocCapitulo, putDocCapitulo } from '../store/capitulo-docs'
import type { Cartao, EnredoBoard, Ficha } from '../../shared/models'
import { aiChat } from './index'
import { hashTexto, regexNome } from './texto'

/**
 * Monta o contexto que a IA recebe: capítulo, resumos dos anteriores
 * (cacheados na coleção "resumos" por hash do texto, chave = id estável do capítulo), fichas citadas
 * (coleção "universo", detecção por nome/apelidos) e cartões do Enredo
 * ligados ao capítulo (coleção "enredo", doc "board").
 */

interface ResumoDoc {
  hash: string
  resumo: string
  titulo: string
  geradoEm: string
}

const SISTEMA_RESUMO =
  'Você é assistente editorial de um romancista brasileiro. Resuma capítulos em português do Brasil, ' +
  'de forma factual, em no máximo 120 palavras: quem aparece, o que acontece, o que muda, pistas e ganchos. ' +
  'Sem opinião, sem floreio.'

export async function resumoCapitulo(ctx: Ctx, dir: string, file: string): Promise<string> {
  const cap = await readChapter(dir, file)
  const hash = hashTexto(cap.body)
  const cache = await getDocCapitulo<ResumoDoc>(dir, 'resumos', file, cap.id)
  if (cache && cache.hash === hash && cache.resumo) return cache.resumo
  if (!cap.body.trim()) return ''
  const resumo = (
    await aiChat(ctx, {
      system: SISTEMA_RESUMO,
      messages: [{ role: 'user', content: `Capítulo "${cap.title}":\n\n${cap.body}` }],
      maxTokens: 400,
      temperature: 0.2,
      esforco: 'low'
    })
  ).trim()
  await putDocCapitulo<ResumoDoc>(dir, 'resumos', file, { hash, resumo, titulo: cap.title, geradoEm: new Date().toISOString() }, cap.id)
  return resumo
}

/** Quantos resumos anteriores sem cache podem ser gerados numa chamada (evita dezenas de chamadas de IA de uma vez). */
const MAX_RESUMOS_NOVOS = 6

export interface ResumoAnterior {
  file: string
  titulo: string
  resumo: string
}

/**
 * Resumos dos capítulos anteriores. Usa o cache quando o texto não mudou;
 * gera os que faltam dos mais próximos para trás (até MAX_RESUMOS_NOVOS por vez;
 * os demais entram na próxima chamada). Capítulos vazios são pulados.
 */
export async function resumosAnteriores(ctx: Ctx, dir: string, file: string): Promise<ResumoAnterior[]> {
  const p = await openProject(dir)
  const idx = p.chapters.findIndex((c) => c.file === file)
  const anteriores = idx < 0 ? [] : p.chapters.slice(0, idx)
  const out: ResumoAnterior[] = []
  let novos = 0
  for (const c of [...anteriores].reverse()) {
    if (!c.words) continue
    const cap = await readChapter(dir, c.file)
    const cache = await getDocCapitulo<ResumoDoc>(dir, 'resumos', c.file, c.id)
    let resumo = ''
    if (cache && cache.hash === hashTexto(cap.body)) resumo = cache.resumo
    else if (novos < MAX_RESUMOS_NOVOS) {
      resumo = await resumoCapitulo(ctx, dir, c.file)
      novos++
    } else if (cache?.resumo) resumo = `${cache.resumo} (resumo de uma versão anterior do capítulo)`
    if (resumo) out.push({ file: c.file, titulo: c.title, resumo })
  }
  return out.reverse()
}

export async function fichas(dir: string): Promise<Ficha[]> {
  return (await listDocs<Ficha>(dir, 'universo')).filter((f) => f && typeof f.nome === 'string' && f.nome.trim())
}

/** Nomes pelos quais a ficha aparece no texto (nome, apelidos e primeiro nome de personagem). */
export function nomesDaFicha(f: Ficha): string[] {
  const nomes = new Set<string>()
  const add = (n: unknown): void => {
    if (typeof n === 'string' && n.trim().length >= 2) nomes.add(n.trim())
  }
  add(f.nome)
  for (const a of Array.isArray(f.apelidos) ? f.apelidos : []) add(a)
  if (f.tipo === 'personagem') {
    const primeiro = f.nome.trim().split(/\s+/)[0]
    if (primeiro && primeiro.length >= 3 && primeiro !== f.nome.trim()) add(primeiro)
  }
  return [...nomes]
}

export interface Mencao {
  ficha: Ficha
  nome: string
  pos: number
}

/** Todas as menções a fichas no texto, ordenadas por posição. */
export function mencoes(texto: string, lista: Ficha[]): Mencao[] {
  const out: Mencao[] = []
  for (const f of lista) {
    for (const nome of nomesDaFicha(f)) {
      for (const m of texto.matchAll(regexNome(nome))) out.push({ ficha: f, nome: m[0], pos: m.index ?? 0 })
    }
  }
  return out.sort((a, b) => a.pos - b.pos)
}

export function fichasCitadas(texto: string, lista: Ficha[]): Ficha[] {
  const ids = new Set(mencoes(texto, lista).map((m) => m.ficha.id))
  return lista.filter((f) => ids.has(f.id))
}

export async function cartoesDoCapitulo(dir: string, file: string): Promise<Cartao[]> {
  const board = await getDoc<EnredoBoard>(dir, 'enredo', 'board')
  return (board?.cartoes ?? [])
    .filter((c) => c && c.capitulo === file)
    .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
}

export function fichaTexto(f: Ficha): string {
  const campos = (Array.isArray(f.campos) ? f.campos : []).filter((c) => c?.nome && c?.valor).map((c) => `${c.nome}: ${c.valor}`)
  const partes = [`${f.nome} (${f.tipo}${f.papel ? `, ${f.papel}` : ''})`]
  if (f.apelidos?.length) partes.push(`apelidos: ${f.apelidos.join(', ')}`)
  if (campos.length) partes.push(campos.join('; '))
  if (f.notas?.trim()) partes.push(`notas: ${f.notas.trim().slice(0, 400)}`)
  return `- ${partes.join(' | ')}`
}

export interface ContextoCapitulo {
  titulo: string
  corpo: string
  resumos: ResumoAnterior[]
  citadas: Ficha[]
  cartoes: Cartao[]
}

export async function contextoCapitulo(ctx: Ctx, dir: string, file: string, comResumos = true): Promise<ContextoCapitulo> {
  const cap = await readChapter(dir, file)
  const lista = await fichas(dir)
  const cartoes = await cartoesDoCapitulo(dir, file)
  const citadas = fichasCitadas(cap.body, lista)
  // fichas ligadas aos cartões do capítulo também entram
  const ligadas = new Set(cartoes.flatMap((c) => (Array.isArray(c.fichas) ? c.fichas : [])))
  for (const f of lista) if (ligadas.has(f.id) && !citadas.includes(f)) citadas.push(f)
  const resumos = comResumos ? await resumosAnteriores(ctx, dir, file) : []
  return { titulo: cap.title, corpo: cap.body, resumos, citadas, cartoes }
}

export function contextoEmTexto(c: ContextoCapitulo): string {
  const partes: string[] = []
  if (c.resumos.length) {
    partes.push('## Resumo dos capítulos anteriores', ...c.resumos.map((r) => `- ${r.titulo}: ${r.resumo}`))
  }
  if (c.citadas.length) partes.push('## Fichas citadas neste capítulo', ...c.citadas.map(fichaTexto))
  if (c.cartoes.length) {
    partes.push('## Cartões do Enredo ligados a este capítulo', ...c.cartoes.map((k) => `- [${k.tipo}] ${k.titulo}${k.texto ? `: ${k.texto}` : ''}`))
  }
  partes.push(`## Capítulo atual: ${c.titulo}`, c.corpo)
  return partes.join('\n')
}
