import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import YAML from 'yaml'
import { bookDir, num, str, type Ctx, type Handlers } from '../api/context'
import { aiChat } from '../ai/index'
import { openProject, readChapter } from '../project'
import { deleteDoc, getDoc, listDocs, putAssetBytes, putDoc } from '../store/docs'
import { readSection } from '../store/settings'
import { ASSET_NAMES, type ArteConfig, type CenaMeta, type Ficha } from '../../shared/models'
import { montarPrompt, type DepsContexto } from '../arte/contexto'
import { docIdEstilo, ESTILO_PADRAO, normalizarEstilo, PRESETS } from '../arte/estilos'
import { FilaArte, type Executor } from '../arte/fila'
import { ehPng, posProcessar } from '../arte/png'
import { ARTE_DEFAULTS, baseUrl, criarProvedor, NOME_PROVEDOR, tamanhoPara, testarProvedor } from '../arte/provedores'
import { chaveDe, type Alvo, type ArteSettings, type EstadoFila, type EstiloArte, type GeracaoMeta } from '../arte/tipos'

/**
 * Arte por IA (D3/D6): estilos, montagem de prompt com o contexto do livro,
 * geração por ComfyUI local ou OpenAI Images, pós-processo e fila em lote.
 *
 * Dados no livro, coleção "arte":
 *   config                ArteConfig (estilo e semente travados do livro)
 *   estilo-<id>           estilos personalizados
 *   gen-<tipo>-<alvo>     metadados da última geração (prompt, semente, provedor, data)
 * Imagens em assets/ com ASSET_NAMES (abertura/retrato/capa).
 */

const COL = 'arte'
const CHAPTER_FILE = /^\d{3}-[a-z0-9-]+\.md$/
const FICHA_ID = /^[a-z0-9][a-z0-9-]{0,60}$/

// ---------------------------------------------------------------------------
// configurações e dados do livro
// ---------------------------------------------------------------------------

async function arteSettings(ctx: Ctx, patch?: Record<string, unknown>): Promise<{ s: ArteSettings; chaveOpenai: string }> {
  const salvo = await readSection<ArteSettings>(ctx.dataDir, 'arte')
  const limpo: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in ARTE_DEFAULTS)) continue
    if (k === 'openaiKey' && (typeof v !== 'string' || !v || v.startsWith('••••'))) continue
    // URL vinda da interface só entra depois de validada (host local/privado/Tailscale)
    limpo[k] = k === 'comfyUrl' ? baseUrl(v) : v
  }
  const s = { ...ARTE_DEFAULTS, ...salvo, ...limpo } as ArteSettings
  // sem chave própria em Arte, usa a chave da OpenAI da seção IA
  const chaveOpenai = s.openaiKey.trim() || ((await readSection<{ openaiKey: string }>(ctx.dataDir, 'ia')).openaiKey ?? '').trim()
  return { s, chaveOpenai }
}

async function lerConfig(dir: string): Promise<ArteConfig> {
  const c = await getDoc<ArteConfig>(dir, COL, 'config')
  if (c && typeof c.semente === 'number') {
    return { estilo: c.estilo || ESTILO_PADRAO, semente: c.semente, promptExtra: c.promptExtra ?? '' }
  }
  const nova: ArteConfig = { estilo: ESTILO_PADRAO, semente: Math.floor(Math.random() * 2 ** 31), promptExtra: '' }
  await putDoc(dir, COL, 'config', nova)
  return nova
}

async function listarEstilos(dir: string): Promise<EstiloArte[]> {
  const docs = await listDocs<EstiloArte>(dir, COL)
  const proprios = docs
    .filter((d) => d.id.startsWith('estilo-'))
    .map((d) => {
      try {
        return normalizarEstilo({ ...d, id: d.id.slice('estilo-'.length) })
      } catch {
        return null
      }
    })
    .filter((e): e is EstiloArte => e !== null)
  return [...PRESETS, ...proprios]
}

async function acharEstilo(dir: string, id: string): Promise<EstiloArte> {
  const todos = await listarEstilos(dir)
  return todos.find((e) => e.id === id) ?? todos.find((e) => e.id === ESTILO_PADRAO)!
}

/**
 * Capítulo + metadados de cena. O Manuscrito grava a cena dentro da chave
 * `cena:` do front-matter (ver project.ts); livros antigos podem ter
 * sinopse/pov/cenario/notas soltos no topo — esses só preenchem o que faltar.
 */
