import type { Ctx } from '../api/context'
import { openProject, readChapter } from '../project'
import { getDoc, listDocs } from '../store/docs'
import { getDocCapitulo, putDocCapitulo } from '../store/capitulo-docs'
import type { Cartao, CenaMeta, DecisaoRevisao, EnredoBoard, Ficha, PerfilObra } from '../../shared/models'
import type { ChapterInfo } from '../../shared/types'
import { decisoesDoCapitulo, decisoesEmTexto } from '../../shared/decisoes'
import { aiChat, aiSettings, estimarTokens, OLLAMA_CTX_MAX } from './index'
import { hashTexto, regexNome } from './texto'
import { instrucoesPerfil, lerPerfil } from './perfil'
import { listarDecisoes } from './decisoes'

/**
 * Montador ÚNICO do contexto que a IA recebe sobre o livro. Todo método de IA
 * (ideias, leitura beta, continuidade, redigir, estilo do Revisor, insights
 * proativos, resumo do dia) passa por `contextoIa`, com as mesmas fontes:
 *
 * - perfil da obra (instruções no prompt de sistema, ver ai/perfil.ts);
 * - metadados da cena (sinopse, POV, cenário, notas — ids viram nomes);
 * - resumos dos capítulos anteriores ("Memória do livro", coleção "resumos",
 *   chave = id estável; resumo editado pelo autor fica travado);
 * - fichas citadas, com campos, grupo e relações (rótulo + nome do alvo);
 * - cartões do capítulo com origem/estado (provisório vai marcado como tal,
 *   descartado não entra) e as ligações de causa que tocam neles;
 * - decisões "manter" do Revisor;
 * - amostras da voz de outros capítulos (estilo).
 *
 * Cada método tem um orçamento de tokens (ORCAMENTO). Se não cabe tudo, o
 * corte segue uma prioridade fixa (PRIORIDADE) e cada corte vira um aviso
 * legível, devolvido para a interface mostrar junto do resultado.
 */

// ---------------------------------------------------------------------------
// resumos (memória do livro)
// ---------------------------------------------------------------------------

export interface ResumoDoc {
  /** hash do texto do capítulo quando o resumo foi feito (ou editado) */
  hash: string
  resumo: string
  titulo: string
  geradoEm: string
  /** editado pelo autor: a IA nunca sobrescreve sozinha */
  travado?: boolean
  editadoEm?: string
}

const SISTEMA_RESUMO =
  'Você é assistente editorial de um romancista brasileiro. Resuma capítulos em português do Brasil, ' +
  'de forma factual, em no máximo 120 palavras: quem aparece, o que acontece, o que muda, pistas e ganchos. ' +
  'Sem opinião, sem floreio.'

/**
 * Resumo do capítulo para a memória da IA. Usa o cache se o texto não mudou;
 * resumo travado (editado pelo autor) nunca é refeito, a não ser com `forcar`
 * (botão "Regenerar" da Memória do livro, que destrava).
 */
