import YAML, { LineCounter, type Document } from 'yaml'
import type { CartaoTipo, FichaTipo, PerfilObra } from '../../shared/models'
import type { ChapterKind } from '../../shared/types'
import type { CaixaRotulo, EstiloRotulo, Genero, RotuloCfg } from '../../shared/rotulo'
import { FORMATO_LIVRO, MAX_IMPORTACAO, VERSAO_LIVRO, type MsgPrevia } from '../../shared/importar'

/**
 * Leitura e validação do arquivo "folio-livro" (docs/modelo-livro.yaml).
 * Puro: não toca no disco. Devolve os dados normalizados + avisos e erros com
 * a linha do arquivo. Item com erro (tipo inválido, campo obrigatório
 * faltando, valor do tipo errado) sai da lista; o resto segue para a prévia.
 *
 * Convenção do formato: valor vazio ("" ou chave sem valor) é IGNORADO —
 * importar nunca apaga o que já existe no livro.
 */

export const TIPOS_FICHA: FichaTipo[] = ['personagem', 'lugar', 'objeto', 'grupo', 'divindade']
export const TIPOS_CAP: ChapterKind[] = ['capitulo', 'prologo', 'epilogo', 'parte']
export const TIPOS_CARTAO: CartaoTipo[] = ['cena', 'virada', 'personagem', 'ideia', 'local', 'fato']
export const TIPOS_LIGACAO = ['causa', 'relacao'] as const
export const ESTILOS: EstiloRotulo[] = [
  'classico-extenso',
  'classico-numero',
  'ordinal-palavra',
  'romano',
  'romano-palavra',
  'numero',
  'modelo',
  'nenhum'
]
const GENEROS: Genero[] = ['m', 'f']
const CAIXAS: CaixaRotulo[] = ['normal', 'maiusculas', 'versalete']
const STATUS_FIO = ['aberto', 'resolvido'] as const

export interface MudancaIn {
  aPartirDe: string
  valor: string
  linha?: number
}
export interface CampoIn {
  nome: string
  valor?: string
  muda?: MudancaIn[]
}
export interface RelacaoIn {
  com: string
  rotulo: string
  linha?: number
}
export interface FichaIn {
  linha?: number
  nome: string
  tipo?: FichaTipo
  apelidos?: string[]
  papel?: string
  grupo?: string
  notas?: string
  campos: CampoIn[]
  relacoes: RelacaoIn[]
}
export interface CapIn {
  linha?: number
  titulo: string
  tipo?: ChapterKind
  sinopse?: string
  pov?: string
  cenario?: string
  notas?: string
  epigrafe?: { texto: string; autor?: string }
  texto?: string
  substituir: boolean
}
export type PerspectivaIn = { verdade: true } | { crencaDe: string }
export interface CartaoIn {
  linha?: number
  titulo: string
  tipo?: CartaoTipo
  texto?: string
  capitulo?: string
  fichas?: string[]
  perspectiva?: PerspectivaIn
  revelarEm?: string
  termos?: string[]
  fio?: { status?: 'aberto' | 'resolvido'; resolveEm?: string }
}
export interface LigacaoIn {
  linha?: number
  de: string
  para: string
  tipo?: 'causa' | 'relacao'
  rotulo?: string
}
export interface PaginasIn {
  dedicatoria?: string
  epigrafe?: { texto: string; autor?: string }
  editora?: string
  cidade?: string
  ano?: string
  isbn?: string
  agradecimentos?: string
  sobreOAutor?: string
  posfacio?: string
  sinopseContracapa?: string
}
export interface ArquivoLivro {
  livro: { titulo?: string; autor?: string; subtitulo?: string; metaPalavras?: number; metaCapitulo?: number }
  perfil: Partial<PerfilObra>
  nomes: { capitulos?: Partial<RotuloCfg>; partes?: Partial<RotuloCfg>; reiniciar?: boolean }
  fichas: FichaIn[]
  capitulos: CapIn[]
  cartoes: CartaoIn[]
  ligacoes: LigacaoIn[]
  manter: { palavras: string[]; trechos: string[] }
  paginas: PaginasIn
}

export interface Leitura {
  /** null quando o arquivo nem chegou a ser lido (sintaxe, formato, tamanho) */
  dados: ArquivoLivro | null
  avisos: MsgPrevia[]
  erros: MsgPrevia[]
}

