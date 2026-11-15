import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import YAML from 'yaml'
import { appendChapters, novoIdCapitulo, openProject, readChapter, saveChapter, saveLayout, saveMeta, slugify, updateChapterMeta } from '../project'
import { snapshotAgora } from '../arca'
import { deleteAsset, getDoc, listDocs, newId, putDoc } from '../store/docs'
import { lerPerfil, salvarPerfil, sanearPerfil } from '../ai/perfil'
import { adicionarDecisao, listarDecisoes } from '../ai/decisoes'
import { imagensOrfas, sanearBoard } from './enredo'
import { normalizar } from '../../shared/decisoes'
import { resolveRotulo, resolveRotuloParte, type RotuloCfg } from '../../shared/rotulo'
import { DEFAULT_LAYOUT, type ChapterKind, type CoverSettings, type EpigrafeCap, type FrontMatter, type LayoutSettings, type Project } from '../../shared/types'
import {
  PERFIL_PADRAO,
  imagemCartaoValida,
  type Cartao,
  type CenaMeta,
  type DecisaoRevisao,
  type EnredoBoard,
  type Ficha,
  type FichaCampo,
  type FichaMudanca,
  type FichaTipo,
  type Ligacao,
  type PerfilObra
} from '../../shared/models'
import { FORMATO_LIVRO, VERSAO_LIVRO, type ItemPrevia, type MsgPrevia, type OpcoesExport, type PreviaImport } from '../../shared/importar'
import { TIPOS_FICHA, lerArquivo, type ArquivoLivro } from './importar-ler'

/**
 * Importação e exportação de "regras e dados" do livro inteiro (formato
 * folio-livro v1, docs/modelo-livro.yaml):
 *
 *   lerEstado(dir)            → o que o livro tem hoje
 *   planejar(estado, dados)   → prévia (criar/atualizar/avisos/erros) + o alvo a gravar (puro)
 *   aplicarAlvo(dir, alvo)    → grava (versão de segurança antes)
 *   exportarYaml(estado)      → o livro no mesmo formato
 *
 * Regras: casa por nome/título normalizado (sem acento, sem maiúsculas);
 * o que existe só muda nos campos presentes no arquivo; o que falta é criado;
 * nada é apagado. Capítulos novos entram no fim do livro, na ordem do arquivo;
 * os que já existem nunca mudam de lugar.
 */

// ---------------------------------------------------------------- estado

export interface CapEstado {
  file: string
  id: string
  titulo: string
  kind: ChapterKind
  body: string
  cena: CenaMeta
  epigrafe?: EpigrafeCap
}

export interface Metas {
  metaLivro?: number
  metaCapitulo?: number
}

export interface EstadoLivro {
  title: string
  author: string
  layout: LayoutSettings
  capitulos: CapEstado[]
  fichas: Ficha[]
  board: EnredoBoard
  perfil: PerfilObra
  decisoes: DecisaoRevisao[]
  metas: Metas
  /** imagens que existem em <livro>/assets/ (para validar `imagem:` dos cartões) */
  assets?: string[]
}

const numOk = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)

