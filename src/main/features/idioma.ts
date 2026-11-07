import { rm } from 'node:fs/promises'
import { Font, Glyph, Path } from 'opentype.js'
import { bookDir, str, type Handlers } from '../api/context'
import { aiChat, extractJson } from '../ai'
import { assetFilePath, deleteDoc, getAsset, getDoc, listDocs, putAssetBytes, putDoc } from '../store/docs'
import { ASSET_NAMES } from '../../shared/models'
import type {
  Classe,
  Entrada,
  FonteGerada,
  Glifo,
  Lingua,
  Morfologia,
  Ordem,
  PontoGlifo,
  Posicao,
  TraducaoIA
} from '../../renderer/src/features/idioma/model'

/**
 * Idioma próprio por livro (conlang). Coleção "idioma", um documento por língua.
 * A fonte .otf é gerada aqui (opentype.js no Node) e gravada em assets/ como
 * ASSET_NAMES.fonteIdioma(id), para a Diagramação poder usá-la.
 */

const COL = 'idioma'
const CLASSES: readonly Classe[] = ['substantivo', 'verbo', 'adjetivo', 'advérbio', 'pronome', 'conjunção', 'preposição', 'artigo', 'nome', 'outro']
const ORDENS: readonly Ordem[] = ['SVO', 'SOV', 'VSO', 'VOS', 'OVS', 'OSV']
const POSICOES: readonly Posicao[] = ['inicio', 'fim', 'qualquer']
const GRADE = 24

// ---------------------------------------------------------------------------
// validação (nada vindo da interface é confiável)
// ---------------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : [])
const txt = (v: unknown, max: number, padrao = ''): string => (typeof v === 'string' ? v.slice(0, max) : padrao)
const numero = (v: unknown, min: number, max: number, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao

function lista(v: unknown, maxItens: number, maxLen: number): string[] {
  const out: string[] = []
  for (const x of arr(v, maxItens)) {
    const s = txt(x, maxLen).trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function ponto(v: unknown): PontoGlifo | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const x = Math.round(numero(v[0], 0, GRADE, NaN) * 100) / 100
  const y = Math.round(numero(v[1], 0, GRADE, NaN) * 100) / 100
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return v[2] === 1 ? [x, y, 1] : [x, y]
}

function glifo(v: unknown): Glifo {
  const o = obj(v)
  const tracos: PontoGlifo[][] = []
  for (const t of arr(o.tracos, 40)) {
    const pts = arr(t, 80).map(ponto).filter((p): p is PontoGlifo => p !== null)
    if (pts.length) tracos.push(pts)
  }
  return { tracos, espessura: numero(o.espessura, 0.4, 4, 1.6) }
}

function morfologia(v: unknown): Morfologia {
  const o = obj(v)
  return {
    plural: txt(o.plural, 12).trim(),
    passado: txt(o.passado, 12).trim(),
    feminino: txt(o.feminino, 12).trim(),
    ordem: ORDENS.includes(o.ordem as Ordem) ? (o.ordem as Ordem) : 'SVO',
    omitirArtigos: o.omitirArtigos !== false
  }
}

function entrada(v: unknown, i: number): Entrada | null {
  const o = obj(v)
  const pt = txt(o.pt, 120).trim()
  const termo = txt(o.termo, 120).trim()
  if (!pt && !termo) return null
  const id = typeof o.id === 'string' && /^[a-z0-9]{1,40}$/.test(o.id) ? o.id : `e${Date.now().toString(36)}${i.toString(36)}`
  return { id, pt, termo, classe: CLASSES.includes(o.classe as Classe) ? (o.classe as Classe) : 'outro', nota: txt(o.nota, 500) }
}

function sanear(v: unknown, id: string): Lingua {
  const o = obj(v)
  const regras = obj(o.regras)
  const ger = obj(o.gerador)
  const pesos: Record<string, number> = {}
  for (const [k, p] of Object.entries(obj(regras.pesos)).slice(0, 200)) {
    if (k.length <= 6 && typeof p === 'number' && Number.isFinite(p)) pesos[k] = Math.min(10, Math.max(0, p))
  }
  const glifos: Record<string, Glifo> = {}
  for (const [k, g] of Object.entries(obj(o.glifos)).slice(0, 200)) {
    const chave = k.trim().toLowerCase()
    if (chave && [...chave].length <= 4 && !/\s/.test(chave)) glifos[chave] = glifo(g)
  }
  const romanizacao: Record<string, string> = {}
  for (const [k, g] of Object.entries(obj(o.romanizacao)).slice(0, 200)) {
    const s = txt(g, 6).trim()
    if (k.length <= 6 && s) romanizacao[k] = s
  }
  const lexico: Entrada[] = []
  const ids = new Set<string>()
  arr(o.lexico, 20000).forEach((e, i) => {
    const x = entrada(e, i)
    if (!x) return
    if (ids.has(x.id)) x.id = `${x.id.slice(0, 30)}${i.toString(36)}`
    ids.add(x.id)
    lexico.push(x)
  })
  const padrao = txt(o.padraoSilaba, 24).trim()
  const agora = new Date().toISOString()
  const min = Math.round(numero(ger.silabasMin, 1, 6, 1))
  return {
    id,
    nome: txt(o.nome, 80).trim() || 'Sem nome',
    descricao: txt(o.descricao, 4000),
    consoantes: lista(o.consoantes, 80, 4),
    vogais: lista(o.vogais, 40, 4),
    padraoSilaba: /^[\s()CVcv]+$/.test(padrao) && /v/i.test(padrao) ? padrao.toUpperCase() : '(C)V(C)',
    regras: {
      proibicoes: arr(regras.proibicoes, 100)
        .map((p) => obj(p))
        .map((p) => ({ fonema: txt(p.fonema, 4).trim(), posicao: POSICOES.includes(p.posicao as Posicao) ? (p.posicao as Posicao) : 'qualquer' }))
        .filter((p) => p.fonema),
      clusters: lista(regras.clusters, 100, 8),
      pesos
    },
    lexico,
    morfologia: morfologia(o.morfologia),
    glifos,
    romanizacao,
    gerador: {
      semente: Math.round(numero(ger.semente, 0, 4294967295, 1)),
      quantidade: Math.round(numero(ger.quantidade, 1, 60, 12)),
      silabasMin: min,
      silabasMax: Math.max(min, Math.round(numero(ger.silabasMax, 1, 6, 3)))
    },
    criadoEm: txt(o.criadoEm, 40) || agora,
    atualizadoEm: agora
  }
}

function idLingua(v: unknown): string {
  const id = str(v, 60)
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) throw new Error('Id de língua inválido')
  return id
}

/** "Velhári" → "velhari"; casa com o id de documento e com o nome do .otf. */
function slug(nome: string): string {
  const s = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '')
  return s || 'lingua'
}