type Caminho = Array<string | number>
type Obj = Record<string, unknown>

/** Contexto da leitura: documento YAML (para achar a linha de cada nó) e as mensagens. */
class Ctx {
  avisos: MsgPrevia[] = []
  erros: MsgPrevia[] = []
  constructor(
    private doc: Document,
    private lc: LineCounter
  ) {}

  linha(c: Caminho): number | undefined {
    const n = this.doc.getIn(c, true) as { range?: [number, number, number] } | undefined
    const off = n && typeof n === 'object' && Array.isArray(n.range) ? n.range[0] : undefined
    return off === undefined ? undefined : this.lc.linePos(off).line
  }
  aviso(c: Caminho, texto: string): void {
    this.avisos.push({ linha: this.linha(c), texto })
  }
  erro(c: Caminho, texto: string): void {
    this.erros.push({ linha: this.linha(c), texto })
  }
}

const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Leitor de um mapa do arquivo: valida chaves e tipos; `falhou` marca o item como inválido. */
class Mapa {
  falhou = false
  constructor(
    private ctx: Ctx,
    readonly cam: Caminho,
    readonly o: Obj,
    /** como o item aparece nas mensagens: 'fichas › “Viktor”' */
    readonly onde: string
  ) {}

  chaves(permitidas: string[]): void {
    for (const k of Object.keys(this.o)) {
      if (!permitidas.includes(k)) this.ctx.aviso([...this.cam, k], `${this.onde}: chave “${k}” desconhecida, ignorada (aceitas: ${permitidas.join(', ')}).`)
    }
  }

  private erro(k: string, texto: string): undefined {
    this.falhou = true
    this.ctx.erro([...this.cam, k], `${this.onde}: ${texto}`)
    return undefined
  }

  tem(k: string): boolean {
    const v = this.o[k]
    return v !== undefined && v !== null && v !== ''
  }

  /** Texto (número e sim/não viram texto). Vazio → undefined (ignorado). */
  texto(k: string, max = 20_000, multilinha = false): string | undefined {
    const v = this.o[k]
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return this.erro(k, `“${k}” deve ser um texto.`)
    let s = String(v)
    s = multilinha ? s.replace(/\r/g, '').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '') : s.trim()
    if (!s.trim()) return undefined
    if (s.length > max) return this.erro(k, `“${k}” passa do limite de ${max} caracteres.`)
    return s
  }

  obrigatorio(k: string, max = 300): string | undefined {
    const s = this.texto(k, max)
    if (s === undefined && !this.falhou) return this.erro(k, `falta “${k}”.`)
    return s
  }

  opcao<T extends string>(k: string, opcoes: readonly T[]): T | undefined {
    const s = this.texto(k, 60)
    if (s === undefined) return undefined
    const v = s.toLowerCase() as T
    if (!opcoes.includes(v)) return this.erro(k, `${k} “${s}” não existe (use ${opcoes.join(' | ')}).`)
    return v
  }

  booleano(k: string): boolean | undefined {
    const v = this.o[k]
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v !== 'boolean') return this.erro(k, `“${k}” deve ser true ou false.`)
    return v
  }

  inteiro(k: string): number | undefined {
    const v = this.o[k]
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100_000_000) return this.erro(k, `“${k}” deve ser um número inteiro (ex.: 90000).`)
    return v
  }

  /** Lista de textos; um texto sozinho vira lista de um. Vazios saem. */
  lista(k: string, maxItens = 200, maxCada = 300): string[] | undefined {
    const v = this.o[k]
    if (v === undefined || v === null || v === '') return undefined
    const arr = Array.isArray(v) ? v : [v]
    const out: string[] = []
    for (const x of arr) {
      if (x === null || x === undefined) continue
      if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') return this.erro(k, `“${k}” deve ser uma lista de textos, ex.: [A, B].`)
      const s = String(x).trim()
      if (s.length > maxCada) return this.erro(k, `um item de “${k}” passa de ${maxCada} caracteres.`)
      if (s && !out.includes(s)) out.push(s)
    }
    if (out.length > maxItens) return this.erro(k, `“${k}” tem itens demais (máx. ${maxItens}).`)
    return out
  }

  /** Submapa; erro se existir e não for mapa. */
  mapa(k: string, onde: string): Mapa | undefined {
    const v = this.o[k]
    if (v === undefined || v === null || v === '') return undefined
    if (!ehObj(v)) return this.erro(k, `“${k}” deve ser um bloco de chaves (ex.: { texto: …, autor: … }).`)
    const m = new Mapa(this.ctx, [...this.cam, k], v, onde)
    return m
  }

  /** Repassa a falha de um submapa para este item. */
  junta(m: Mapa | undefined): void {
    if (m?.falhou) this.falhou = true
  }
}