export async function resumoCapitulo(ctx: Ctx, dir: string, file: string, forcar = false): Promise<string> {
  const cap = await readChapter(dir, file)
  const hash = hashTexto(cap.body)
  const cache = await getDocCapitulo<ResumoDoc>(dir, 'resumos', file, cap.id)
  if (!forcar && cache?.travado) return cache.resumo
  if (!forcar && cache && cache.hash === hash && cache.resumo) return cache.resumo
  if (!cap.body.trim()) return ''
  const resumo = (
    await aiChat(ctx, {
      system: SISTEMA_RESUMO + instrucoesPerfil(await lerPerfil(dir)),
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
 * Resumos dos capítulos anteriores, em ordem do livro. Resumo travado vale
 * como está. Com `gerar`, faz os que faltam dos mais próximos para trás (até
 * MAX_RESUMOS_NOVOS por vez); sem `gerar` (tarefas automáticas) usa só o que
 * já existe. Resumo de uma versão antiga do texto entra marcado.
 */
export async function resumosAnteriores(ctx: Ctx, dir: string, file: string, gerar = true, avisos: string[] = []): Promise<ResumoAnterior[]> {
  const p = await openProject(dir)
  const idx = p.chapters.findIndex((c) => c.file === file)
  const anteriores = idx < 0 ? [] : p.chapters.slice(0, idx)
  const out: ResumoAnterior[] = []
  let novos = 0
  let faltaram = 0
  for (const c of [...anteriores].reverse()) {
    if (!c.words || c.kind === 'parte') continue // parte (título + texto curto) não é capítulo: sem resumo
    const cap = await readChapter(dir, c.file)
    const cache = await getDocCapitulo<ResumoDoc>(dir, 'resumos', c.file, c.id)
    let resumo = ''
    if (cache?.travado || (cache && cache.hash === hashTexto(cap.body))) resumo = cache.resumo
    else if (gerar && novos < MAX_RESUMOS_NOVOS) {
      resumo = await resumoCapitulo(ctx, dir, c.file)
      novos++
    } else if (cache?.resumo) resumo = `${cache.resumo} (resumo de uma versão anterior do capítulo)`
    else faltaram++
    if (resumo) out.push({ file: c.file, titulo: c.title, resumo })
  }
  if (faltaram) {
    avisos.push(
      `${faltaram} ${faltaram === 1 ? 'capítulo anterior ainda não tem resumo' : 'capítulos anteriores ainda não têm resumo'} na Memória do livro (Enredo › Memória).`
    )
  }
  return out.reverse()
}

// ---------------------------------------------------------------------------
// fichas
// ---------------------------------------------------------------------------

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

/** Fichas citadas com o número de menções (mais citadas primeiro; empate pelo nome). */
export function fichasPorMencoes(texto: string, lista: Ficha[]): Array<{ ficha: Ficha; mencoes: number }> {
  const n = new Map<string, number>()
  for (const m of mencoes(texto, lista)) n.set(m.ficha.id, (n.get(m.ficha.id) ?? 0) + 1)
  return lista
    .filter((f) => n.has(f.id))
    .map((ficha) => ({ ficha, mencoes: n.get(ficha.id) ?? 0 }))
    .sort((a, b) => b.mencoes - a.mencoes || a.ficha.nome.localeCompare(b.ficha.nome))
}

/**
 * Uma linha por ficha: nome, tipo, papel, grupo, apelidos, campos, relações
 * (rótulo + nome da outra ficha, quando `todas` é dado) e notas.
 */
export function fichaTexto(f: Ficha, todas?: Ficha[]): string {
  const campos = (Array.isArray(f.campos) ? f.campos : []).filter((c) => c?.nome && c?.valor).map((c) => `${c.nome}: ${c.valor}`)
  const partes = [`${f.nome} (${f.tipo}${f.papel ? `, ${f.papel}` : ''})`]
  if (f.grupo?.trim()) partes.push(`grupo: ${f.grupo.trim()}`)
  if (f.apelidos?.length) partes.push(`apelidos: ${f.apelidos.join(', ')}`)
  if (campos.length) partes.push(campos.join('; '))
  if (todas) {
    const porId = new Map(todas.map((x) => [x.id, x]))
    const rels = (Array.isArray(f.relacoes) ? f.relacoes : [])
      .map((r) => {
        const alvo = r?.alvo ? porId.get(r.alvo) : undefined
        return alvo && r.rotulo?.trim() ? `${r.rotulo.trim()} ${alvo.nome}` : alvo ? `ligado a ${alvo.nome}` : ''
      })
      .filter(Boolean)
    if (rels.length) partes.push(`relações: ${rels.join(', ')}`)
  }
  if (f.notas?.trim()) partes.push(`notas: ${f.notas.trim().slice(0, 400)}`)
  return `- ${partes.join(' | ')}`
}

// ---------------------------------------------------------------------------
// enredo
// ---------------------------------------------------------------------------

async function quadro(dir: string): Promise<EnredoBoard> {
  const b = await getDoc<EnredoBoard>(dir, 'enredo', 'board').catch(() => null)
  return { cartoes: Array.isArray(b?.cartoes) ? b.cartoes : [], ligacoes: Array.isArray(b?.ligacoes) ? b.ligacoes : [] }
}

/** Cartões ligados ao capítulo, na ordem do roteiro. Descartados ficam de fora. */
export async function cartoesDoCapitulo(dir: string, file: string): Promise<Cartao[]> {
  return (await quadro(dir)).cartoes
    .filter((c) => c && c.capitulo === file && c.estado !== 'descartado')
    .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
}

export const MARCA_PROVISORIO = '(ideia provisória, NÃO é fato do livro)'

export function cartaoTexto(c: Cartao): string {
  const t = (c.texto ?? '').trim().slice(0, 600)
  return `- [${c.tipo}] ${c.titulo || 'sem título'}${t ? `: ${t}` : ''}${c.estado === 'provisorio' ? ` ${MARCA_PROVISORIO}` : ''}`
}

export interface CausaTexto {
  de: string
  para: string
  rotulo: string
}

/** Ligações de causa que tocam os cartões dados (a outra ponta pode estar em outro capítulo). */
export function causasDosCartoes(board: EnredoBoard, ids: Set<string>, nomeCapitulo: (file?: string) => string): CausaTexto[] {
  const porId = new Map(board.cartoes.map((c) => [c.id, c]))
  const nome = (c: Cartao): string => {
    const cap = nomeCapitulo(c.capitulo)
    return `“${c.titulo || c.tipo}”${cap ? ` (${cap})` : ''}${c.estado === 'provisorio' ? ' [provisório]' : ''}`
  }
  const out: CausaTexto[] = []
  for (const l of board.ligacoes) {
    if (l?.tipo !== 'causa' || (!ids.has(l.de) && !ids.has(l.para))) continue
    const de = porId.get(l.de)
    const para = porId.get(l.para)
    if (!de || !para || de.estado === 'descartado' || para.estado === 'descartado') continue
    out.push({ de: nome(de), para: nome(para), rotulo: (l.rotulo ?? '').trim() })
  }
  return out
}

// ---------------------------------------------------------------------------
// amostras de voz (estilo)
// ---------------------------------------------------------------------------

/** Parágrafo representativo: o primeiro de narração (não fala) com 200+ caracteres; senão o mais longo. */
export function paragrafoDeVoz(md: string): string {
  const ps = md
    .replace(/\[\^[^\]]*\]/g, '')
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('#') && !/^!\[/.test(x) && !/^(\*\s*){3,}$/.test(x))
  const narr = ps.find((x) => x.length >= 200 && !/^\s*(?:[—–]|["“])/.test(x))
  const escolhido = narr ?? [...ps].sort((a, b) => b.length - a.length || 0)[0] ?? ''
  return escolhido.slice(0, 700)
}

/**
 * Até `n` amostras da voz do autor em OUTROS capítulos: os mais próximos do
 * atual (anterior primeiro em caso de empate), um parágrafo de cada.
 * Determinístico: o mesmo livro dá as mesmas amostras.
 */
export function escolherCapitulosDeVoz(chapters: ChapterInfo[], file: string, n = 3): ChapterInfo[] {
  const i = chapters.findIndex((c) => c.file === file)
  return chapters
    .map((c, j) => ({ c, d: i < 0 ? j : Math.abs(j - i), antes: j < i }))
    .filter((x) => x.c.file !== file && x.c.words >= 150)
    .sort((a, b) => a.d - b.d || Number(b.antes) - Number(a.antes))
    .slice(0, n)
    .map((x) => x.c)
}

async function amostrasDeOutrosCapitulos(dir: string, chapters: ChapterInfo[], file: string): Promise<string[]> {
  const out: string[] = []
  for (const c of escolherCapitulosDeVoz(chapters, file)) {
    const p = paragrafoDeVoz((await readChapter(dir, c.file)).body)
    if (p.length >= 120) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// montagem com orçamento (puro)
// ---------------------------------------------------------------------------

export interface FontesContexto {
  /** resumos dos anteriores, em ordem do livro */
  resumos: ResumoAnterior[]
  /** fichas citadas, mais citadas primeiro */
  fichas: Array<{ ficha: Ficha; mencoes: number }>
  /** todas as fichas (para nomes de POV, cenário e relações) */
  todas: Ficha[]
  cena?: CenaMeta
  cartoes: Cartao[]
  causas: CausaTexto[]
  decisoes: DecisaoRevisao[]
  voz: string[]
}

export const FONTES_VAZIAS: FontesContexto = { resumos: [], fichas: [], todas: [], cartoes: [], causas: [], decisoes: [], voz: [] }

type SecaoId = 'cena' | 'resumos-recentes' | 'fichas' | 'cartoes' | 'causas' | 'decisoes' | 'voz' | 'resumos-antigos'

/**
 * Ordem de corte: o que vem primeiro entra primeiro; quando o orçamento
 * acaba, o resto da seção (e as seguintes que não couberem) sai, com aviso.
 * Os 3 resumos mais próximos valem mais que fichas; os antigos são os
 * primeiros a sair.
 */
export const PRIORIDADE: SecaoId[] = ['cena', 'resumos-recentes', 'fichas', 'cartoes', 'causas', 'decisoes', 'voz', 'resumos-antigos']

/** Resumos mais próximos que sobem de prioridade. */
const RESUMOS_RECENTES = 3

const TITULO: Record<SecaoId, string> = {
  cena: '## Metadados da cena (do autor)',
  'resumos-recentes': '## Resumo dos capítulos anteriores (memória do livro)',
  'resumos-antigos': '## Resumo dos capítulos anteriores (memória do livro)',
  fichas: '## Fichas citadas neste capítulo',
  cartoes: '## Cartões do Enredo ligados a este capítulo',
  causas: '## Ligações de causa no Enredo',
  decisoes: '## Decisões do autor na revisão (respeite)',
  voz: '## Amostras da voz do autor em outros capítulos (ritmo, vocabulário, pontuação)'
}

function cenaLinhas(cena: CenaMeta | undefined, todas: Ficha[]): string[] {
  if (!cena) return []
  const nome = (id?: string): string => (id ? (todas.find((f) => f.id === id)?.nome ?? '') : '')
  const l: string[] = []
  if (cena.sinopse?.trim()) l.push(`- sinopse: ${cena.sinopse.trim().slice(0, 800)}`)
  if (nome(cena.pov)) l.push(`- ponto de vista: ${nome(cena.pov)}`)
  if (nome(cena.cenario)) l.push(`- cenário: ${nome(cena.cenario)}`)
  if (cena.notas?.trim()) l.push(`- notas do autor: ${cena.notas.trim().slice(0, 800)}`)
  return l.length ? [l.join('\n')] : []
}

export interface ContextoMontado {
  /** bloco de texto para a mensagem do usuário ('' se nada entrou) */
  texto: string
  /** o que foi cortado, em português, para a interface mostrar */
  avisos: string[]
  /** tokens estimados do bloco */
  tokens: number
}

/**
 * Monta o bloco de contexto dentro de `orcamentoTokens` (estimativa por
 * caracteres, ver estimarTokens). Puro e determinístico.
 */
export function montarContexto(f: FontesContexto, orcamentoTokens: number): ContextoMontado {
  const recentes = f.resumos.slice(-RESUMOS_RECENTES)
  const antigos = f.resumos.slice(0, Math.max(0, f.resumos.length - RESUMOS_RECENTES))
  const itens: Record<SecaoId, string[]> = {
    cena: cenaLinhas(f.cena, f.todas),
    // mais próximos primeiro: se cortar, cortam os mais antigos
    'resumos-recentes': [...recentes].reverse().map((r) => `- ${r.titulo}: ${r.resumo}`),
    'resumos-antigos': [...antigos].reverse().map((r) => `- ${r.titulo}: ${r.resumo}`),
    fichas: f.fichas.map((x) => fichaTexto(x.ficha, f.todas)),
    cartoes: f.cartoes.filter((c) => c.estado !== 'descartado').map(cartaoTexto),
    causas: f.causas.map((c) => `- ${c.de} → causa → ${c.para}${c.rotulo ? ` (${c.rotulo})` : ''}`),
    decisoes: decisoesEmTexto(f.decisoes),
    voz: f.voz.map((v) => `> ${v}`)
  }
  const dentro: Record<SecaoId, string[]> = {
    cena: [],
    'resumos-recentes': [],
    'resumos-antigos': [],
    fichas: [],
    cartoes: [],
    causas: [],
    decisoes: [],
    voz: []
  }
  const fora: Record<SecaoId, number> = { cena: 0, 'resumos-recentes': 0, 'resumos-antigos': 0, fichas: 0, cartoes: 0, causas: 0, decisoes: 0, voz: 0 }
  let usado = 0
  const custo = (s: string): number => estimarTokens(s.length + 1)
  for (const id of PRIORIDADE) {
    const lista = itens[id]
    let cheio = false
    for (const item of lista) {
      const cabecalho = dentro[id].length === 0 && !(id === 'resumos-antigos' && dentro['resumos-recentes'].length) ? custo(TITULO[id]) : 0
      const c = custo(item) + cabecalho
      if (cheio || usado + c > orcamentoTokens) {
        cheio = true
        fora[id]++
        continue
      }
      dentro[id].push(item)
      usado += c
    }
  }

  // saída na ordem de leitura (não na de prioridade)
  const partes: string[] = []
  const resumos = [...dentro['resumos-antigos']].reverse().concat([...dentro['resumos-recentes']].reverse())
  if (resumos.length) partes.push(TITULO['resumos-recentes'], ...resumos)
  for (const id of ['fichas', 'cena', 'cartoes', 'causas', 'decisoes', 'voz'] as SecaoId[]) {
    if (dentro[id].length) partes.push(TITULO[id], ...dentro[id])
  }

  const avisos: string[] = []
  const resumosFora = fora['resumos-antigos'] + fora['resumos-recentes']
  if (resumosFora) avisos.push(`Resumos de ${resumosFora} ${resumosFora === 1 ? 'capítulo antigo omitido' : 'capítulos antigos omitidos'} por tamanho.`)
  if (fora.fichas) {
    const nomes = f.fichas.slice(f.fichas.length - fora.fichas).map((x) => x.ficha.nome)
    avisos.push(
      `${fora.fichas} ${fora.fichas === 1 ? 'ficha menos citada omitida' : 'fichas menos citadas omitidas'} por tamanho: ${nomes.slice(0, 5).join(', ')}${nomes.length > 5 ? '…' : ''}.`
    )
  }
  if (fora.cena) avisos.push('Metadados da cena omitidos por tamanho.')
  if (fora.cartoes) avisos.push(`${fora.cartoes} ${fora.cartoes === 1 ? 'cartão do capítulo omitido' : 'cartões do capítulo omitidos'} por tamanho.`)
  if (fora.causas) avisos.push(`${fora.causas} ${fora.causas === 1 ? 'ligação de causa omitida' : 'ligações de causa omitidas'} por tamanho.`)
  if (fora.decisoes) avisos.push(`${fora.decisoes} ${fora.decisoes === 1 ? 'decisão de revisão omitida' : 'decisões de revisão omitidas'} por tamanho.`)
  if (fora.voz) avisos.push(`${fora.voz} ${fora.voz === 1 ? 'amostra de voz omitida' : 'amostras de voz omitidas'} por tamanho.`)
  return { texto: partes.join('\n'), avisos, tokens: usado }
}

// ---------------------------------------------------------------------------
// por método
// ---------------------------------------------------------------------------

export type MetodoIa = 'ideias' | 'beta' | 'continuidade' | 'redigir' | 'estilo' | 'insights' | 'resumoDia'

export interface FontesDoMetodo {
  /** tokens para o bloco de contexto (fora o capítulo e o pedido) */
  orcamento: number
  /** 'gerar' faz resumos que faltam (chama a IA); 'cache' usa só os existentes */
  resumos: 'gerar' | 'cache' | 'nao'
  fichas: boolean
  cena: boolean
  cartoes: boolean
  decisoes: boolean
  voz: boolean
}

export const ORCAMENTO: Record<MetodoIa, FontesDoMetodo> = {
  ideias: { orcamento: 12_000, resumos: 'gerar', fichas: true, cena: true, cartoes: true, decisoes: false, voz: false },
  beta: { orcamento: 8_000, resumos: 'gerar', fichas: true, cena: true, cartoes: true, decisoes: false, voz: false },
  // continuidade: fichas com campos são o essencial; resumos ajudam com fatos de capítulos anteriores
  continuidade: { orcamento: 7_000, resumos: 'cache', fichas: true, cena: true, cartoes: true, decisoes: false, voz: false },
  redigir: { orcamento: 6_000, resumos: 'cache', fichas: true, cena: true, cartoes: true, decisoes: false, voz: false },
  // estilo: voz de outros capítulos + o que o autor mandou manter
  estilo: { orcamento: 2_500, resumos: 'nao', fichas: false, cena: false, cartoes: false, decisoes: true, voz: true },
  insights: { orcamento: 3_500, resumos: 'cache', fichas: true, cena: true, cartoes: true, decisoes: true, voz: false },
  resumoDia: { orcamento: 1_500, resumos: 'cache', fichas: false, cena: true, cartoes: true, decisoes: false, voz: false }
}

/**
 * Orçamento efetivo: no Ollama a janela total tem teto (OLLAMA_CTX_MAX);
 * o que o capítulo/pedido e a resposta ocupam sai do orçamento do contexto.
 */
export function orcamentoEfetivo(base: number, ollama: boolean, reservaCaracteres: number, maxTokensResposta: number): number {
  if (!ollama) return base
  const livre = OLLAMA_CTX_MAX - estimarTokens(reservaCaracteres) - maxTokensResposta - 1024
  return Math.max(0, Math.min(base, livre))
}

export interface OpcoesContextoIa {
  /** texto onde procurar fichas citadas (padrão: o capítulo inteiro) */
  textoReferencia?: string
  /** caracteres que o pedido ocupa fora do contexto (capítulo, trecho, instruções) */
  reservaCaracteres?: number
  /** tokens pedidos para a resposta */
  maxTokens?: number
}

export interface ContextoIa extends ContextoMontado {
  titulo: string
  corpo: string
  /** id estável do capítulo */
  capId?: string
  ignorados: string[]
  perfil: PerfilObra
  /** acrescentar ao prompt de sistema */
  sistema: string
  /** decisões que valem neste capítulo */
  decisoes: DecisaoRevisao[]
  /** fichas citadas (todas, mesmo as que não couberam no texto) */
  citadas: Ficha[]
  todas: Ficha[]
  chapters: ChapterInfo[]
}

/** Contexto do livro para um método de IA, já com orçamento e avisos. */
export async function contextoIa(ctx: Ctx, dir: string, file: string, metodo: MetodoIa, op: OpcoesContextoIa = {}): Promise<ContextoIa> {
  const cfg = ORCAMENTO[metodo]
  const cap = await readChapter(dir, file)
  const p = await openProject(dir)
  const todas = await fichas(dir)
  const perfil = await lerPerfil(dir)
  const decisoes = decisoesDoCapitulo(await listarDecisoes(dir), cap.id)
  const avisos: string[] = []

  const board = cfg.cartoes ? await quadro(dir) : { cartoes: [], ligacoes: [] }
  const cartoes = board.cartoes
    .filter((c) => c && c.capitulo === file && c.estado !== 'descartado')
    .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))

  // fichas citadas no texto + as ligadas aos cartões e à cena
  const ref = op.textoReferencia ?? cap.body
  const porMencao = fichasPorMencoes(ref, todas)
  const extras = new Set([...cartoes.flatMap((c) => (Array.isArray(c.fichas) ? c.fichas : [])), cap.cena?.pov ?? '', cap.cena?.cenario ?? ''])
  for (const f of todas) if (extras.has(f.id) && !porMencao.some((x) => x.ficha.id === f.id)) porMencao.push({ ficha: f, mencoes: 0 })

  const nomeCapitulo = (f?: string): string => {
    if (!f) return ''
    const c = p.chapters.find((x) => x.file === f)
    return c ? c.title : ''
  }

  const fontes: FontesContexto = {
    resumos: cfg.resumos === 'nao' ? [] : await resumosAnteriores(ctx, dir, file, cfg.resumos === 'gerar', avisos),
    fichas: cfg.fichas ? porMencao : [],
    todas,
    ...(cfg.cena && cap.cena ? { cena: cap.cena } : {}),
    cartoes,
    causas: cfg.cartoes ? causasDosCartoes(board, new Set(cartoes.map((c) => c.id)), nomeCapitulo) : [],
    decisoes: cfg.decisoes ? decisoes : [],
    voz: cfg.voz ? await amostrasDeOutrosCapitulos(dir, p.chapters, file) : []
  }
  const s = await aiSettings(ctx)
  const orc = orcamentoEfetivo(cfg.orcamento, s.provider === 'ollama', op.reservaCaracteres ?? cap.body.length, op.maxTokens ?? 1500)
  const m = montarContexto(fontes, orc)
  return {
    ...m,
    avisos: [...avisos, ...m.avisos],
    titulo: cap.title,
    corpo: cap.body,
    ...(cap.id ? { capId: cap.id } : {}),
    ignorados: cap.ignorados ?? [],
    perfil,
    sistema: instrucoesPerfil(perfil),
    decisoes,
    citadas: porMencao.map((x) => x.ficha),
    todas,
    chapters: p.chapters
  }
}