async function carregar(dir: string, id: string): Promise<Lingua> {
  const l = await getDoc<Lingua>(dir, COL, id)
  if (!l) throw new Error('Língua não encontrada')
  return sanear(l, id)
}

// ---------------------------------------------------------------------------
// fonte .otf: traços → contornos com espessura
// ---------------------------------------------------------------------------

const UPM = 1000
const ESCALA = 40 // unidades de fonte por casa da grade
const LINHA_BASE = 20 // y da grade que fica na linha de base
const RECUO = 60 // espaço lateral de cada glifo
type P = [number, number]

/** Achata um traço (com pontos de controle quadráticos) em polilinha, na grade. */
export function polilinha(t: PontoGlifo[]): P[] {
  const out: P[] = []
  if (!t.length) return out
  out.push([t[0]![0], t[0]![1]])
  for (let i = 1; i < t.length; i++) {
    const p = t[i] as PontoGlifo
    const prox = t[i + 1]
    if (p[2] === 1 && prox && prox[2] !== 1) {
      const a = out[out.length - 1] as P
      for (let s = 1; s <= 12; s++) {
        const u = s / 12
        const k = 1 - u
        out.push([k * k * a[0] + 2 * k * u * p[0] + u * u * prox[0], k * k * a[1] + 2 * k * u * p[1] + u * u * prox[1]])
      }
      i++
    } else out.push([p[0], p[1]])
  }
  return out
}

function area(poly: P[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P
    const b = poly[(i + 1) % poly.length] as P
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/** Segmento com pontas arredondadas (cápsula) ou círculo, já em coordenadas de fonte (y para cima), sentido anti-horário. */
export function capsula(a: P, b: P, r: number, passos = 8): P[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const poly: P[] = []
  if (len < 1e-6) {
    for (let i = 0; i < passos * 2; i++) {
      const t = (i / (passos * 2)) * Math.PI * 2
      poly.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)])
    }
  } else {
    const ang = Math.atan2(dy, dx)
    // meia-volta em b (de -90° a +90° em torno da direção) e em a (de +90° a +270°)
    for (let i = 0; i <= passos; i++) {
      const t = ang - Math.PI / 2 + (i / passos) * Math.PI
      poly.push([b[0] + r * Math.cos(t), b[1] + r * Math.sin(t)])
    }
    for (let i = 0; i <= passos; i++) {
      const t = ang + Math.PI / 2 + (i / passos) * Math.PI
      poly.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)])
    }
  }
  const inteiros = poly.map(([x, y]) => [Math.round(x), Math.round(y)] as P)
  const limpo = inteiros.filter((p, i) => {
    const q = inteiros[(i + inteiros.length - 1) % inteiros.length] as P
    return p[0] !== q[0] || p[1] !== q[1]
  })
  return area(limpo) < 0 ? limpo.reverse() : limpo
}