/** Seção de lista do arquivo: cada item precisa ser um mapa. */
function itens(ctx: Ctx, raiz: Obj, secao: string, base: Caminho = []): Array<{ cam: Caminho; o: Obj; i: number }> {
  const v = raiz[secao]
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) {
    ctx.erro([...base, secao], `“${secao}” deve ser uma lista (cada item começa com “- ”).`)
    return []
  }
  const out: Array<{ cam: Caminho; o: Obj; i: number }> = []
  v.forEach((o, i) => {
    if (ehObj(o)) out.push({ cam: [...base, secao, i], o, i })
    else ctx.erro([...base, secao, i], `${secao}: o item ${i + 1} deve ser um bloco de chaves (nome: …, tipo: …).`)
  })
  return out
}

function lerEpigrafe(m: Mapa, k: string, onde: string): { texto: string; autor?: string } | undefined {
  const e = m.mapa(k, `${onde} › ${k}`)
  if (!e) return undefined
  e.chaves(['texto', 'autor'])
  const texto = e.texto('texto', 2000, true)
  const autor = e.texto('autor', 200)
  m.junta(e)
  return texto ? { texto, ...(autor ? { autor } : {}) } : undefined
}

function lerFicha(ctx: Ctx, cam: Caminho, o: Obj, i: number): FichaIn | null {
  const nomeBruto = typeof o.nome === 'string' ? o.nome.trim() : ''
  const m = new Mapa(ctx, cam, o, nomeBruto ? `fichas › “${nomeBruto}”` : `fichas › item ${i + 1}`)
  m.chaves(['nome', 'tipo', 'apelidos', 'papel', 'grupo', 'notas', 'campos', 'relacoes'])
  const nome = m.obrigatorio('nome', 200)
  const f: FichaIn = {
    linha: ctx.linha(cam),
    nome: nome ?? '',
    tipo: m.opcao('tipo', TIPOS_FICHA),
    apelidos: m.lista('apelidos', 50, 100),
    papel: m.texto('papel', 300),
    grupo: m.texto('grupo', 200),
    notas: m.texto('notas', 20_000, true),
    campos: [],
    relacoes: []
  }
  const campos = m.mapa('campos', `${m.onde} › campos`)
  if (campos) {
    for (const [k, v] of Object.entries(campos.o)) {
      const nomeCampo = k.trim().slice(0, 100)
      if (!nomeCampo) continue
      // campo sem valor: só garante que o campo exista na ficha (nunca apaga um valor)
      if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) {
        f.campos.push({ nome: nomeCampo })
        continue
      }
      if (ehObj(v)) {
        const c = new Mapa(ctx, [...campos.cam, k], v, `${m.onde} › campo “${nomeCampo}”`)
        c.chaves(['valor', 'muda'])
        const campo: CampoIn = { nome: nomeCampo, valor: c.texto('valor', 2000) }
        const muda = v.muda
        if (muda !== undefined && muda !== null) {
          if (!Array.isArray(muda)) {
            c.falhou = true
            ctx.erro([...c.cam, 'muda'], `${c.onde}: “muda” deve ser uma lista de { a_partir_de: …, valor: … }.`)
          } else {
            campo.muda = []
            muda.forEach((x, j) => {
              const mc: Caminho = [...c.cam, 'muda', j]
              if (!ehObj(x)) {
                c.falhou = true
                ctx.erro(mc, `${c.onde}: cada mudança deve ser { a_partir_de: capítulo, valor: … }.`)
                return
              }
              const mm = new Mapa(ctx, mc, x, `${c.onde} › mudança ${j + 1}`)
              mm.chaves(['a_partir_de', 'valor'])
              const ap = mm.obrigatorio('a_partir_de', 300)
              const val = mm.obrigatorio('valor', 2000)
              c.junta(mm)
              if (ap && val) campo.muda?.push({ aPartirDe: ap, valor: val, linha: ctx.linha(mc) })
            })
          }
        }
        m.junta(c)
        f.campos.push(campo)
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        f.campos.push({ nome: nomeCampo, valor: String(v).trim().slice(0, 2000) })
      } else {
        m.falhou = true
        ctx.erro([...campos.cam, k], `${m.onde}: o campo “${nomeCampo}” deve ser um valor ou { valor: …, muda: [...] }.`)
      }
    }
  }
  m.junta(campos)
  for (const r of itens(ctx, o, 'relacoes', cam)) {
    const rm = new Mapa(ctx, r.cam, r.o, `${m.onde} › relação ${r.i + 1}`)
    rm.chaves(['com', 'rotulo'])
    const com = rm.obrigatorio('com', 200)
    const rotulo = rm.texto('rotulo', 120) ?? ''
    m.junta(rm)
    if (com) f.relacoes.push({ com, rotulo, linha: ctx.linha(r.cam) })
  }
  return m.falhou ? null : f
}