function strOk(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Ficha do disco completada com o que faltar (mesmas regras da tela do Universo). */
function fichaDe(raw: Partial<Ficha> & { id: string }): Ficha {
  return {
    id: raw.id,
    tipo: TIPOS_FICHA.includes(raw.tipo as FichaTipo) ? (raw.tipo as FichaTipo) : 'personagem',
    nome: strOk(raw.nome) || 'Sem nome',
    apelidos: Array.isArray(raw.apelidos) ? raw.apelidos.filter((a): a is string => typeof a === 'string') : [],
    papel: strOk(raw.papel),
    grupo: strOk(raw.grupo),
    campos: Array.isArray(raw.campos)
      ? raw.campos
          .filter((c) => c && typeof c.nome === 'string')
          .map((c) => {
            const campo: FichaCampo = { nome: c.nome, valor: strOk(c.valor) }
            const hist = Array.isArray(c.historico)
              ? c.historico.filter((h) => h && typeof h.desde === 'string' && typeof h.valor === 'string').map((h) => ({ valor: h.valor, desde: h.desde }))
              : []
            if (hist.length) campo.historico = hist
            return campo
          })
      : [],
    relacoes: Array.isArray(raw.relacoes)
      ? raw.relacoes.filter((r) => r && typeof r.alvo === 'string').map((r) => ({ alvo: r.alvo, rotulo: strOk(r.rotulo) }))
      : [],
    notas: strOk(raw.notas),
    retrato: strOk(raw.retrato),
    criadoEm: strOk(raw.criadoEm) || new Date().toISOString(),
    atualizadoEm: strOk(raw.atualizadoEm) || new Date().toISOString()
  }
}

export async function lerMetas(dir: string): Promise<Metas> {
  const atual = await getDoc<Metas>(dir, 'escrita', 'metas').catch(() => null)
  const out: Metas = {}
  const cap = numOk(atual?.metaCapitulo)
  const livro = numOk(atual?.metaLivro)
  if (cap !== undefined) out.metaCapitulo = cap
  if (livro !== undefined) out.metaLivro = livro
  if (out.metaLivro === undefined) {
    // livros antigos: meta do livro em config/metas.palavras (a interface migra na leitura)
    const legado = await getDoc<{ palavras?: unknown }>(dir, 'config', 'metas').catch(() => null)
    const p = numOk(legado?.palavras)
    if (p) out.metaLivro = p
  }
  return out
}

export async function lerEstado(dir: string): Promise<EstadoLivro> {
  const p = await openProject(dir)
  const capitulos: CapEstado[] = []
  for (const c of p.chapters) {
    const r = await readChapter(dir, c.file)
    capitulos.push({ file: c.file, id: c.id, titulo: c.title, kind: c.kind, body: r.body, cena: r.cena ?? {}, ...(r.epigrafe ? { epigrafe: r.epigrafe } : {}) })
  }
  const fichas = (await listDocs<Partial<Ficha>>(dir, 'universo').catch(() => []))
    .filter((f) => f && typeof f.nome === 'string')
    .map((f) => fichaDe(f))
  return {
    title: p.meta.title,
    author: p.meta.author,
    layout: p.meta.layout,
    capitulos,
    fichas,
    board: sanearBoard(await getDoc<EnredoBoard>(dir, 'enredo', 'board')),
    perfil: await lerPerfil(dir),
    decisoes: await listarDecisoes(dir),
    metas: await lerMetas(dir),
    assets: (await readdir(join(dir, 'assets')).catch(() => [] as string[])).filter((n) => imagemCartaoValida(n))
  }
}

/** Livro ainda não criado (prévia de "Criar a partir de arquivo"). */
export function estadoVazio(title = '', author = ''): EstadoLivro {
  return {
    title,
    author,
    layout: DEFAULT_LAYOUT,
    capitulos: [],
    fichas: [],
    board: { cartoes: [], ligacoes: [] },
    perfil: { ...PERFIL_PADRAO },
    decisoes: [],
    metas: {},
    assets: []
  }
}

// ---------------------------------------------------------------- plano

export interface NovoCap {
  id: string
  /** nome previsto do arquivo (o mesmo cálculo de appendChapters) */
  file: string
  title: string
  kind: ChapterKind
  body: string
  cena?: CenaMeta
  epigrafe?: EpigrafeCap
}

export interface CapAtualizar {
  file: string
  titulo: string
  patch: { tipo?: ChapterKind; cena?: CenaMeta; epigrafe?: EpigrafeCap }
  body?: string
}

/** Tudo o que a importação grava (só o que muda). */
export interface Alvo {
  meta?: { title: string; author: string }
  layout?: LayoutSettings
  metas?: Metas
  perfil?: PerfilObra
  decisoes: Array<{ tipo: 'manter-palavra' | 'manter-trecho'; valor: string; rotulo: string }>
  fichas: Ficha[]
  novosCaps: NovoCap[]
  capsAtualizar: CapAtualizar[]
  board?: EnredoBoard
}

export interface Plano {
  previa: PreviaImport
  alvo: Alvo
}

export function alvoVazio(a: Alvo): boolean {
  return (
    !a.meta && !a.layout && !a.metas && !a.perfil && !a.board &&
    a.decisoes.length === 0 && a.fichas.length === 0 && a.novosCaps.length === 0 && a.capsAtualizar.length === 0
  )
}

const N = (s: string): string => normalizar(s)
const curto = (s: string, n = 40): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const igualLista = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** Primeiro de cada nome normalizado (o livro pode ter repetidos). */
function indice<T>(lista: T[], chave: (x: T) => string): Map<string, T> {
  const m = new Map<string, T>()
  for (const x of lista) {
    const k = N(chave(x))
    if (k && !m.has(k)) m.set(k, x)
  }
  return m
}

const LARG_CARTAO = 260
const ALT_CARTAO = 200
const COLUNAS = 5

/**
 * Monta a prévia e o alvo. Puro: `agora` e os geradores de id entram por
 * parâmetro nos testes; na prática usam os do app.
 */
export function planejar(estado: EstadoLivro, dados: ArquivoLivro, agora = new Date().toISOString()): Plano {
  const criar: ItemPrevia[] = []
  const atualizar: ItemPrevia[] = []
  const avisos: MsgPrevia[] = []
  const erros: MsgPrevia[] = []
  const notas: string[] = []
  const alvo: Alvo = { decisoes: [], fichas: [], novosCaps: [], capsAtualizar: [] }
  const aviso = (linha: number | undefined, texto: string): void => void avisos.push({ linha, texto })

  // ---------- livro / metas
  const tituloNovo = dados.livro.titulo ?? estado.title
  const autorNovo = dados.livro.autor ?? estado.author
  if (tituloNovo !== estado.title || autorNovo !== estado.author) {
    alvo.meta = { title: tituloNovo, author: autorNovo }
    const m: string[] = []
    if (tituloNovo !== estado.title) m.push(`título: ${estado.title || '—'} → ${tituloNovo}`)
    if (autorNovo !== estado.author) m.push(`autor: ${estado.author || '—'} → ${autorNovo}`)
    atualizar.push({ secao: 'livro', nome: 'Título e autor', mudancas: m })
  }
  const metas: Metas = {}
  const mm: string[] = []
  if (dados.livro.metaPalavras !== undefined && dados.livro.metaPalavras !== estado.metas.metaLivro) {
    metas.metaLivro = dados.livro.metaPalavras
    mm.push(`livro: ${dados.livro.metaPalavras.toLocaleString('pt-BR')} palavras`)
  }
  if (dados.livro.metaCapitulo !== undefined && dados.livro.metaCapitulo !== estado.metas.metaCapitulo) {
    metas.metaCapitulo = dados.livro.metaCapitulo
    mm.push(`capítulo: ${dados.livro.metaCapitulo.toLocaleString('pt-BR')} palavras`)
  }
  if (mm.length) {
    alvo.metas = metas
    atualizar.push({ secao: 'metas', nome: 'Metas de palavras', mudancas: mm })
  }

  // ---------- perfil
  const perfil = sanearPerfil({ ...estado.perfil, ...dados.perfil })
  const pm: string[] = []
  const NOMES_PERFIL: Record<keyof PerfilObra, string> = {
    narradorNaoConfiavel: 'narrador não confiável',
    ambiguidadeDeliberada: 'ambiguidade deliberada',
    naoLinear: 'não linear',
    notasIa: 'notas para a IA'
  }
  for (const k of Object.keys(NOMES_PERFIL) as Array<keyof PerfilObra>) {
    if (perfil[k] === estado.perfil[k]) continue
    pm.push(k === 'notasIa' ? NOMES_PERFIL[k] : `${NOMES_PERFIL[k]}: ${perfil[k] ? 'sim' : 'não'}`)
  }
  if (pm.length) {
    alvo.perfil = perfil
    atualizar.push({ secao: 'perfil', nome: 'Perfil da obra', mudancas: pm })
  }

  // ---------- layout: nomes, páginas, subtítulo, sinopse da contracapa
  const lay = estado.layout
  const frontAntes: FrontMatter = { ...(DEFAULT_LAYOUT.front as FrontMatter), ...(lay.front ?? {}) }
  const coverAntes: CoverSettings = { ...(DEFAULT_LAYOUT.cover as CoverSettings), ...(lay.cover ?? {}) }
  const front: FrontMatter = { ...frontAntes }
  const cover: CoverSettings = { ...coverAntes }
  const nm: string[] = []
  let rotulo: RotuloCfg | undefined
  let rotuloParte: RotuloCfg | undefined
  let reiniciar: boolean | undefined
  if (dados.nomes.capitulos) {
    const antes = resolveRotulo(lay)
    const depois = resolveRotulo({ rotulo: { ...antes, ...dados.nomes.capitulos } })
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      rotulo = depois
      nm.push('nome dos capítulos')
    }
  }
  if (dados.nomes.partes) {
    const antes = resolveRotuloParte(lay)
    const depois = resolveRotuloParte({ rotuloParte: { ...antes, ...dados.nomes.partes } })
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      rotuloParte = depois
      nm.push('nome das partes')
    }
  }
  if (dados.nomes.reiniciar !== undefined && dados.nomes.reiniciar !== (lay.reiniciarNumeracao === true)) {
    reiniciar = dados.nomes.reiniciar
    nm.push(`numeração ${reiniciar ? 'recomeça' : 'continua'} a cada parte`)
  }
  if (nm.length) atualizar.push({ secao: 'nomes', nome: 'Nome dos capítulos e partes', mudancas: nm })

  const pg: string[] = []
  const texto = (campo: 'dedicatoriaTexto' | 'agradecimentosTexto' | 'sobreAutorTexto' | 'posfacioTexto', liga: 'dedicatoria' | 'agradecimentos' | 'sobreAutor' | 'posfacio', v: string | undefined, nome: string): void => {
    if (v === undefined) return
    if (front[campo] !== v || front[liga] !== true) {
      front[campo] = v
      front[liga] = true
      pg.push(nome)
    }
  }
  const simples = (campo: 'editora' | 'cidade' | 'ano' | 'isbn' | 'subtitulo', v: string | undefined, nome: string): void => {
    if (v === undefined || front[campo] === v) return
    front[campo] = v
    pg.push(`${nome}: ${curto(v)}`)
  }
  const pag = dados.paginas
  texto('dedicatoriaTexto', 'dedicatoria', pag.dedicatoria, 'dedicatória')
  if (pag.epigrafe && (front.epigrafeTexto !== pag.epigrafe.texto || front.epigrafeAutor !== (pag.epigrafe.autor ?? front.epigrafeAutor) || !front.epigrafe)) {
    front.epigrafeTexto = pag.epigrafe.texto
    if (pag.epigrafe.autor !== undefined) front.epigrafeAutor = pag.epigrafe.autor
    front.epigrafe = true
    pg.push('epígrafe do livro')
  }
  simples('editora', pag.editora, 'editora')
  simples('cidade', pag.cidade, 'cidade')
  simples('ano', pag.ano, 'ano')
  simples('isbn', pag.isbn, 'ISBN')
  simples('subtitulo', dados.livro.subtitulo, 'subtítulo')
  texto('agradecimentosTexto', 'agradecimentos', pag.agradecimentos, 'agradecimentos')
  texto('sobreAutorTexto', 'sobreAutor', pag.sobreOAutor, 'sobre o autor')
  texto('posfacioTexto', 'posfacio', pag.posfacio, 'posfácio')
  if (pag.sinopseContracapa !== undefined && cover.sinopse !== pag.sinopseContracapa) {
    cover.sinopse = pag.sinopseContracapa
    pg.push('sinopse da contracapa')
  }
  if (pg.length) atualizar.push({ secao: 'paginas', nome: 'Páginas do livro', mudancas: pg })
  if (nm.length || pg.length) {
    alvo.layout = {
      ...lay,
      ...(rotulo ? { rotulo } : {}),
      ...(rotuloParte ? { rotuloParte } : {}),
      ...(reiniciar !== undefined ? { reiniciarNumeracao: reiniciar } : {}),
      front,
      cover
    }
  }

  // ---------- índices: o que existe + o que o arquivo cria (referências valem para os dois)
  const fichasPorNome = indice(estado.fichas, (f) => f.nome)
  const capsPorTitulo = indice(estado.capitulos, (c) => c.titulo)
  const cartoesPorTitulo = indice(estado.board.cartoes, (c) => c.titulo)
  const refFicha = new Map<string, string>()
  for (const f of estado.fichas) if (!refFicha.has(N(f.nome))) refFicha.set(N(f.nome), f.id)
  const refCap = new Map<string, { id: string; file: string; titulo: string }>()
  for (const c of estado.capitulos) if (!refCap.has(N(c.titulo))) refCap.set(N(c.titulo), { id: c.id, file: c.file, titulo: c.titulo })

  // fichas do arquivo: duplicadas no arquivo são erro; novas ganham id agora
  const fichasArq: Array<{ f: ArquivoLivro['fichas'][number]; existente?: Ficha; id: string }> = []
  const vistosF = new Set<string>()
  for (const f of dados.fichas) {
    const k = N(f.nome)
    if (vistosF.has(k)) {
      erros.push({ linha: f.linha, texto: `fichas › “${f.nome}”: aparece duas vezes no arquivo (nomes são comparados sem acento e sem maiúsculas).` })
      continue
    }
    vistosF.add(k)
    const existente = fichasPorNome.get(k)
    const id = existente?.id ?? newId('ficha')
    if (!existente) refFicha.set(k, id)
    fichasArq.push({ f, existente, id })
  }

  // capítulos do arquivo: idem; nome do arquivo previsto como em appendChapters
  const capsArq: Array<{ c: ArquivoLivro['capitulos'][number]; existente?: CapEstado; id: string; file: string }> = []
  const vistosC = new Set<string>()
  const ultimo = estado.capitulos.map((c) => c.file).sort().at(-1)
  let proximo = ultimo ? Number(ultimo.slice(0, 3)) + 1 : 1
  for (const c of dados.capitulos) {
    const k = N(c.titulo)
    if (vistosC.has(k)) {
      erros.push({ linha: c.linha, texto: `capitulos › “${c.titulo}”: aparece duas vezes no arquivo.` })
      continue
    }
    vistosC.add(k)
    const existente = capsPorTitulo.get(k)
    if (existente) {
      capsArq.push({ c, existente, id: existente.id, file: existente.file })
      continue
    }
    if (proximo > 999) {
      erros.push({ linha: c.linha, texto: `capitulos › “${c.titulo}”: o livro chegaria a mais de 999 itens.` })
      continue
    }
    const id = novoIdCapitulo()
    const file = `${String(proximo).padStart(3, '0')}-${slugify(c.titulo)}.md`
    proximo++
    refCap.set(k, { id, file, titulo: c.titulo })
    capsArq.push({ c, id, file })
  }

  const fichaRef = (nome: string, linha: number | undefined, onde: string): string | undefined => {
    const id = refFicha.get(N(nome))
    if (!id) aviso(linha, `${onde}: não há ficha chamada “${nome}” (nem no livro nem no arquivo); campo ignorado.`)
    return id
  }
  const capRef = (titulo: string, linha: number | undefined, onde: string): { id: string; file: string } | undefined => {
    const c = refCap.get(N(titulo))
    if (!c) aviso(linha, `${onde}: não há capítulo “${titulo}” (nem no livro nem no arquivo); campo ignorado.`)
    return c
  }

  // ---------- fichas
  for (const { f, existente, id } of fichasArq) {
    const onde = `fichas › “${f.nome}”`
    const base: Ficha = existente
      ? structuredClone(existente)
      : { id, tipo: 'personagem', nome: f.nome, apelidos: [], papel: '', grupo: '', campos: [], relacoes: [], notas: '', retrato: '', criadoEm: agora, atualizadoEm: agora }
    const m: string[] = []
    if (f.tipo && f.tipo !== base.tipo) {
      base.tipo = f.tipo
      m.push(`tipo: ${f.tipo}`)
    }
    if (f.apelidos && !igualLista(f.apelidos, base.apelidos)) {
      base.apelidos = f.apelidos
      m.push('apelidos')
    }
    for (const k of ['papel', 'grupo', 'notas'] as const) {
      const v = f[k]
      if (v !== undefined && v !== base[k]) {
        base[k] = v
        m.push(k === 'notas' ? 'notas' : `${k}: ${curto(v)}`)
      }
    }
    for (const c of f.campos) {
      let campo = base.campos.find((x) => N(x.nome) === N(c.nome))
      if (!campo) {
        campo = { nome: c.nome, valor: '' }
        base.campos.push(campo)
        if (c.valor === undefined && !c.muda) m.push(`campo ${c.nome}`)
      }
      if (c.valor !== undefined && c.valor !== campo.valor) {
        m.push(`${campo.nome}: ${campo.valor ? `${curto(campo.valor, 20)} → ` : ''}${curto(c.valor, 20)}`)
        campo.valor = c.valor
      }
      if (c.muda) {
        const hist: FichaMudanca[] = []
        for (const mu of c.muda) {
          const cap = capRef(mu.aPartirDe, mu.linha, `${onde} › ${campo.nome} › a_partir_de`)
          if (cap) hist.push({ valor: mu.valor, desde: cap.id })
        }
        const antes = campo.historico ?? []
        if (JSON.stringify(antes) !== JSON.stringify(hist) && (hist.length || antes.length)) {
          if (hist.length) campo.historico = hist
          else delete campo.historico
          m.push(`${campo.nome}: mudanças por capítulo`)
        }
      }
    }
    for (const r of f.relacoes) {
      const alvoId = fichaRef(r.com, r.linha, `${onde} › relação com`)
      if (!alvoId) continue
      if (alvoId === base.id) {
        aviso(r.linha, `${onde}: relação com a própria ficha ignorada.`)
        continue
      }
      const ex = base.relacoes.find((x) => x.alvo === alvoId)
      if (!ex) {
        base.relacoes.push({ alvo: alvoId, rotulo: r.rotulo })
        m.push(`relação: ${r.rotulo || '—'} ${r.com}`)
      } else if (r.rotulo && ex.rotulo !== r.rotulo) {
        ex.rotulo = r.rotulo
        m.push(`relação: ${r.rotulo} ${r.com}`)
      }
    }
    if (!existente) {
      criar.push({ secao: 'ficha', nome: `${f.nome} (${base.tipo})` })
      alvo.fichas.push(base)
    } else if (m.length) {
      base.atualizadoEm = agora
      atualizar.push({ secao: 'ficha', nome: base.nome, mudancas: m })
      alvo.fichas.push(base)
    }
  }

  // ---------- capítulos e partes
  let novos = 0
  for (const { c, existente, id, file } of capsArq) {
    const onde = `capitulos › “${c.titulo}”`
    const pov = c.pov ? fichaRef(c.pov, c.linha, `${onde} › pov`) : undefined
    const cenario = c.cenario ? fichaRef(c.cenario, c.linha, `${onde} › cenario`) : undefined
    const cenaNova: CenaMeta = {
      ...(c.sinopse !== undefined ? { sinopse: c.sinopse } : {}),
      ...(pov ? { pov } : {}),
      ...(cenario ? { cenario } : {}),
      ...(c.notas !== undefined ? { notas: c.notas } : {})
    }
    if (!existente) {
      const kind = c.tipo ?? 'capitulo'
      alvo.novosCaps.push({
        id,
        file,
        title: c.titulo,
        kind,
        body: c.texto ? `${c.texto}\n` : '',
        ...(Object.keys(cenaNova).length ? { cena: cenaNova } : {}),
        ...(c.epigrafe ? { epigrafe: c.epigrafe } : {})
      })
      criar.push({ secao: kind === 'parte' ? 'parte' : 'capitulo', nome: `${c.titulo}${kind !== 'capitulo' && kind !== 'parte' ? ` (${kind === 'prologo' ? 'prólogo' : 'epílogo'})` : ''}` })
      novos++
      continue
    }
    const m: string[] = []
    const patch: CapAtualizar['patch'] = {}
    if (c.tipo && c.tipo !== existente.kind) {
      patch.tipo = c.tipo
      m.push(`tipo: ${c.tipo}`)
    }
    const cena: CenaMeta = { ...existente.cena }
    let mudouCena = false
    for (const k of ['sinopse', 'pov', 'cenario', 'notas'] as const) {
      const v = cenaNova[k]
      if (v !== undefined && v !== cena[k]) {
        cena[k] = v
        mudouCena = true
        m.push(k)
      }
    }
    if (mudouCena) patch.cena = cena
    if (c.epigrafe && (c.epigrafe.texto !== existente.epigrafe?.texto || (c.epigrafe.autor ?? '') !== (existente.epigrafe?.autor ?? ''))) {
      patch.epigrafe = c.epigrafe
      m.push('epígrafe')
    }
    let body: string | undefined
    if (c.texto !== undefined && c.texto.trim() !== existente.body.trim()) {
      if (c.substituir) {
        body = `${c.texto}\n`
        m.push('texto (substituído)')
      } else {
        aviso(c.linha, `${onde}: o capítulo já existe e tem texto próprio; o “texto:” do arquivo foi ignorado (use “substituir_texto: true” para trocar).`)
      }
    }
    if (m.length) {
      alvo.capsAtualizar.push({ file, titulo: existente.titulo, patch, ...(body !== undefined ? { body } : {}) })
      atualizar.push({ secao: existente.kind === 'parte' || c.tipo === 'parte' ? 'parte' : 'capitulo', nome: existente.titulo, mudancas: m })
    }
  }
  if (dados.capitulos.length) {
    if (novos === 0) notas.push('Todos os capítulos do arquivo já existem no livro: a ordem do livro não muda.')
    else if (estado.capitulos.length) notas.push(`${novos} ${novos === 1 ? 'item novo entra' : 'itens novos entram'} no fim do livro, na ordem do arquivo. Os capítulos que já existem ficam onde estão.`)
    if (capsArq.some((x) => x.existente && x.c.texto !== undefined && !x.c.substituir)) {
      notas.push('O texto de capítulos que já existem só é trocado com “substituir_texto: true”.')
    }
  }

  // ---------- cartões
  const board: EnredoBoard = structuredClone(estado.board)
  const assets = new Set(estado.assets ?? [])
  let mudouBoard = false
  const fundo = board.cartoes.reduce((max, c) => Math.max(max, c.y + ALT_CARTAO), 0)
  const y0 = board.cartoes.length ? fundo + 80 : 60
  let posNovo = 0
  const ordemNoCap = (file: string): number => board.cartoes.filter((x) => x.capitulo === file).length
  const vistosK = new Set<string>()
  const refCartao = new Map<string, string>()
  for (const c of board.cartoes) if (!refCartao.has(N(c.titulo))) refCartao.set(N(c.titulo), c.id)
  for (const c of dados.cartoes) {
    const k = N(c.titulo)
    const onde = `cartoes › “${c.titulo}”`
    if (vistosK.has(k)) {
      erros.push({ linha: c.linha, texto: `${onde}: aparece duas vezes no arquivo.` })
      continue
    }
    vistosK.add(k)
    const existente = cartoesPorTitulo.get(k)
    const base: Cartao = existente
      ? (board.cartoes.find((x) => x.id === existente.id) as Cartao)
      : {
          id: newId('cartao'),
          tipo: c.tipo ?? 'ideia',
          titulo: c.titulo,
          texto: '',
          fichas: [],
          x: 60 + (posNovo % COLUNAS) * LARG_CARTAO,
          y: y0 + Math.floor(posNovo / COLUNAS) * ALT_CARTAO,
          origem: 'autor',
          estado: 'canonico',
          criadoEm: agora
        }
    const m: string[] = []
    if (c.tipo && c.tipo !== base.tipo) {
      base.tipo = c.tipo
      m.push(`tipo: ${c.tipo}`)
    }
    if (c.texto !== undefined && c.texto !== base.texto) {
      base.texto = c.texto
      m.push('texto')
    }
    if (c.capitulo) {
      const cap = capRef(c.capitulo, c.linha, `${onde} › capitulo`)
      if (cap && cap.file !== base.capitulo) {
        base.ordem = ordemNoCap(cap.file)
        base.capitulo = cap.file
        m.push(`capítulo: ${c.capitulo}`)
      }
    }
    if (c.fichas) {
      const ids = c.fichas.map((n) => fichaRef(n, c.linha, `${onde} › fichas`)).filter((x): x is string => !!x)
      if (!igualLista([...new Set(ids)], base.fichas)) {
        base.fichas = [...new Set(ids)]
        m.push('fichas')
      }
    }
    const fato = base.tipo === 'fato'
    if (!fato && (c.perspectiva || c.revelarEm || c.termos)) {
      aviso(c.linha, `${onde}: perspectiva, revelar_em e termos só valem em cartão de tipo “fato”; ignorados.`)
    }
    if (fato) {
      if (c.perspectiva) {
        let p: Cartao['perspectiva'] | undefined
        if ('verdade' in c.perspectiva) p = { tipo: 'verdade' }
        else {
          const fid = fichaRef(c.perspectiva.crencaDe, c.linha, `${onde} › perspectiva › crenca_de`)
          if (fid) p = { tipo: 'crenca', fichaId: fid }
        }
        if (p && JSON.stringify(p) !== JSON.stringify(base.perspectiva ?? { tipo: 'verdade' })) {
          base.perspectiva = p
          m.push(p.tipo === 'verdade' ? 'perspectiva: verdade' : 'perspectiva: crença')
        }
      }
      if (c.revelarEm) {
        const cap = capRef(c.revelarEm, c.linha, `${onde} › revelar_em`)
        if (cap && cap.id !== base.revelarEm) {
          base.revelarEm = cap.id
          m.push(`revelar em: ${c.revelarEm}`)
        }
      }
      if (c.termos && !igualLista(c.termos, base.termos ?? [])) {
        base.termos = c.termos
        m.push('termos')
      }
    }
    if (c.fio) {
      const fio = { ...(base.fio ?? { status: 'aberto' as const }) }
      if (c.fio.status) fio.status = c.fio.status
      if (c.fio.resolveEm) {
        const cap = capRef(c.fio.resolveEm, c.linha, `${onde} › fio › resolve_em`)
        if (cap) fio.resolveEm = cap.id
      }
      if (JSON.stringify(fio) !== JSON.stringify(base.fio)) {
        base.fio = fio
        m.push('fio solto')
      }
    }
    if (c.imagem) {
      if (!assets.has(c.imagem)) aviso(c.linha, `${onde}: a imagem “${c.imagem}” não está na pasta assets/ do livro; ignorada.`)
      else if (c.imagem !== base.imagem) {
        base.imagem = c.imagem
        m.push(`imagem: ${c.imagem}`)
      }
    }
    if (!existente) {
      if (base.capitulo === undefined) delete base.ordem
      board.cartoes.push(base)
      refCartao.set(k, base.id)
      posNovo++
      mudouBoard = true
      criar.push({ secao: 'cartao', nome: `${c.titulo} (${base.tipo})` })
    } else if (m.length) {
      mudouBoard = true
      atualizar.push({ secao: 'cartao', nome: base.titulo, mudancas: m })
    }
  }

  // ---------- ligações
  for (const l of dados.ligacoes) {
    const onde = `ligacoes › “${l.de}” → “${l.para}”`
    const de = refCartao.get(N(l.de))
    const para = refCartao.get(N(l.para))
    if (!de) aviso(l.linha, `${onde}: não há cartão “${l.de}”; ligação ignorada.`)
    if (!para) aviso(l.linha, `${onde}: não há cartão “${l.para}”; ligação ignorada.`)
    if (!de || !para) continue
    if (de === para) {
      aviso(l.linha, `${onde}: um cartão não pode ligar a si mesmo; ignorada.`)
      continue
    }
    const ex = board.ligacoes.find((x) => x.de === de && x.para === para)
    if (!ex) {
      const nova: Ligacao = { id: newId('lig'), de, para, rotulo: l.rotulo ?? '', tipo: l.tipo ?? 'relacao' }
      board.ligacoes.push(nova)
      mudouBoard = true
      criar.push({ secao: 'ligacao', nome: `${l.de} → ${l.para}` })
      continue
    }
    const m: string[] = []
    if (l.tipo && l.tipo !== ex.tipo) {
      ex.tipo = l.tipo
      m.push(`tipo: ${l.tipo}`)
    }
    if (l.rotulo !== undefined && l.rotulo !== ex.rotulo) {
      ex.rotulo = l.rotulo
      m.push(`rótulo: ${l.rotulo}`)
    }
    if (m.length) {
      mudouBoard = true
      atualizar.push({ secao: 'ligacao', nome: `${l.de} → ${l.para}`, mudancas: m })
    }
  }
  if (mudouBoard) alvo.board = board

  // ---------- manter
  const temDecisao = (tipo: string, valor: string): boolean => estado.decisoes.some((d) => d.tipo === tipo && !d.capitulo && d.valor === valor)
  for (const p of dados.manter.palavras) {
    if (temDecisao('manter-palavra', p)) continue
    alvo.decisoes.push({ tipo: 'manter-palavra', valor: p, rotulo: `palavra: ${p}` })
    criar.push({ secao: 'manter', nome: `manter a palavra “${p}”` })
  }
  for (const t of dados.manter.trechos) {
    if (temDecisao('manter-trecho', t)) continue
    alvo.decisoes.push({ tipo: 'manter-trecho', valor: t, rotulo: `trecho: ${t.slice(0, 60)}` })
    criar.push({ secao: 'manter', nome: `manter o trecho “${curto(t, 60)}”` })
  }

  if (!alvoVazio(alvo)) notas.push('Antes de gravar, o Darkpages guarda uma versão do manuscrito (Versões › “Antes de importar regras e dados”). Nada é apagado.')
  return { previa: { criar, atualizar, avisos, erros, notas }, alvo }
}