interface GlifoFonte {
  path: Path
  advanceWidth: number
}

function glifoParaFonte(g: Glifo): GlifoFonte {
  const r = (g.espessura * ESCALA) / 2
  const xs = g.tracos.flat().map((p) => p[0])
  const xmin = xs.length ? Math.min(...xs) : 0
  const xmax = xs.length ? Math.max(...xs) : 10
  const fx = (x: number): number => (x - xmin) * ESCALA + r + RECUO
  const fy = (y: number): number => (LINHA_BASE - y) * ESCALA
  const path = new Path()
  for (const t of g.tracos) {
    const pl = polilinha(t).map(([x, y]) => [fx(x), fy(y)] as P)
    const segs: Array<[P, P]> = pl.length === 1 ? [[pl[0] as P, pl[0] as P]] : pl.slice(1).map((p, i) => [pl[i] as P, p])
    for (const [a, b] of segs) {
      const poly = capsula(a, b, r)
      if (poly.length < 3) continue
      path.moveTo(poly[0]![0], poly[0]![1])
      for (const p of poly.slice(1)) path.lineTo(p[0], p[1])
      path.closePath()
    }
  }
  return { path, advanceWidth: Math.round((xmax - xmin) * ESCALA + 2 * r + 2 * RECUO) }
}

/** Sinais básicos desenhados quando a língua não define os seus. */
const SINAIS: Record<string, PontoGlifo[][]> = {
  '.': [[[12, 20]]],
  ',': [[[12, 19], [10, 23]]],
  '-': [[[7, 13], [17, 13]]],
  ':': [[[12, 11]], [[12, 20]]],
  '!': [[[12, 4], [12, 15]], [[12, 20]]],
  '?': [[[7, 8], [7, 4, 1], [12, 4], [17, 4, 1], [17, 8], [17, 12, 1], [12, 13], [12, 15]], [[12, 20]]]
}

function nomeGlifo(chave: string): string {
  return [...chave]
    .map((c) => (/^[A-Za-z0-9]$/.test(c) ? c : `uni${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`))
    .join('_')
}

interface Ligadura {
  sub: number[]
  by: number
}

interface ComSubstituicao {
  substitution: { addLigature(feature: string, lig: Ligadura): void }
}

export interface FonteMontada {
  font: Font
  ligaduras: string[]
  pua: Record<string, number>
}

