import { bookDir, str, type Handlers } from '../api/context'
import { openProject, readChapter } from '../project'
import { getDocCapitulo, putDocCapitulo } from '../store/capitulo-docs'
import { resumoCapitulo, type ResumoDoc } from '../ai/contexto'
import { adicionarDecisao, listarDecisoes, removerDecisao } from '../ai/decisoes'
import { lerPerfil, salvarPerfil } from '../ai/perfil'
import { metricasDoLivro, metricasRitmo } from '../ai/ritmo'
import { hashTexto } from '../ai/texto'
import type { ChapterInfo } from '../../shared/types'
import type { MemoriaItem, RitmoComparado } from '../../shared/models'

/**
 * Controle do autor sobre o que a IA sabe e decide:
 * - "memoria.*": Memória do livro (resumos por capítulo; editar trava);
 * - "revisao.*": decisões "Sempre manter" e métricas de ritmo;
 * - "livro.perfil*": perfil da obra (instruções para todos os prompts).
 * Contratos em src/shared/models.ts.
 */

const CAP_RE = /^\d{3}-[a-z0-9-]+\.md$/
const MAX_RESUMO = 4000

function capFile(v: unknown): string {
  const f = str(v, 200)
  if (!CAP_RE.test(f)) throw new Error('Capítulo inválido.')
  return f
}

async function itemMemoria(dir: string, c: ChapterInfo): Promise<MemoriaItem> {
  const cap = await readChapter(dir, c.file)
  const doc = await getDocCapitulo<ResumoDoc>(dir, 'resumos', c.file, c.id)
  const temTexto = !!cap.body.trim()
  const resumo = doc?.resumo ?? ''
  const estado: MemoriaItem['estado'] = !temTexto && !resumo ? 'sem-texto' : !resumo ? 'sem-resumo' : doc && doc.hash !== hashTexto(cap.body) ? 'desatualizado' : 'atual'
  return {
    file: c.file,
    id: c.id,
    titulo: c.title,
    palavras: c.words,
    resumo,
    estado,
    travado: !!doc?.travado,
    ...(doc?.geradoEm ? { geradoEm: doc.geradoEm } : {}),
    ...(doc?.editadoEm ? { editadoEm: doc.editadoEm } : {})
  }
}

async function capInfo(dir: string, file: string): Promise<ChapterInfo> {
  const c = (await openProject(dir)).chapters.find((x) => x.file === file)
  if (!c) throw new Error('Capítulo não encontrado.')
  return c
}

export const handlers: Handlers = {
  // ------------------------------------------------------------ memória do livro

  /** 'memoria.listar'(dir) → MemoriaItem[] na ordem do livro (sem chamar a IA). */
  'memoria.listar': async (ctx, dir): Promise<MemoriaItem[]> => {
    const d = await bookDir(ctx, dir)
    const out: MemoriaItem[] = []
    for (const c of (await openProject(d)).chapters) out.push(await itemMemoria(d, c))
    return out
  },

  /**
   * 'memoria.salvar'(dir, file, texto) → MemoriaItem. Resumo escrito pelo autor:
   * fica travado (a IA não sobrescreve) e marcado com o hash do texto atual.
   * Texto vazio apaga o resumo e destrava.
   */
  'memoria.salvar': async (ctx, dir, file, texto): Promise<MemoriaItem> => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    if (typeof texto !== 'string') throw new Error('Resumo inválido.')
    const t = texto.trim()
    if (t.length > MAX_RESUMO) throw new Error(`Resumo longo demais (máx. ${MAX_RESUMO} caracteres).`)
    const c = await capInfo(d, f)
    const cap = await readChapter(d, f)
    const agora = new Date().toISOString()
    const antes = await getDocCapitulo<ResumoDoc>(d, 'resumos', f, c.id)
    await putDocCapitulo<ResumoDoc>(
      d,
      'resumos',
      f,
      t
        ? { hash: hashTexto(cap.body), resumo: t, titulo: cap.title, geradoEm: antes?.geradoEm ?? agora, travado: true, editadoEm: agora }
        : { hash: '', resumo: '', titulo: cap.title, geradoEm: antes?.geradoEm ?? agora },
      c.id
    )
    return itemMemoria(d, c)
  },

  /** 'memoria.regenerar'(dir, file) → MemoriaItem. Pede um resumo novo à IA (destrava). */
  'memoria.regenerar': async (ctx, dir, file): Promise<MemoriaItem> => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const c = await capInfo(d, f)
    if (!(await readChapter(d, f)).body.trim()) throw new Error('O capítulo está vazio: não há o que resumir.')
    await resumoCapitulo(ctx, d, f, true)
    return itemMemoria(d, c)
  },

  /** 'memoria.destravar'(dir, file) → MemoriaItem. A IA volta a poder refazer o resumo quando o texto mudar. */
  'memoria.destravar': async (ctx, dir, file): Promise<MemoriaItem> => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const c = await capInfo(d, f)
    const doc = await getDocCapitulo<ResumoDoc>(d, 'resumos', f, c.id)
    if (doc) {
      const { id: _id, travado: _t, editadoEm: _e, ...resto } = doc
      await putDocCapitulo<ResumoDoc>(d, 'resumos', f, resto, c.id)
    }
    return itemMemoria(d, c)
  },

  // ------------------------------------------------------------ decisões de revisão

  /** 'revisao.decisoes'(dir) → DecisaoRevisao[] */
  'revisao.decisoes': async (ctx, dir) => listarDecisoes(await bookDir(ctx, dir)),

  /** 'revisao.decidir'(dir, { tipo, valor, capitulo?, rotulo? }) → DecisaoRevisao[] */
  'revisao.decidir': async (ctx, dir, decisao) => adicionarDecisao(await bookDir(ctx, dir), decisao),

  /** 'revisao.esquecer'(dir, id) → DecisaoRevisao[] */
  'revisao.esquecer': async (ctx, dir, id) => removerDecisao(await bookDir(ctx, dir), str(id, 100)),

  /** 'revisao.ritmo'(dir, file) → RitmoComparado (sem IA) */
  'revisao.ritmo': async (ctx, dir, file): Promise<RitmoComparado> => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const p = await openProject(d)
    const textos: string[] = []
    let atual = ''
    for (const c of p.chapters) {
      if (c.kind === 'parte' && c.file !== f) continue // página de parte não entra na média de ritmo
      const body = (await readChapter(d, c.file)).body
      if (c.file === f) atual = body
      if (body.trim()) textos.push(body)
    }
    return { capitulo: metricasRitmo(atual), livro: metricasDoLivro(textos), capitulosNaMedia: textos.length }
  },

  // ------------------------------------------------------------ perfil da obra

  /** 'livro.perfil'(dir) → PerfilObra */
  'livro.perfil': async (ctx, dir) => lerPerfil(await bookDir(ctx, dir)),

  /** 'livro.salvarPerfil'(dir, patch) → PerfilObra */
  'livro.salvarPerfil': async (ctx, dir, patch) => salvarPerfil(await bookDir(ctx, dir), patch)
}
