import { bookDir, str, type Handlers } from '../api/context'
import { deleteAsset, getDoc, listDocs, newId, putDoc } from '../store/docs'
import { openProject, readChapter } from '../project'
import { desligarDosMapas } from './mapas'
import { calcularImpacto } from '../../shared/narrativa'
import { imagemCartaoValida, PREFIXO_IMAGEM_CARTAO, type Cartao, type CartaoEstado, type CartaoTipo, type EnredoBoard, type Ficha, type ImpactoItem, type Ligacao } from '../../shared/models'

/**
 * Enredo (E1–E5): quadro único na coleção "enredo", documento "board".
 * A interface lê e grava por aqui para o documento sair sempre saneado
 * (tipos válidos, ligações sem pontas soltas, textos com limite).
 */

const COLECAO = 'enredo'
const DOC = 'board'
const TIPOS: CartaoTipo[] = ['cena', 'virada', 'personagem', 'ideia', 'local', 'fato']
const ESTADOS: CartaoEstado[] = ['canonico', 'provisorio', 'descartado']
const CAPITULO = /^\d{3}-[a-z0-9-]+\.md$/
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/
/** id estável de capítulo (ChapterInfo.id) */
const CAP_ID = /^ch-[a-z0-9]{6,32}$/
const MAX_TERMOS = 30
const MAX_CARTOES = 5000

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function numero(v: unknown, padrao = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : padrao
}

function cartao(v: unknown): Cartao | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  const id = texto(c.id, 100)
  if (!ID.test(id)) return null
  const tipo = TIPOS.includes(c.tipo as CartaoTipo) ? (c.tipo as CartaoTipo) : 'ideia'
  const out: Cartao = {
    id,
    tipo,
    titulo: texto(c.titulo, 300),
    texto: texto(c.texto, 20_000),
    fichas: Array.isArray(c.fichas)
      ? [...new Set(c.fichas.filter((f): f is string => typeof f === 'string' && ID.test(f)))].slice(0, 100)
      : [],
    x: numero(c.x),
    y: numero(c.y),
    // legado (sem campo) = do autor e canônico
    origem: c.origem === 'ia' ? 'ia' : 'autor',
    estado: ESTADOS.includes(c.estado as CartaoEstado) ? (c.estado as CartaoEstado) : 'canonico',
    criadoEm: texto(c.criadoEm, 40) || new Date().toISOString()
  }
  const cap = texto(c.capitulo, 200)
  if (CAPITULO.test(cap)) out.capitulo = cap
  if (typeof c.ordem === 'number' && Number.isFinite(c.ordem)) out.ordem = numero(c.ordem)
  // fato: perspectiva, revelação e termos (só no tipo "fato")
  if (tipo === 'fato') {
    const p = c.perspectiva as Record<string, unknown> | undefined
    const fichaId = p && typeof p === 'object' ? texto(p.fichaId, 100) : ''
    out.perspectiva = p && p.tipo === 'crenca' && ID.test(fichaId) ? { tipo: 'crenca', fichaId } : { tipo: 'verdade' }
    const rev = texto(c.revelarEm, 40)
    if (CAP_ID.test(rev)) out.revelarEm = rev
    if (Array.isArray(c.termos)) {
      const termos = [...new Set(c.termos.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_TERMOS)
      if (termos.length) out.termos = termos
    }
  }
  // fio solto: qualquer tipo
  const fio = c.fio as Record<string, unknown> | undefined
  if (fio && typeof fio === 'object') {
    const resolveEm = texto(fio.resolveEm, 40)
    out.fio = { status: fio.status === 'resolvido' ? 'resolvido' : 'aberto', ...(CAP_ID.test(resolveEm) ? { resolveEm } : {}) }
  }
  // imagem: só nome de arquivo dentro de <livro>/assets/ (nada de pastas ou "..")
  if (imagemCartaoValida(c.imagem)) out.imagem = c.imagem
  return out
}

/**
 * Imagens que o Enredo enviou ("cartao-…") e que saíram do quadro: o cartão foi
 * excluído ou trocou/tirou a imagem, e nenhum outro cartão aponta para ela.
 * Imagens com outro nome (vindas da importação) nunca são apagadas.
 */
export function imagensOrfas(antes: EnredoBoard, depois: EnredoBoard): string[] {
  const ficam = new Set(depois.cartoes.map((c) => c.imagem).filter(Boolean))
  const sairam = new Set<string>()
  for (const c of antes.cartoes) {
    if (c.imagem && c.imagem.startsWith(PREFIXO_IMAGEM_CARTAO) && !ficam.has(c.imagem)) sairam.add(c.imagem)
  }
  return [...sairam]
}