/** Monta a fonte: grafemas de 1 caractere vão no cmap (minúscula e maiúscula), dígrafos viram ligadura "liga"; todos ganham ponto na área de uso privado. */
export function montarFonte(l: Pick<Lingua, 'nome' | 'glifos'>): FonteMontada {
  const chaves = Object.keys(l.glifos).filter((k) => l.glifos[k]!.tracos.length)
  if (!chaves.length) throw new Error('Desenhe ao menos um glifo antes de gerar a fonte.')
  const espessura = chaves.reduce((s, k) => s + l.glifos[k]!.espessura, 0) / chaves.length
  const glyphs: Glyph[] = [
    new Glyph({ name: '.notdef', advanceWidth: 600, path: new Path() }),
    new Glyph({ name: 'space', unicode: 32, advanceWidth: 380, path: new Path() })
  ]
  glyphs[1]!.addUnicode(160)
  const indice = new Map<string, number>() // caractere → índice do glifo
  const pua: Record<string, number> = {}
  let proxPua = 0xe000

  const adicionar = (nome: string, g: GlifoFonte, unicodes: number[]): number => {
    // o construtor do opentype.js 1.3.4 ignora `unicodes` (só guarda o primeiro); os demais entram por addUnicode
    const glyph = new Glyph({ name: nome, advanceWidth: g.advanceWidth, path: g.path })
    for (const u of unicodes) glyph.addUnicode(u)
    glyphs.push(glyph)
    return glyphs.length - 1
  }

  const simples = chaves.filter((k) => [...k].length === 1)
  const digrafos = chaves.filter((k) => [...k].length > 1).sort((a, b) => [...b].length - [...a].length)

  for (const k of simples) {
    const cp = k.codePointAt(0) as number
    const up = k.toUpperCase()
    const cps = [cp]
    if (up !== k && [...up].length === 1) cps.push(up.codePointAt(0) as number)
    pua[k] = proxPua
    cps.push(proxPua++)
    indice.set(k, adicionar(nomeGlifo(k), glifoParaFonte(l.glifos[k]!), cps))
  }
  for (const [sinal, tracos] of Object.entries(SINAIS)) {
    if (indice.has(sinal)) continue
    indice.set(sinal, adicionar(nomeGlifo(sinal), glifoParaFonte({ tracos, espessura }), [sinal.codePointAt(0) as number]))
  }
  // componentes de dígrafos sem glifo próprio: glifo vazio só para a ligadura funcionar
  for (const d of digrafos) {
    for (const c of [...d]) {
      if (indice.has(c)) continue
      const cps = [c.codePointAt(0) as number]
      const up = c.toUpperCase()
      if (up !== c && [...up].length === 1) cps.push(up.codePointAt(0) as number)
      indice.set(c, adicionar(nomeGlifo(c), { path: new Path(), advanceWidth: 300 }, cps))
    }
  }
  const ligs: Ligadura[] = []
  for (const d of digrafos) {
    pua[d] = proxPua
    const by = adicionar(nomeGlifo(d), glifoParaFonte(l.glifos[d]!), [proxPua++])
    // maiúsculas apontam para o mesmo glifo da minúscula, então "Th" e "TH" também formam a ligadura
    ligs.push({ sub: [...d].map((c) => indice.get(c) as number), by })
  }

  const familyName =
    l.nome
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9 ]+/g, '')
      .trim()
      .slice(0, 40) || 'Folio Idioma'
  const font = new Font({
    familyName,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: 800,
    descender: -200,
    designer: 'Folio',
    description: `Alfabeto de ${l.nome}`,
    glyphs
  } as ConstructorParameters<typeof Font>[0])
  const sub = (font as unknown as ComSubstituicao).substitution
  for (const lig of ligs) sub.addLigature('liga', lig)
  return { font, ligaduras: digrafos, pua }
}

// ---------------------------------------------------------------------------
// tradução por IA
// ---------------------------------------------------------------------------

function promptIA(l: Lingua, texto: string, rascunho: string): { system: string; user: string } {
  const lex = l.lexico
    .slice(0, 600)
    .map((e) => `${e.pt} = ${e.termo} (${e.classe})`)
    .join('\n')
  const proib = l.regras.proibicoes.map((p) => `“${p.fonema}” proibido ${p.posicao === 'qualquer' ? 'em qualquer posição' : p.posicao === 'inicio' ? 'no início' : 'no fim'}`)
  const system = [
    `Você é linguista e ajuda um autor de fantasia a traduzir português para a língua inventada “${l.nome}”.`,
    'Use o léxico fornecido sempre que houver entrada. Para palavras sem entrada, crie termos novos que respeitem o inventário de sons, o padrão silábico e as proibições, e que soem da mesma família das palavras existentes.',
    'Aplique a morfologia (sufixos de plural, passado e feminino) e a ordem das palavras indicada.',
    'Responda em JSON: {"traducao": string, "glosa": [{"pt": string, "termo": string}], "novas": [{"pt": string, "termo": string, "classe": string}], "nota": string}.',
    `"classe" deve ser uma de: ${CLASSES.join(', ')}. "pt" em "novas" vai no infinitivo (verbos) ou singular masculino. "nota" explica escolhas em uma ou duas frases, em português.`
  ].join('\n')
  const user = [
    `Língua: ${l.nome}`,
    l.descricao ? `Descrição: ${l.descricao}` : '',
    `Consoantes: ${l.consoantes.map((f) => l.romanizacao[f] || f).join(' ')}`,
    `Vogais: ${l.vogais.map((f) => l.romanizacao[f] || f).join(' ')}`,
    `Padrão silábico: ${l.padraoSilaba}`,
    proib.length ? `Regras: ${proib.join('; ')}` : '',
    l.regras.clusters.length ? `Encontros permitidos: ${l.regras.clusters.join(', ')}` : '',
    `Morfologia: plural -${l.morfologia.plural || '∅'}, passado -${l.morfologia.passado || '∅'}, feminino -${l.morfologia.feminino || '∅'}; ordem ${l.morfologia.ordem}; ${l.morfologia.omitirArtigos ? 'sem artigos' : 'com artigos'}.`,
    `Léxico (${l.lexico.length} entradas${l.lexico.length > 600 ? ', primeiras 600' : ''}):`,
    lex || '(vazio)',
    '',
    `Rascunho da tradução por regras: ${rascunho || '(nenhum)'}`,
    `Texto em português: ${texto}`
  ]
    .filter((s) => s !== '')
    .join('\n')
  return { system, user }
}

