import { rename, stat } from 'node:fs/promises'
import { bookDir, num, str, type Ctx, type Handlers } from '../api/context'
import {
  appendChapters,
  deleteChapter,
  openProject,
  readChapter,
  reorderChapters,
  saveLayout,
  updateChapterMeta
} from '../project'
import { snapshotAgora } from '../arca'
import { assetFilePath, deleteDoc, getDoc, listDocs, newId, putDoc } from '../store/docs'
import { migrarDocsLegados } from '../store/capitulo-docs'
import { remapearRefsCapitulo } from '../ai/continuidade'
import { esquecerGeracoes } from './arte'
import { ASSET_NAMES, type CenaMeta, type EnredoBoard, type Ficha, type Insight } from '../../shared/models'
import type { ChapterInfo, ChapterKind, Project } from '../../shared/types'
import { exportar, type FormatoExport } from './manuscrito-exportar'
import { lerArquivo, previa, type CapImportado, type PreviaImport } from './manuscrito-importar'

/**
 * Métodos da feature "manuscrito": estrutura do livro (ordem, tipo, exclusão),
 * metadados de cena no front-matter, importação e exportação.
 */

const KINDS: ChapterKind[] = ['capitulo', 'prologo', 'epilogo', 'parte']
const FORMATOS: FormatoExport[] = ['docx', 'md', 'txt']

function kind(v: unknown): ChapterKind {
  const k = str(v, 20) as ChapterKind
  if (!KINDS.includes(k)) throw new Error('Tipo de capítulo inválido')
  return k
}

function file(v: unknown): string {
  return str(v, 200)
}

function cenaMeta(v: unknown): CenaMeta {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Metadados de cena inválidos')
  const o = v as Record<string, unknown>
  const out: CenaMeta = {}
  if (o.sinopse !== undefined) out.sinopse = str(o.sinopse, 4000)
  if (o.pov !== undefined) out.pov = str(o.pov, 100)
  if (o.cenario !== undefined) out.cenario = str(o.cenario, 100)
  if (o.notas !== undefined) out.notas = str(o.notas, 50_000)
  return out
}

// importações aguardando confirmação (mesmo processo no desktop e no servidor web)
const pendentes = new Map<string, { dir: string; caps: CapImportado[]; criadoEm: number }>()
const PENDENTE_TTL_MS = 30 * 60 * 1000