/** Saneia um quadro vindo da interface ou do disco. */
export function sanearBoard(v: unknown): EnredoBoard {
  const raw = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof EnredoBoard, unknown>>
  const cartoes: Cartao[] = []
  const vistos = new Set<string>()
  for (const item of Array.isArray(raw.cartoes) ? raw.cartoes.slice(0, MAX_CARTOES) : []) {
    const c = cartao(item)
    if (c && !vistos.has(c.id)) {
      vistos.add(c.id)
      cartoes.push(c)
    }
  }
  const ligacoes: Ligacao[] = []
  const pares = new Set<string>()
  for (const item of Array.isArray(raw.ligacoes) ? raw.ligacoes.slice(0, MAX_CARTOES * 4) : []) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    const id = texto(l.id, 100)
    const de = texto(l.de, 100)
    const para = texto(l.para, 100)
    if (!ID.test(id) || !vistos.has(de) || !vistos.has(para) || de === para || pares.has(id)) continue
    pares.add(id)
    ligacoes.push({ id, de, para, rotulo: texto(l.rotulo, 120), tipo: l.tipo === 'causa' ? 'causa' : 'relacao' })
  }
  return { cartoes, ligacoes }
}

export const handlers: Handlers = {
  /**
   * 'enredo.impacto'(dir, chapterFile) → ImpactoItem[]: capítulos seguintes
   * que podem ser afetados se este capítulo mudar (causas no Enredo, fatos,
   * fios e fichas com mudança a partir dele). Só leitura.
   */
  'enredo.impacto': async (ctx, dir, file): Promise<ImpactoItem[]> => {
    const d = await bookDir(ctx, dir)
    const f = str(file, 200)
    if (!CAPITULO.test(f)) throw new Error('Capítulo inválido')
    const p = await openProject(d)
    const i = p.chapters.findIndex((c) => c.file === f)
    if (i < 0) throw new Error('Capítulo não encontrado')
    const board = sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
    const fichas = (await listDocs<Ficha>(d, 'universo').catch(() => [])).filter((x) => x && typeof x.nome === 'string')
    const textos: Record<string, string> = {}
    for (const c of p.chapters.slice(i + 1)) textos[c.file] = (await readChapter(d, c.file)).body
    return calcularImpacto(f, p.chapters, board, fichas, textos)
  },

  /** 'enredo.board'(dir) → EnredoBoard (vazio se ainda não existe). */
  'enredo.board': async (ctx, dir): Promise<EnredoBoard> => {
    const d = await bookDir(ctx, dir)
    return sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
  },

  /**
   * 'enredo.salvar'(dir, board) → EnredoBoard saneado e gravado.
   * Cartões que saíram do quadro também saem das ligações dos mapas, e as
   * imagens que ficaram sem cartão saem de assets/.
   */
  'enredo.salvar': async (ctx, dir, board): Promise<EnredoBoard> => {
    const d = await bookDir(ctx, dir)
    if (!board || typeof board !== 'object') throw new Error('Quadro inválido')
    const limpo = sanearBoard(board)
    const antes = sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
    await putDoc(d, COLECAO, DOC, limpo)
    const ficam = new Set(limpo.cartoes.map((c) => c.id))
    const sairam = antes.cartoes.filter((c) => !ficam.has(c.id)).map((c) => c.id)
    if (sairam.length) await desligarDosMapas(d, { cartoes: sairam })
    for (const nome of imagensOrfas(antes, limpo)) await deleteAsset(d, nome).catch(() => undefined)
    return limpo
  },

  /**
   * 'enredo.adicionarCartao'(dir, { tipo, titulo, texto, capitulo?, fichas?, origem? }) → Cartao criado.
   * Para quem cria cartão fora da tela do Enredo (Inspector, Insights): lê o
   * quadro atual, posiciona o cartão, põe no fim do roteiro do capítulo e
   * grava saneado — sem a interface reenviar o quadro inteiro.
   * Sem `origem: 'autor'`, o cartão é tratado como sugestão da IA: origem "ia"
   * e estado "provisorio" (o autor torna canônico no Enredo).
   */
  'enredo.adicionarCartao': async (ctx, dir, dados): Promise<Cartao> => {
    const d = await bookDir(ctx, dir)
    if (!dados || typeof dados !== 'object') throw new Error('Cartão inválido')
    const o = dados as Record<string, unknown>
    const board = sanearBoard(await getDoc<EnredoBoard>(d, COLECAO, DOC))
    const n = board.cartoes.length
    if (n >= MAX_CARTOES) throw new Error('O quadro já tem cartões demais')
    const cap = texto(o.capitulo, 200)
    const novo = cartao({
      id: newId('cartao'),
      tipo: o.tipo,
      titulo: o.titulo,
      texto: o.texto,
      fichas: o.fichas,
      x: 60 + (n % 5) * 260,
      y: 60 + Math.floor(n / 5) * 200,
      criadoEm: new Date().toISOString(),
      origem: o.origem === 'autor' ? 'autor' : 'ia',
      estado: o.origem === 'autor' ? 'canonico' : 'provisorio',
      ...(CAPITULO.test(cap) ? { capitulo: cap, ordem: board.cartoes.filter((c) => c.capitulo === cap).length } : {})
    })
    if (!novo) throw new Error('Cartão inválido')
    await putDoc(d, COLECAO, DOC, { ...board, cartoes: [...board.cartoes, novo] })
    return novo
  }
}