async function lerCapitulo(dir: string, file: string): Promise<{ title: string; body: string; meta: CenaMeta }> {
  const c = await readChapter(dir, file)
  const cena: CenaMeta = c.cena ?? {}
  let topo: Record<string, unknown> = {}
  try {
    const raw = await readFile(join(dir, 'manuscrito', file), 'utf8')
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const fm: unknown = m ? YAML.parse(m[1] ?? '') : null
    if (fm && typeof fm === 'object' && !Array.isArray(fm)) topo = fm as Record<string, unknown>
  } catch {
    /* sem front-matter */
  }
  const campo = (k: keyof CenaMeta): string | undefined => {
    const v = cena[k]
    if (typeof v === 'string' && v.trim()) return v
    return typeof topo[k] === 'string' && (topo[k] as string).trim() ? (topo[k] as string) : undefined
  }
  const meta: CenaMeta = { sinopse: campo('sinopse'), pov: campo('pov'), cenario: campo('cenario'), notas: campo('notas') }
  return { title: c.title, body: c.body, meta }
}

// metadados de geração em memória (carregados uma vez por livro)
const metas = new Map<string, Map<string, GeracaoMeta>>()

/** Descarta o cache de metadados do livro (depois de remapear capítulos, por exemplo). */
export function esquecerGeracoes(dir: string): void {
  metas.delete(dir)
}

async function metasDe(dir: string): Promise<Map<string, GeracaoMeta>> {
  let m = metas.get(dir)
  if (!m) {
    m = new Map()
    for (const d of await listDocs<GeracaoMeta>(dir, COL)) {
      if (d.id.startsWith('gen-') && typeof d.chave === 'string') m.set(d.chave, d)
    }
    metas.set(dir, m)
  }
  return m
}

function docIdGeracao(alvo: Alvo): string {
  if (alvo.tipo === 'abertura') return `gen-abertura-${alvo.chapterFile.replace(/\.md$/, '')}`
  if (alvo.tipo === 'retrato') return `gen-retrato-${alvo.fichaId}`
  return 'gen-capa'
}

function assetDe(alvo: Alvo): string {
  if (alvo.tipo === 'abertura') return ASSET_NAMES.abertura(alvo.chapterFile)
  if (alvo.tipo === 'retrato') return ASSET_NAMES.retrato(alvo.fichaId)
  return ASSET_NAMES.capa
}

function alvoDe(v: unknown): Alvo {
  if (!v || typeof v !== 'object') throw new Error('Alvo inválido')
  const a = v as Record<string, unknown>
  if (a.tipo === 'abertura') {
    const f = str(a.chapterFile, 200)
    if (!CHAPTER_FILE.test(f)) throw new Error('Capítulo inválido')
    return { tipo: 'abertura', chapterFile: f }
  }
  if (a.tipo === 'retrato') {
    const id = str(a.fichaId, 100)
    if (!FICHA_ID.test(id)) throw new Error('Ficha inválida')
    return { tipo: 'retrato', fichaId: id }
  }
  if (a.tipo === 'capa') return { tipo: 'capa' }
  throw new Error('Tipo de arte inválido')
}

function depsPara(ctx: Ctx, s: ArteSettings): DepsContexto {
  return {
    ia: (req) => aiChat(ctx, req),
    projeto: (dir) => openProject(dir),
    capitulo: lerCapitulo,
    fichas: async (dir) => (await listDocs<Ficha>(dir, 'universo')).filter((f) => typeof f.nome === 'string'),
    config: lerConfig,
    estilo: acharEstilo,
    tamanho: (prop) => tamanhoPara(s, prop),
    variacao: async (dir, chave) => (await metasDe(dir)).get(chave)?.variacao ?? 0
  }
}

// ---------------------------------------------------------------------------
// fila
// ---------------------------------------------------------------------------

const fila = new FilaArte()