/** Lê o texto e planeja sobre o estado dado. Erros de leitura entram na prévia. */
export function planejarTexto(estado: EstadoLivro, yaml: string): Plano & { dados: ArquivoLivro | null } {
  const lido = lerArquivo(yaml)
  if (!lido.dados) {
    return { dados: null, previa: { criar: [], atualizar: [], avisos: lido.avisos, erros: lido.erros, notas: [] }, alvo: { decisoes: [], fichas: [], novosCaps: [], capsAtualizar: [] } }
  }
  const plano = planejar(estado, lido.dados)
  const porLinha = (a: MsgPrevia, b: MsgPrevia): number => (a.linha ?? 0) - (b.linha ?? 0)
  plano.previa.avisos = [...lido.avisos, ...plano.previa.avisos].sort(porLinha)
  plano.previa.erros = [...lido.erros, ...plano.previa.erros].sort(porLinha)
  return { ...plano, dados: lido.dados }
}

// ---------------------------------------------------------------- aplicar

/** Grava o alvo. Faz uma versão de segurança do manuscrito antes. */
export async function aplicarAlvo(dir: string, alvo: Alvo): Promise<void> {
  if (alvoVazio(alvo)) return
  await snapshotAgora(dir, 'antes de importar regras')
  if (alvo.meta) await saveMeta(dir, alvo.meta.title, alvo.meta.author)

  // capítulos novos (com id já planejado: as referências do arquivo apontam para ele)
  const arquivos = new Map<string, string>()
  if (alvo.novosCaps.length) {
    const criados = await appendChapters(
      dir,
      alvo.novosCaps.map((c) => ({ title: c.title, kind: c.kind, body: c.body, id: c.id, ...(c.cena ? { cena: c.cena } : {}), ...(c.epigrafe ? { epigrafe: c.epigrafe } : {}) }))
    )
    alvo.novosCaps.forEach((c, i) => {
      const real = criados[i]
      if (real && real !== c.file) arquivos.set(c.file, real)
    })
  }
  for (const c of alvo.capsAtualizar) {
    if (Object.keys(c.patch).length) await updateChapterMeta(dir, c.file, c.patch)
    if (c.body !== undefined) await saveChapter(dir, c.file, c.titulo, c.body)
  }
  for (const f of alvo.fichas) await putDoc(dir, 'universo', f.id, f)
  if (alvo.board) {
    const board = {
      ...alvo.board,
      cartoes: alvo.board.cartoes.map((c) => (c.capitulo && arquivos.has(c.capitulo) ? { ...c, capitulo: arquivos.get(c.capitulo) } : c))
    }
    const antes = sanearBoard(await getDoc<EnredoBoard>(dir, 'enredo', 'board'))
    const novo = sanearBoard(board)
    await putDoc(dir, 'enredo', 'board', novo)
    for (const nome of imagensOrfas(antes, novo)) await deleteAsset(dir, nome).catch(() => undefined)
  }
  if (alvo.perfil) await salvarPerfil(dir, alvo.perfil)
  for (const d of alvo.decisoes) await adicionarDecisao(dir, d)
  if (alvo.metas) {
    const atual: Record<string, unknown> = (await getDoc<Record<string, unknown>>(dir, 'escrita', 'metas').catch(() => null)) ?? {}
    const { id: _id, ...resto } = atual
    await putDoc(dir, 'escrita', 'metas', { ...resto, ...alvo.metas })
  }
  if (alvo.layout) {
    const p = await openProject(dir)
    await saveLayout(dir, { ...p.meta.layout, ...pick(alvo.layout) })
  }
}