function lerCapitulo(ctx: Ctx, cam: Caminho, o: Obj, i: number): CapIn | null {
  const t = typeof o.titulo === 'string' ? o.titulo.trim() : ''
  const m = new Mapa(ctx, cam, o, t ? `capitulos › “${t}”` : `capitulos › item ${i + 1}`)
  m.chaves(['titulo', 'tipo', 'sinopse', 'pov', 'cenario', 'notas', 'epigrafe', 'texto', 'substituir_texto'])
  const titulo = m.obrigatorio('titulo', 300)
  const c: CapIn = {
    linha: ctx.linha(cam),
    titulo: titulo ?? '',
    tipo: m.opcao('tipo', TIPOS_CAP),
    sinopse: m.texto('sinopse', 5000, true),
    pov: m.texto('pov', 200),
    cenario: m.texto('cenario', 200),
    notas: m.texto('notas', 5000, true),
    epigrafe: lerEpigrafe(m, 'epigrafe', m.onde),
    texto: m.texto('texto', MAX_IMPORTACAO, true),
    substituir: m.booleano('substituir_texto') === true
  }
  return m.falhou ? null : c
}

function lerCartao(ctx: Ctx, cam: Caminho, o: Obj, i: number): CartaoIn | null {
  const t = typeof o.titulo === 'string' ? o.titulo.trim() : ''
  const m = new Mapa(ctx, cam, o, t ? `cartoes › “${t}”` : `cartoes › item ${i + 1}`)
  m.chaves(['titulo', 'tipo', 'texto', 'capitulo', 'fichas', 'perspectiva', 'revelar_em', 'termos', 'fio'])
  const titulo = m.obrigatorio('titulo', 300)
  const c: CartaoIn = {
    linha: ctx.linha(cam),
    titulo: titulo ?? '',
    tipo: m.opcao('tipo', TIPOS_CARTAO),
    texto: m.texto('texto', 20_000, true),
    capitulo: m.texto('capitulo', 300),
    fichas: m.lista('fichas', 100, 200),
    revelarEm: m.texto('revelar_em', 300),
    termos: m.lista('termos', 30, 80)
  }
  const p = o.perspectiva
  if (p !== undefined && p !== null && p !== '') {
    if (typeof p === 'string' && p.trim().toLowerCase() === 'verdade') c.perspectiva = { verdade: true }
    else if (ehObj(p)) {
      const pm = new Mapa(ctx, [...cam, 'perspectiva'], p, `${m.onde} › perspectiva`)
      pm.chaves(['crenca_de'])
      const de = pm.obrigatorio('crenca_de', 200)
      m.junta(pm)
      if (de) c.perspectiva = { crencaDe: de }
    } else {
      m.falhou = true
      ctx.erro([...cam, 'perspectiva'], `${m.onde}: perspectiva deve ser “verdade” ou { crenca_de: nome da ficha }.`)
    }
  }
  const fio = m.mapa('fio', `${m.onde} › fio`)
  if (fio) {
    fio.chaves(['status', 'resolve_em'])
    c.fio = { status: fio.opcao('status', STATUS_FIO), resolveEm: fio.texto('resolve_em', 300) }
    m.junta(fio)
  }
  return m.falhou ? null : c
}