function executorPara(ctx: Ctx): Executor {
  return async (dir, item, signal) => {
    const t0 = Date.now()
    const { s, chaveOpenai } = await arteSettings(ctx)
    const provedor = criarProvedor(s, chaveOpenai)
    const pm = await montarPrompt(depsPara(ctx, s), dir, item.alvo, { semIA: !!item.promptManual, variar: item.variar })
    if (signal.aborted) throw new Error('Cancelado')
    const prompt = item.promptManual?.trim() || pm.prompt
    const r = await provedor.gerar({ prompt, negativo: pm.negativo, semente: pm.semente, largura: pm.largura, altura: pm.altura, signal })
    if (!ehPng(r.bytes)) throw new Error('O gerador devolveu uma imagem que não é PNG (ajuste o SaveImage do workflow).')
    const pp = posProcessar(r.bytes, pm.proporcao, pm.paleta)
    if (signal.aborted) throw new Error('Cancelado')
    const asset = assetDe(item.alvo)
    await putAssetBytes(dir, asset, pp.bytes)
    const meta: GeracaoMeta = {
      chave: item.chave,
      alvo: item.alvo,
      asset,
      prompt,
      negativo: pm.negativo,
      estilo: pm.estilo,
      semente: r.usouSemente ? pm.semente : -1,
      variacao: pm.variacao,
      provedor: s.provedor,
      modelo: r.modelo,
      largura: pp.largura || pm.largura,
      altura: pp.altura || pm.altura,
      posProcesso: pp.descricao,
      criadoEm: new Date().toISOString(),
      duracaoMs: Date.now() - t0
    }
    await putDoc(dir, COL, docIdGeracao(item.alvo), meta)
    ;(await metasDe(dir)).set(item.chave, meta)
    if (item.alvo.tipo === 'retrato') {
      // Ficha.retrato aponta para o arquivo em assets/ (contrato em shared/models.ts)
      const f = await getDoc<Ficha>(dir, 'universo', item.alvo.fichaId)
      if (f && f.retrato !== asset) {
        const { id: _id, ...resto } = f
        await putDoc(dir, 'universo', item.alvo.fichaId, { ...resto, retrato: asset, atualizadoEm: new Date().toISOString() })
      }
    }
    return meta
  }
}

async function rotuloDe(dir: string, alvo: Alvo): Promise<string> {
  if (alvo.tipo === 'capa') return 'Capa'
  if (alvo.tipo === 'retrato') return (await getDoc<Ficha>(dir, 'universo', alvo.fichaId))?.nome ?? 'Retrato'
  const p = await openProject(dir)
  const c = p.chapters.find((x) => x.file === alvo.chapterFile)
  return c?.title ?? alvo.chapterFile
}

async function estado(ctx: Ctx, dir: string): Promise<EstadoFila> {
  const { s } = await arteSettings(ctx)
  return {
    itens: fila.itens(dir),
    geradas: Object.fromEntries(await metasDe(dir)),
    mediaMs: fila.media(),
    restanteMs: fila.restante(dir),
    provedor: s.provedor
  }
}