function sanearIA(v: unknown): TraducaoIA {
  const o = obj(v)
  const traducao = txt(o.traducao, 4000).trim()
  if (!traducao) throw new Error('A IA não devolveu tradução.')
  return {
    traducao,
    glosa: arr(o.glosa, 400)
      .map(obj)
      .map((g) => ({ pt: txt(g.pt, 120).trim(), termo: txt(g.termo, 120).trim() }))
      .filter((g) => g.pt || g.termo),
    novas: arr(o.novas, 200)
      .map(obj)
      .map((n) => ({
        pt: txt(n.pt, 120).trim(),
        termo: txt(n.termo, 120).trim(),
        classe: CLASSES.includes(n.classe as Classe) ? (n.classe as Classe) : 'outro'
      }))
      .filter((n) => n.pt && n.termo),
    nota: txt(o.nota, 1000).trim()
  }
}

// ---------------------------------------------------------------------------
// métodos
// ---------------------------------------------------------------------------

export const handlers: Handlers = {
  /** 'idioma.listar'(dir) → Lingua[] (ordem de criação) */
  'idioma.listar': async (ctx, dir) => {
    const d = await bookDir(ctx, dir)
    const todas = await listDocs<Lingua>(d, COL)
    return todas.map((l) => sanear(l, l.id)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  },

  /** 'idioma.criar'(dir, dados) → Lingua com id derivado do nome (único no livro) */
  'idioma.criar': async (ctx, dir, dados) => {
    const d = await bookDir(ctx, dir)
    const base = sanear(dados, 'x')
    const ids = new Set((await listDocs(d, COL)).map((l) => l.id))
    const raiz = slug(base.nome)
    let id = raiz
    for (let n = 2; ids.has(id); n++) id = `${raiz}-${n}`
    const agora = new Date().toISOString()
    return putDoc(d, COL, id, { ...base, id, criadoEm: agora, atualizadoEm: agora })
  },

  /** 'idioma.salvar'(dir, lingua) → Lingua saneada */
  'idioma.salvar': async (ctx, dir, lingua) => {
    const d = await bookDir(ctx, dir)
    const id = idLingua(obj(lingua).id)
    return putDoc(d, COL, id, sanear(lingua, id))
  },

  /** 'idioma.excluir'(dir, id) → apaga a língua e a fonte gerada */
  'idioma.excluir': async (ctx, dir, id) => {
    const d = await bookDir(ctx, dir)
    const i = idLingua(id)
    await deleteDoc(d, COL, i)
    await rm(assetFilePath(d, ASSET_NAMES.fonteIdioma(i)), { force: true })
  },

  /** 'idioma.gerarFonte'(dir, id) → FonteGerada (grava assets/fonte-<id>.otf) */
  'idioma.gerarFonte': async (ctx, dir, id): Promise<FonteGerada> => {
    const d = await bookDir(ctx, dir)
    const i = idLingua(id)
    const l = await carregar(d, i)
    const { font, ligaduras, pua } = montarFonte(l)
    const bytes = Buffer.from(font.toArrayBuffer())
    const arquivo = await putAssetBytes(d, ASSET_NAMES.fonteIdioma(i), bytes)
    return {
      arquivo,
      dataUrl: `data:font/otf;base64,${bytes.toString('base64')}`,
      glifos: font.glyphs.length,
      bytes: bytes.length,
      ligaduras,
      pua
    }
  },

  /** 'idioma.fonte'(dir, id) → data URL da fonte gerada ou null */
  'idioma.fonte': async (ctx, dir, id) => getAsset(await bookDir(ctx, dir), ASSET_NAMES.fonteIdioma(idLingua(id))),

  /** 'idioma.traduzirIA'(dir, id, texto, rascunho) → TraducaoIA (léxico vai como contexto) */
  'idioma.traduzirIA': async (ctx, dir, id, texto, rascunho): Promise<TraducaoIA> => {
    const d = await bookDir(ctx, dir)
    const l = await carregar(d, idLingua(id))
    const t = str(texto, 4000).trim()
    if (!t) throw new Error('Escreva um texto para traduzir.')
    const { system, user } = promptIA(l, t, txt(rascunho, 4000))
    const resposta = await aiChat(ctx, { system, messages: [{ role: 'user', content: user }], json: true, temperature: 0.5, maxTokens: 2000 })
    return sanearIA(extractJson<unknown>(resposta))
  }
}