function lerLigacao(ctx: Ctx, cam: Caminho, o: Obj, i: number): LigacaoIn | null {
  const m = new Mapa(ctx, cam, o, `ligacoes › item ${i + 1}`)
  m.chaves(['de', 'para', 'tipo', 'rotulo'])
  const de = m.obrigatorio('de', 300)
  const para = m.obrigatorio('para', 300)
  const l: LigacaoIn = { linha: ctx.linha(cam), de: de ?? '', para: para ?? '', tipo: m.opcao('tipo', TIPOS_LIGACAO), rotulo: m.texto('rotulo', 120) }
  return m.falhou ? null : l
}

function lerRotulo(m: Mapa | undefined): Partial<RotuloCfg> | undefined {
  if (!m) return undefined
  m.chaves(['estilo', 'palavra', 'genero', 'caixa', 'modelo'])
  const out: Partial<RotuloCfg> = {}
  const estilo = m.opcao('estilo', ESTILOS)
  if (estilo) out.estilo = estilo
  const palavra = m.texto('palavra', 60)
  if (palavra) out.palavra = palavra
  const genero = m.opcao('genero', GENEROS)
  if (genero) out.genero = genero
  const caixa = m.opcao('caixa', CAIXAS)
  if (caixa) out.caixa = caixa
  const modelo = m.texto('modelo', 120)
  if (modelo) out.modelo = modelo
  return m.falhou ? undefined : out
}

const SECOES = ['formato', 'versao', 'livro', 'perfil', 'nomes', 'fichas', 'capitulos', 'cartoes', 'ligacoes', 'manter', 'paginas']