function opcoes(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

// ---------------------------------------------------------------------------

export const handlers: Handlers = {
  /** Estilos de fábrica + personalizados do livro. */
  'arte.estilos': async (ctx, dir) => listarEstilos(await bookDir(ctx, dir)),

  'arte.salvarEstilo': async (ctx, dir, estilo) => {
    const d = await bookDir(ctx, dir)
    const e = normalizarEstilo(estilo)
    const { id, ...resto } = e
    await putDoc(d, COL, docIdEstilo(id), resto)
    return e
  },

  'arte.excluirEstilo': async (ctx, dir, id) => {
    const d = await bookDir(ctx, dir)
    const i = str(id, 61)
    if (PRESETS.some((p) => p.id === i)) throw new Error('Estilos de fábrica não podem ser excluídos')
    await deleteDoc(d, COL, docIdEstilo(i))
    const cfg = await lerConfig(d)
    if (cfg.estilo === i) await putDoc(d, COL, 'config', { ...cfg, estilo: ESTILO_PADRAO })
  },

  /** ArteConfig do livro (cria com semente aleatória na primeira vez). */
  'arte.config': async (ctx, dir) => lerConfig(await bookDir(ctx, dir)),

  'arte.salvarConfig': async (ctx, dir, patch) => {
    const d = await bookDir(ctx, dir)
    const p = opcoes(patch)
    const atual = await lerConfig(d)
    const next: ArteConfig = { ...atual }
    if (p.estilo !== undefined) {
      const id = str(p.estilo, 61)
      if (!(await listarEstilos(d)).some((e) => e.id === id)) throw new Error('Estilo desconhecido')
      next.estilo = id
    }
    if (p.semente !== undefined) next.semente = Math.abs(Math.floor(num(p.semente))) % 4294967296
    if (p.promptExtra !== undefined) next.promptExtra = str(p.promptExtra, 1000)
    const { id: _id, ...salvar } = next as ArteConfig & { id?: string }
    await putDoc(d, COL, 'config', salvar)
    return salvar
  },

  /** Monta o prompt (estilo + contexto do livro) para mostrar e editar antes de gerar. */
  'arte.prompt': async (ctx, dir, alvo, opc) => {
    const d = await bookDir(ctx, dir)
    const { s } = await arteSettings(ctx)
    return montarPrompt(depsPara(ctx, s), d, alvoDe(alvo), { variar: !!opcoes(opc).variar })
  },

  /**
   * Gera uma arte. Entra na frente da fila e devolve o item na hora; a
   * interface acompanha por 'arte.fila' (geração leva de segundos a minutos).
   * prompt: texto editado pelo autor (vazio = montar na hora).
   * opcoes.variar: nova variação (regenerar com outra semente derivada da do livro).
   */
  'arte.gerar': async (ctx, dir, alvo, prompt, opc) => {
    const d = await bookDir(ctx, dir)
    const a = alvoDe(alvo)
    const { s, chaveOpenai } = await arteSettings(ctx)
    criarProvedor(s, chaveOpenai) // falha cedo se desligado/sem chave
    const p = typeof prompt === 'string' ? str(prompt, 8000).trim() : ''
    return fila.enfileirar(d, a, executorPara(ctx), {
      rotulo: await rotuloDe(d, a),
      ...(p ? { promptManual: p } : {}),
      variar: !!opcoes(opc).variar,
      prioridade: true
    })
  },

  /** Enfileira as aberturas dos capítulos. opcoes.refazer=false pula os que já têm arte. */
  'arte.lote': async (ctx, dir, chapterFiles, opc) => {
    const d = await bookDir(ctx, dir)
    if (!Array.isArray(chapterFiles) || chapterFiles.length > 2000) throw new Error('Lista de capítulos inválida')
    const { s, chaveOpenai } = await arteSettings(ctx)
    criarProvedor(s, chaveOpenai)
    const refazer = !!opcoes(opc).refazer
    const projeto = await openProject(d)
    const feitas = await metasDe(d)
    const executar = executorPara(ctx)
    for (const raw of chapterFiles) {
      const f = str(raw, 200)
      if (!CHAPTER_FILE.test(f)) throw new Error(`Capítulo inválido: ${f}`)
      const info = projeto.chapters.find((c) => c.file === f)
      if (!info) continue
      const alvo: Alvo = { tipo: 'abertura', chapterFile: f }
      if (!refazer && feitas.has(chaveDe(alvo))) continue
      fila.enfileirar(d, alvo, executar, { rotulo: info.title })
    }
    return estado(ctx, d)
  },

  /** Estado da fila e últimas gerações do livro (para a grade de miniaturas). */
  'arte.fila': async (ctx, dir) => estado(ctx, await bookDir(ctx, dir)),

  /** Cancela um alvo (chave) ou, sem chave, tudo que está pendente no livro. */
  'arte.cancelar': async (ctx, dir, chave) => {
    const d = await bookDir(ctx, dir)
    fila.cancelar(d, chave === undefined || chave === null ? undefined : str(chave, 200))
    return estado(ctx, d)
  },

  /** Remove do histórico os itens finalizados (prontos, erros, cancelados). */
  'arte.limpar': async (ctx, dir) => {
    const d = await bookDir(ctx, dir)
    fila.limpar(d)
    return estado(ctx, d)
  },

  /** Valida a URL do ComfyUI antes de salvar (a interface chama antes de settings.put). Devolve a URL normalizada. */
  'arte.validarUrl': async (_ctx, url) => baseUrl(str(url, 500)),

  /** Testa o provedor com as configurações salvas, sobrepostas pelo patch (ainda não salvo). */
  'arte.testar': async (ctx, patch) => {
    let cfg: Awaited<ReturnType<typeof arteSettings>>
    try {
      cfg = await arteSettings(ctx, opcoes(patch))
    } catch (e) {
      return { ok: false, mensagem: (e as Error).message, provedor: NOME_PROVEDOR.comfyui }
    }
    const { s, chaveOpenai } = cfg
    const r = await testarProvedor(s, chaveOpenai)
    return { ...r, provedor: NOME_PROVEDOR[s.provedor] }
  }
}