/** Só as chaves de layout que a importação mexe (o resto fica como está no disco). */
function pick(l: LayoutSettings): Partial<LayoutSettings> {
  return {
    ...(l.rotulo ? { rotulo: l.rotulo } : {}),
    ...(l.rotuloParte ? { rotuloParte: l.rotuloParte } : {}),
    ...(l.reiniciarNumeracao !== undefined ? { reiniciarNumeracao: l.reiniciarNumeracao } : {}),
    ...(l.front ? { front: l.front } : {}),
    ...(l.cover ? { cover: l.cover } : {})
  }
}

/** Planeja e aplica no livro. Com erro na prévia, não grava nada e lança. */
export async function importarNoLivro(dir: string, yaml: string): Promise<{ previa: PreviaImport; project: Project }> {
  const plano = planejarTexto(await lerEstado(dir), yaml)
  if (plano.previa.erros.length) {
    const e = plano.previa.erros[0]
    throw new Error(`O arquivo tem ${plano.previa.erros.length} ${plano.previa.erros.length === 1 ? 'erro' : 'erros'}; nada foi gravado. ${e?.linha ? `Linha ${e.linha}: ` : ''}${e?.texto ?? ''}`)
  }
  await aplicarAlvo(dir, plano.alvo)
  return { previa: plano.previa, project: await openProject(dir) }
}