function limparPendentes(): void {
  const agora = Date.now()
  for (const [k, v] of pendentes) if (agora - v.criadoEm > PENDENTE_TTL_MS) pendentes.delete(k)
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Depois de renomear capítulos (reordenar), atualiza as referências por nome
 * de arquivo que outras features guardam: cartões do Enredo, insights, arte de
 * abertura (imagem e metadados de geração) e ajustes de diagramação por
 * capítulo.
 *
 * O que NÃO precisa de remapeamento: resumos, leitura beta, revisão e estado
 * dos insights (chave = id estável do capítulo, ver store/capitulo-docs.ts) e
 * "foi de propósito" (`ignorados`, no front-matter do próprio capítulo).
 * As referências `@capN` nas fichas são tratadas em `remapearFichas`.
 */
async function remapearReferencias(dir: string, mapa: Record<string, string>): Promise<void> {
  if (Object.keys(mapa).length === 0) return
  const board = await getDoc<EnredoBoard>(dir, 'enredo', 'board')
  if (board && Array.isArray(board.cartoes)) {
    let mudou = false
    const cartoes = board.cartoes.map((c) => {
      const novo = c.capitulo ? mapa[c.capitulo] : undefined
      if (!novo) return c
      mudou = true
      return { ...c, capitulo: novo }
    })
    if (mudou) await putDoc(dir, 'enredo', 'board', { ...board, cartoes })
  }

  // artes de abertura: dois passos para não sobrescrever quando nomes se cruzam
  const artes: Array<[string, string]> = []
  for (const [de, para] of Object.entries(mapa)) {
    const origem = assetFilePath(dir, ASSET_NAMES.abertura(de))
    if (await exists(origem)) artes.push([origem, assetFilePath(dir, ASSET_NAMES.abertura(para))])
  }
  for (const [origem] of artes) await rename(origem, `${origem}.reord`)
  for (const [origem, destino] of artes) await rename(`${origem}.reord`, destino)

  // metadados de geração da abertura (coleção "arte", doc gen-abertura-<arquivo>)
  const geracoes = (await listDocs<Record<string, unknown>>(dir, 'arte')).filter((g) => g.id.startsWith('gen-abertura-'))
  const mover: Array<{ velho: string; novo: string; doc: Record<string, unknown> }> = []
  for (const g of geracoes) {
    const de = `${g.id.slice('gen-abertura-'.length)}.md`
    const para = mapa[de]
    if (!para) continue
    const { id: _id, ...resto } = g
    mover.push({
      velho: g.id,
      novo: `gen-abertura-${para.replace(/\.md$/, '')}`,
      doc: { ...resto, chave: `abertura:${para}`, alvo: { tipo: 'abertura', chapterFile: para }, asset: ASSET_NAMES.abertura(para) }
    })
  }
  for (const m of mover) await deleteDoc(dir, 'arte', m.velho)
  for (const m of mover) await putDoc(dir, 'arte', m.novo, m.doc)
  if (mover.length) esquecerGeracoes(dir)

  // insights: o capítulo de cada um
  for (const i of await listDocs<Insight>(dir, 'insights')) {
    const novo = i.capitulo ? mapa[i.capitulo] : undefined
    if (novo) await putDoc(dir, 'insights', i.id, { ...i, capitulo: novo })
  }

  const p = await openProject(dir)
  const porCap = p.meta.layout.chapters
  if (porCap && Object.keys(porCap).some((k) => k in mapa)) {
    const novo: typeof porCap = {}
    for (const [k, v] of Object.entries(porCap)) novo[mapa[k] ?? k] = v
    await saveLayout(dir, { ...p.meta.layout, chapters: novo })
  }
}

/**
 * Fichas: reescreve `@capN` (número exibido do capítulo) para continuar
 * apontando para o mesmo capítulo depois de uma mudança na numeração.
 * Ver remapearRefsCapitulo em ai/continuidade.ts.
 */
async function remapearFichas(dir: string, antes: ChapterInfo[], depois: ChapterInfo[]): Promise<void> {
  for (const f of await listDocs<Ficha>(dir, 'universo')) {
    if (!Array.isArray(f.campos)) continue
    let mudou = false
    const campos = f.campos.map((c) => {
      if (!c || typeof c.valor !== 'string') return c
      const valor = remapearRefsCapitulo(c.valor, antes, depois)
      if (valor === c.valor) return c
      mudou = true
      return { ...c, valor }
    })
    if (mudou) await putDoc(dir, 'universo', f.id, { ...f, campos, atualizadoEm: new Date().toISOString() })
  }
}

async function reabrir(ctx: Ctx, dir: string): Promise<Project> {
  return ctx.remember(await openProject(dir))
}

export const handlers: Handlers = {
  /** Renomeia só o título (front-matter); o arquivo mantém o nome. → Project */
  'manuscrito.titulo': async (ctx, dir, f, titulo) => {
    const d = await bookDir(ctx, dir)
    const t = str(titulo, 300).trim()
    if (!t) throw new Error('O título não pode ficar vazio')
    await updateChapterMeta(d, file(f), { titulo: t })
    return reabrir(ctx, d)
  },

  /** Marca como capítulo, prólogo ou epílogo. → Project */
  'manuscrito.tipo': async (ctx, dir, f, k) => {
    const d = await bookDir(ctx, dir)
    const antes = (await openProject(d)).chapters
    await updateChapterMeta(d, file(f), { tipo: kind(k) })
    const p = await reabrir(ctx, d)
    await remapearFichas(d, antes, p.chapters)
    return p
  },

  /** Grava CenaMeta no front-matter (substitui o bloco "cena"). → ChapterContent */
  'manuscrito.cena': async (ctx, dir, f, meta) => {
    const d = await bookDir(ctx, dir)
    return updateChapterMeta(d, file(f), { cena: cenaMeta(meta) })
  },

  /** "Foi de propósito": lembra a chave do conflito no front-matter. → string[] */
  'manuscrito.ignorar': async (ctx, dir, f, chave) => {
    const d = await bookDir(ctx, dir)
    const fl = file(f)
    const k = str(chave, 2000)
    const atual = await readChapter(d, fl)
    const lista = Array.from(new Set([...(atual.ignorados ?? []), k]))
    const r = await updateChapterMeta(d, fl, { ignorados: lista })
    return r.ignorados ?? []
  },

  /**
   * Nova ordem dos capítulos (lista completa de arquivos). Renumera os prefixos
   * NNN e atualiza referências. → { project, renomeados: {antigo: novo} }
   */
  'manuscrito.reordenar': async (ctx, dir, ordem) => {
    const d = await bookDir(ctx, dir)
    if (!Array.isArray(ordem) || ordem.length > 999) throw new Error('Ordem inválida')
    const lista = ordem.map((x) => file(x))
    const antes = (await openProject(d)).chapters
    // documentos ainda chaveados pelo nome do arquivo vão para o id enquanto o nome vale
    await migrarDocsLegados(d, antes)
    const renomeados = await reorderChapters(d, lista)
    await remapearReferencias(d, renomeados)
    const project = await reabrir(ctx, d)
    await remapearFichas(d, antes, project.chapters)
    return { project, renomeados }
  },

  /** Move o capítulo para .arca/lixeira/. → Project */
  'manuscrito.excluir': async (ctx, dir, f) => {
    const d = await bookDir(ctx, dir)
    const antes = (await openProject(d)).chapters
    await deleteChapter(d, file(f))
    const p = await reabrir(ctx, d)
    await remapearFichas(d, antes, p.chapters)
    return p
  },

  /** Lê .docx/.txt/.md (data URL) e devolve a prévia da divisão em capítulos. → PreviaImport */
  'manuscrito.importar': async (ctx, dir, nome, dataUrl): Promise<PreviaImport> => {
    const d = await bookDir(ctx, dir)
    const n = str(nome, 300)
    const { caps, avisos } = await lerArquivo(n, str(dataUrl, 40_000_000))
    limparPendentes()
    const id = newId('imp')
    pendentes.set(id, { dir: d, caps, criadoEm: Date.now() })
    return previa(id, n, caps, avisos)
  },

  /**
   * Grava os capítulos da prévia `id` no fim do livro. `titulos` (opcional)
   * substitui os títulos; `incluir` (opcional) lista os índices a importar.
   * → { project, criados: string[] }
   */
  'manuscrito.importarConfirmar': async (ctx, dir, id, titulos, incluir) => {
    const d = await bookDir(ctx, dir)
    const pend = pendentes.get(str(id, 100))
    if (!pend || pend.dir !== d) throw new Error('A prévia expirou: importe o arquivo de novo')
    let caps = pend.caps.map((c, i) => {
      const t = Array.isArray(titulos) && typeof titulos[i] === 'string' ? str(titulos[i], 300).trim() : ''
      return { ...c, title: t || c.title }
    })
    if (Array.isArray(incluir)) {
      const idx = new Set(incluir.map((x) => num(x)))
      caps = caps.filter((_, i) => idx.has(i))
    }
    if (caps.length === 0) throw new Error('Nenhum capítulo selecionado')
    await snapshotAgora(d, 'antes de importar')
    const criados = await appendChapters(d, caps)
    pendentes.delete(str(id, 100))
    return { project: await reabrir(ctx, d), criados }
  },

  /** Exporta o livro inteiro para <livro>/export/. → caminho absoluto */
  'manuscrito.exportar': async (ctx, dir, formato) => {
    const d = await bookDir(ctx, dir)
    const f = str(formato, 10) as FormatoExport
    if (!FORMATOS.includes(f)) throw new Error('Formato inválido: use docx, md ou txt')
    return exportar(d, f)
  }
}