/** Lê e valida o texto do arquivo. Nunca lança: problemas viram `erros`. */
export function lerArquivo(texto: string): Leitura {
  if (texto.length > MAX_IMPORTACAO) {
    return { dados: null, avisos: [], erros: [{ texto: `Arquivo grande demais (máx. ${Math.round(MAX_IMPORTACAO / 1024 / 1024)} MB).` }] }
  }
  const lc = new LineCounter()
  const doc = YAML.parseDocument(texto, { lineCounter: lc, uniqueKeys: true, prettyErrors: true })
  if (doc.errors.length) {
    return {
      dados: null,
      avisos: [],
      erros: doc.errors.slice(0, 20).map((e) => ({
        linha: e.linePos?.[0]?.line,
        texto: `Erro de escrita no YAML: ${(e.message.split('\n')[0] ?? '').replace(/ at line \d+, column \d+:?$/, '')}. Confira o recuo (espaços) e os dois-pontos.`
      }))
    }
  }
  const ctx = new Ctx(doc, lc)
  for (const w of doc.warnings) ctx.avisos.push({ linha: w.linePos?.[0]?.line, texto: w.message.split('\n')[0] ?? '' })
  const raiz = doc.toJS({ maxAliasCount: 100 }) as unknown
  if (raiz === null || raiz === undefined) return { dados: null, avisos: [], erros: [{ texto: 'O arquivo está vazio.' }] }
  if (!ehObj(raiz)) return { dados: null, avisos: [], erros: [{ linha: 1, texto: 'O arquivo deve começar com chaves como “formato: folio-livro”, “livro:”, “fichas:”.' }] }

  const topo = new Mapa(ctx, [], raiz, 'arquivo')
  topo.chaves(SECOES)
  if (raiz.formato === undefined) ctx.avisos.push({ linha: 1, texto: `Sem “formato: ${FORMATO_LIVRO}” no início; lido como ${FORMATO_LIVRO} versão ${VERSAO_LIVRO}.` })
  else if (raiz.formato !== FORMATO_LIVRO) {
    ctx.erro(['formato'], `formato “${String(raiz.formato)}” não é reconhecido (esperado: ${FORMATO_LIVRO}).`)
    return { dados: null, avisos: ctx.avisos, erros: ctx.erros }
  }
  if (raiz.versao !== undefined && raiz.versao !== VERSAO_LIVRO) {
    ctx.erro(['versao'], `versão ${String(raiz.versao)} não é suportada por este Folio (só a versão ${VERSAO_LIVRO}).`)
    return { dados: null, avisos: ctx.avisos, erros: ctx.erros }
  }

  const dados: ArquivoLivro = {
    livro: {},
    perfil: {},
    nomes: {},
    fichas: [],
    capitulos: [],
    cartoes: [],
    ligacoes: [],
    manter: { palavras: [], trechos: [] },
    paginas: {}
  }

  const livro = topo.mapa('livro', 'livro')
  if (livro) {
    livro.chaves(['titulo', 'autor', 'subtitulo', 'meta_palavras', 'meta_capitulo'])
    dados.livro = {
      titulo: livro.texto('titulo', 200),
      autor: livro.texto('autor', 200),
      subtitulo: livro.texto('subtitulo', 300),
      metaPalavras: livro.inteiro('meta_palavras'),
      metaCapitulo: livro.inteiro('meta_capitulo')
    }
    if (livro.falhou) dados.livro = {}
  }

  const perfil = topo.mapa('perfil', 'perfil')
  if (perfil) {
    perfil.chaves(['narrador_nao_confiavel', 'ambiguidade_deliberada', 'nao_linear', 'notas_ia'])
    const p: Partial<PerfilObra> = {}
    const a = perfil.booleano('narrador_nao_confiavel')
    const b = perfil.booleano('ambiguidade_deliberada')
    const c = perfil.booleano('nao_linear')
    const n = perfil.texto('notas_ia', 2000, true)
    if (a !== undefined) p.narradorNaoConfiavel = a
    if (b !== undefined) p.ambiguidadeDeliberada = b
    if (c !== undefined) p.naoLinear = c
    if (n !== undefined) p.notasIa = n
    if (!perfil.falhou) dados.perfil = p
  }

  const nomes = topo.mapa('nomes', 'nomes')
  if (nomes) {
    nomes.chaves(['capitulos', 'partes', 'reiniciar_numeracao_por_parte'])
    const caps = lerRotulo(nomes.mapa('capitulos', 'nomes › capitulos'))
    const partes = lerRotulo(nomes.mapa('partes', 'nomes › partes'))
    const r = nomes.booleano('reiniciar_numeracao_por_parte')
    dados.nomes = { ...(caps ? { capitulos: caps } : {}), ...(partes ? { partes } : {}), ...(r !== undefined ? { reiniciar: r } : {}) }
  }

  for (const { cam, o, i } of itens(ctx, raiz, 'fichas')) {
    const f = lerFicha(ctx, cam, o, i)
    if (f) dados.fichas.push(f)
  }
  for (const { cam, o, i } of itens(ctx, raiz, 'capitulos')) {
    const c = lerCapitulo(ctx, cam, o, i)
    if (c) dados.capitulos.push(c)
  }
  for (const { cam, o, i } of itens(ctx, raiz, 'cartoes')) {
    const c = lerCartao(ctx, cam, o, i)
    if (c) dados.cartoes.push(c)
  }
  for (const { cam, o, i } of itens(ctx, raiz, 'ligacoes')) {
    const l = lerLigacao(ctx, cam, o, i)
    if (l) dados.ligacoes.push(l)
  }

  const manter = topo.mapa('manter', 'manter')
  if (manter) {
    manter.chaves(['palavras', 'trechos'])
    dados.manter = { palavras: manter.lista('palavras', 500, 100) ?? [], trechos: manter.lista('trechos', 500, 2000) ?? [] }
  }

  const pag = topo.mapa('paginas', 'paginas')
  if (pag) {
    pag.chaves(['dedicatoria', 'epigrafe', 'editora', 'cidade', 'ano', 'isbn', 'agradecimentos', 'sobre_o_autor', 'posfacio', 'sinopse_contracapa'])
    const p: PaginasIn = {
      dedicatoria: pag.texto('dedicatoria', 2000, true),
      epigrafe: lerEpigrafe(pag, 'epigrafe', 'paginas'),
      editora: pag.texto('editora', 200),
      cidade: pag.texto('cidade', 200),
      ano: pag.texto('ano', 20),
      isbn: pag.texto('isbn', 40),
      agradecimentos: pag.texto('agradecimentos', 20_000, true),
      sobreOAutor: pag.texto('sobre_o_autor', 20_000, true),
      posfacio: pag.texto('posfacio', 50_000, true),
      sinopseContracapa: pag.texto('sinopse_contracapa', 5000, true)
    }
    if (!pag.falhou) dados.paginas = p
  }

  return { dados, avisos: ctx.avisos, erros: ctx.erros }
}