/**
 * Livro recém-criado por createProject: tira o capítulo de exemplo
 * ("Capítulo um", sem texto do autor) quando o arquivo traz capítulos.
 */
export async function tirarCapituloDeExemplo(dir: string): Promise<void> {
  const p = await openProject(dir)
  const [so] = p.chapters
  if (p.chapters.length !== 1 || !so) return
  const c = await readChapter(dir, so.file)
  if (c.body.trim() === 'Comece a escrever aqui.' || !c.body.trim()) await rm(join(dir, 'manuscrito', so.file), { force: true })
}

// ---------------------------------------------------------------- exportar

/** O livro no formato folio-livro v1 (mesma forma que a importação lê). */
export function exportarYaml(estado: EstadoLivro, opcoes: OpcoesExport = {}): string {
  const fichaNome = new Map(estado.fichas.map((f) => [f.id, f.nome]))
  const capPorId = new Map(estado.capitulos.map((c) => [c.id, c.titulo]))
  const capPorFile = new Map(estado.capitulos.map((c) => [c.file, c.titulo]))
  const cartaoTitulo = new Map(estado.board.cartoes.map((c) => [c.id, c.titulo]))
  const lay = estado.layout
  const front: FrontMatter = { ...(DEFAULT_LAYOUT.front as FrontMatter), ...(lay.front ?? {}) }
  const cover: CoverSettings = { ...(DEFAULT_LAYOUT.cover as CoverSettings), ...(lay.cover ?? {}) }
  const so = <T extends object>(o: T): Partial<T> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>

  const rot = (r: RotuloCfg): Record<string, string> => ({ estilo: r.estilo, palavra: r.palavra, genero: r.genero, caixa: r.caixa, ...(r.estilo === 'modelo' ? { modelo: r.modelo } : {}) })

  const doc: Record<string, unknown> = {
    formato: FORMATO_LIVRO,
    versao: VERSAO_LIVRO,
    livro: so({
      titulo: estado.title,
      autor: estado.author,
      subtitulo: front.subtitulo,
      meta_palavras: estado.metas.metaLivro,
      meta_capitulo: estado.metas.metaCapitulo
    }),
    perfil: {
      narrador_nao_confiavel: estado.perfil.narradorNaoConfiavel,
      ambiguidade_deliberada: estado.perfil.ambiguidadeDeliberada,
      nao_linear: estado.perfil.naoLinear,
      ...(estado.perfil.notasIa.trim() ? { notas_ia: estado.perfil.notasIa } : {})
    },
    nomes: {
      capitulos: rot(resolveRotulo(lay)),
      partes: rot(resolveRotuloParte(lay)),
      reiniciar_numeracao_por_parte: lay.reiniciarNumeracao === true
    }
  }

  if (estado.fichas.length) {
    // ordem estável e legível: por tipo (personagens, lugares…) e nome
    const ordenadas = [...estado.fichas].sort((a, b) => TIPOS_FICHA.indexOf(a.tipo) - TIPOS_FICHA.indexOf(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'))
    doc.fichas = ordenadas.map((f) => {
      const campos: Record<string, unknown> = {}
      for (const c of f.campos) {
        const muda = (c.historico ?? [])
          .filter((h) => capPorId.has(h.desde))
          .map((h) => ({ a_partir_de: capPorId.get(h.desde), valor: h.valor }))
        campos[c.nome] = muda.length ? { ...(c.valor ? { valor: c.valor } : {}), muda } : c.valor
      }
      return so({
        nome: f.nome,
        tipo: f.tipo,
        apelidos: f.apelidos,
        papel: f.papel,
        grupo: f.grupo,
        notas: f.notas,
        campos: Object.keys(campos).length ? campos : undefined,
        relacoes: f.relacoes.filter((r) => fichaNome.has(r.alvo)).map((r) => so({ com: fichaNome.get(r.alvo), rotulo: r.rotulo }))
      })
    })
  }

  if (estado.capitulos.length) {
    doc.capitulos = estado.capitulos.map((c) =>
      so({
        titulo: c.titulo,
        tipo: c.kind === 'capitulo' ? undefined : c.kind,
        sinopse: c.cena.sinopse,
        pov: c.cena.pov ? fichaNome.get(c.cena.pov) : undefined,
        cenario: c.cena.cenario ? fichaNome.get(c.cena.cenario) : undefined,
        notas: c.cena.notas,
        epigrafe: c.epigrafe ? so({ texto: c.epigrafe.texto, autor: c.epigrafe.autor }) : undefined,
        texto: opcoes.comTexto && c.body.trim() ? c.body.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '') : undefined
      })
    )
  }

  // só o plano do autor (canônico); cartões ordenados pelo roteiro de cada capítulo
  const pos = new Map(estado.capitulos.map((c, i) => [c.file, i]))
  const cartoes = estado.board.cartoes
    .filter((c) => c.estado === 'canonico')
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const pa = a.c.capitulo !== undefined ? (pos.get(a.c.capitulo) ?? 1e6) : 1e7
      const pb = b.c.capitulo !== undefined ? (pos.get(b.c.capitulo) ?? 1e6) : 1e7
      if (pa !== pb) return pa - pb
      if (pa < 1e7) return (a.c.ordem ?? 1e6) - (b.c.ordem ?? 1e6) || a.i - b.i
      return a.i - b.i
    })
    .map(({ c }) => c)
  const exportados = new Set(cartoes.map((c) => c.id))
  if (cartoes.length) {
    doc.cartoes = cartoes.map((c) => {
      const fato = c.tipo === 'fato'
      const persp = !fato ? undefined : c.perspectiva?.tipo === 'crenca' && fichaNome.has(c.perspectiva.fichaId) ? { crenca_de: fichaNome.get(c.perspectiva.fichaId) } : 'verdade'
      return so({
        titulo: c.titulo,
        tipo: c.tipo,
        capitulo: c.capitulo ? capPorFile.get(c.capitulo) : undefined,
        fichas: c.fichas.filter((id) => fichaNome.has(id)).map((id) => fichaNome.get(id) as string),
        imagem: c.imagem,
        texto: c.texto,
        perspectiva: persp,
        revelar_em: fato && c.revelarEm ? capPorId.get(c.revelarEm) : undefined,
        termos: fato ? c.termos : undefined,
        fio: c.fio ? so({ status: c.fio.status, resolve_em: c.fio.resolveEm ? capPorId.get(c.fio.resolveEm) : undefined }) : undefined
      })
    })
  }
  const ligacoes = estado.board.ligacoes.filter((l) => exportados.has(l.de) && exportados.has(l.para))
  if (ligacoes.length) {
    doc.ligacoes = ligacoes.map((l) => so({ de: cartaoTitulo.get(l.de), para: cartaoTitulo.get(l.para), tipo: l.tipo, rotulo: l.rotulo }))
  }

  const livroTodo = estado.decisoes.filter((d) => !d.capitulo)
  const palavras = livroTodo.filter((d) => d.tipo === 'manter-palavra').map((d) => d.valor)
  const trechos = livroTodo.filter((d) => d.tipo === 'manter-trecho').map((d) => d.valor)
  if (palavras.length || trechos.length) doc.manter = so({ palavras, trechos })

  const paginas = so({
    dedicatoria: front.dedicatoria ? front.dedicatoriaTexto : undefined,
    epigrafe: front.epigrafe && front.epigrafeTexto.trim() ? so({ texto: front.epigrafeTexto, autor: front.epigrafeAutor }) : undefined,
    editora: front.editora,
    cidade: front.cidade,
    ano: front.ano,
    isbn: front.isbn,
    agradecimentos: front.agradecimentos ? front.agradecimentosTexto : undefined,
    sobre_o_autor: front.sobreAutor ? front.sobreAutorTexto : undefined,
    posfacio: front.posfacio ? front.posfacioTexto : undefined,
    sinopse_contracapa: cover.sinopse
  })
  if (Object.keys(paginas).length) doc.paginas = paginas

  const repetidos = (nomes: string[]): string[] => {
    const vistos = new Set<string>()
    const rep = new Set<string>()
    for (const n of nomes) (vistos.has(N(n)) ? rep : vistos).add(N(n))
    return [...rep]
  }
  const rep = [...repetidos(estado.fichas.map((f) => f.nome)), ...repetidos(estado.capitulos.map((c) => c.titulo)), ...repetidos(cartoes.map((c) => c.titulo))]
  const cabecalho = [
    `# Darkpages — ${estado.title} (formato ${FORMATO_LIVRO}, versão ${VERSAO_LIVRO})`,
    `# Exportado em ${new Date().toLocaleString('pt-BR')}. Edite e importe de novo: o que existe é atualizado`,
    '# (casando por nome/título), o que falta é criado, nada é apagado. Ver docs/IMPORTAR.md.',
    opcoes.comTexto ? '# Inclui o texto dos capítulos: só entra em capítulos novos (ou com substituir_texto: true).' : '# Sem o texto dos capítulos.',
    '# Cartões provisórios ou descartados (sugestões da IA) não são exportados.',
    ...(rep.length ? [`# ATENÇÃO: nomes repetidos no livro (${rep.slice(0, 5).join(', ')}): as referências usam o primeiro.`] : [])
  ]
  const yaml = new YAML.Document(doc)
  // listas curtas de textos em uma linha, como no modelo: apelidos: [Vik, o Condenado]
  YAML.visit(yaml, {
    Seq(_, node) {
      const textos = node.items.map((i) => (YAML.isScalar(i) && typeof i.value === 'string' && !i.value.includes('\n') ? i.value : null))
      if (textos.every((t) => t !== null) && textos.reduce((n: number, t) => n + (t?.length ?? 0) + 2, 0) <= 70) {
        node.flow = true
      }
    }
  })
  return `${cabecalho.join('\n')}\n\n${yaml.toString({ lineWidth: 0 })}`
}
