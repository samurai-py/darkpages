import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SinonimosResult } from '../../shared/models'
import { radical, semAcentoMin } from '../../shared/stemmer-pt'

/**
 * Sinônimos sem IA: dicionário de sinônimos pt-BR do LibreOffice no formato
 * MyThes (th_pt_BR.dat + th_pt_BR.idx), baixado por `npm run fetch:tesauro`
 * para resources/thesaurus/ (fora do git; licenças junto dos arquivos).
 *
 * Formato do .dat (thes_data_layout): linha 1 = codificação; depois blocos
 *   entrada|n
 *   (classe)rótulo|sinônimo1|sinônimo2|...      ← n linhas, uma por sentido
 * O .idx tem: codificação, nº de entradas e "entrada|deslocamento_em_bytes".
 * Sem .idx, o índice é montado varrendo o .dat (mesmo resultado).
 *
 * Tudo é carregado sob demanda na primeira consulta e fica em memória
 * (o .dat inteiro como Buffer, ~15 MB; o índice como Map).
 */

export const DIR_TESAURO = 'thesaurus'
export const DAT = 'th_pt_BR.dat'
export const IDX = 'th_pt_BR.idx'
export const DICA_TESAURO = 'Para sinônimos sem IA, rode “npm run fetch:tesauro” (baixa o dicionário de sinônimos do LibreOffice).'

export interface Sentido {
  /** classe como veio do arquivo (ex.: "adj", "Sinônimo") */
  classe: string
  /** primeira palavra do sentido (o "rótulo") */
  titulo: string
  palavras: string[]
}

export interface Verbete {
  entrada: string
  sentidos: Sentido[]
}

type Decod = 'utf8' | 'latin1'

function decodificador(cabecalho: string): Decod {
  return /utf-?8/i.test(cabecalho) ? 'utf8' : 'latin1'
}

/** Índice "entrada → deslocamento" a partir do texto de um .idx do MyThes. */
export function lerIndice(texto: string): Map<string, number> {
  const out = new Map<string, number>()
  const linhas = texto.split('\n')
  for (const l of linhas.slice(2)) {
    const b = l.lastIndexOf('|')
    if (b <= 0) continue
    const off = Number(l.slice(b + 1))
    if (Number.isFinite(off) && !out.has(l.slice(0, b))) out.set(l.slice(0, b), off)
  }
  return out
}

/** Índice montado varrendo o .dat (sem .idx). */
export function indiceDoDat(dat: Buffer): Map<string, number> {
  const out = new Map<string, number>()
  const nl = dat.indexOf(0x0a)
  if (nl < 0) return out
  const dec = decodificador(dat.subarray(0, nl).toString('latin1'))
  let i = nl + 1
  while (i < dat.length) {
    let fim = dat.indexOf(0x0a, i)
    if (fim < 0) fim = dat.length
    const linha = dat.subarray(i, fim).toString(dec).replace(/\r$/, '')
    const b = linha.lastIndexOf('|')
    const n = b > 0 ? Number(linha.slice(b + 1)) : NaN
    if (!linha.startsWith('(') && Number.isInteger(n) && n >= 0) {
      if (!out.has(linha.slice(0, b))) out.set(linha.slice(0, b), i)
      let j = fim + 1
      for (let k = 0; k < n && j < dat.length; k++) {
        const f = dat.indexOf(0x0a, j)
        j = f < 0 ? dat.length : f + 1
      }
      i = j
      continue
    }
    i = fim + 1
  }
  return out
}

const limpa = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Lê o verbete que começa no deslocamento `off` do .dat. */
export function lerVerbete(dat: Buffer, off: number, dec: Decod): Verbete | null {
  const linha = (i: number): [string, number] => {
    let f = dat.indexOf(0x0a, i)
    if (f < 0) f = dat.length
    return [dat.subarray(i, f).toString(dec).replace(/\r$/, ''), f + 1]
  }
  const [cab, prox] = linha(off)
  const b = cab.lastIndexOf('|')
  const n = b > 0 ? Number(cab.slice(b + 1)) : NaN
  if (!Number.isInteger(n) || n < 0) return null
  const entrada = cab.slice(0, b)
  const sentidos: Sentido[] = []
  let i = prox
  for (let k = 0; k < n && i < dat.length; k++) {
    const [l, p] = linha(i)
    i = p
    const partes = l.split('|')
    const primeiro = partes.shift() ?? ''
    // "(adj)" ou "(Sinônimo)rótulo": a classe fica entre parênteses
    const m = primeiro.match(/^\(([^)]*)\)\s*(.*)$/)
    const classe = limpa(m?.[1] ?? '')
    const palavras = partes.map(limpa).filter(Boolean)
    const titulo = palavras[0] ?? limpa(m?.[2] ?? '')
    if (!palavras.length && !titulo) continue
    sentidos.push({ classe, titulo, palavras: palavras.length ? palavras : [titulo] })
  }
  return { entrada, sentidos }
}

const CLASSES: Array<[RegExp, string]> = [
  [/^(adj|adjetivo)\.?$/i, 'adjetivo'],
  [/^(s|subst|substantivo|n|noun)\.?$/i, 'substantivo'],
  [/^(v|verbo|verb)\.?$/i, 'verbo'],
  [/^(adv|adv[ée]rbio)\.?$/i, 'advérbio'],
  [/^(interj|interjei[çc][ãa]o)\.?$/i, 'interjeição'],
  [/^(prep|preposi[çc][ãa]o)\.?$/i, 'preposição']
]

/** Classe gramatical legível; "Sinônimo" e afins (o pt-BR do LibreOffice não marca classe) viram "". */
export function nomeClasse(c: string): string {
  const t = c.trim()
  for (const [re, nome] of CLASSES) if (re.test(t)) return nome
  return ''
}

/** Prefixo comum (para escolher a entrada mais parecida com a palavra). */
function prefixo(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

// terminações nominais e verbais comuns → formas básicas a tentar (verbo no infinitivo, masculino singular)
const FLEXOES: Array<[string, string[]]> = [
  // nominais primeiro: "belas" é "belo" antes de ser um verbo "belar"
  ['ões', ['ão']],
  ['ães', ['ão']],
  ['ãos', ['ão']],
  ['ais', ['al']],
  ['éis', ['el']],
  ['óis', ['ol']],
  ['ns', ['m']],
  ['res', ['r']],
  ['zes', ['z']],
  ['as', ['o', 'a']],
  ['os', ['o']],
  ['es', ['e', '']],
  ['s', ['']],
  ['a', ['o']],
  ...['ávamos', 'áramos', 'aremos', 'aríamos', 'assem', 'ássemos', 'avam', 'aram', 'ando', 'ados', 'adas', 'asse', 'ava', 'ado', 'ada', 'ará', 'aria', 'amos', 'ou', 'ei', 'em', 'am', 'as', 'a', 'o', 'e'].map(
    (t): [string, string[]] => [t, ['ar']]
  ),
  ...['íamos', 'êramos', 'eremos', 'eríamos', 'essem', 'êssemos', 'iam', 'eram', 'endo', 'idos', 'idas', 'esse', 'ia', 'ido', 'ida', 'erá', 'eria', 'emos', 'eu', 'es', 'e'].map(
    (t): [string, string[]] => [t, ['er', 'ir']]
  ),
  ...['íramos', 'iremos', 'iríamos', 'issem', 'íssemos', 'iram', 'indo', 'isse', 'irá', 'iria', 'imos', 'iu', 'is'].map((t): [string, string[]] => [t, ['ir']])
]

/** Formas básicas prováveis de uma palavra flexionada ("olhou" → "olhar", "belas" → "belo"). */
export function formasBasicas(p: string): string[] {
  const out: string[] = []
  for (const [t, subs] of FLEXOES) {
    if (!p.endsWith(t) || p.length - t.length < 2) continue
    for (const s of subs) {
      const f = p.slice(0, -t.length) + s
      if (f !== p && !out.includes(f)) out.push(f)
    }
  }
  return out
}

export class Tesauro {
  private readonly dec: Decod
  private porSemAcento: Map<string, string[]> | null = null
  private porRadical: Map<string, string[]> | null = null

  constructor(
    private readonly dat: Buffer,
    private readonly indice: Map<string, number>
  ) {
    const nl = dat.indexOf(0x0a)
    this.dec = decodificador(dat.subarray(0, nl < 0 ? dat.length : nl).toString('latin1'))
  }

  static deBuffers(dat: Buffer, idx?: string): Tesauro {
    const i = idx ? lerIndice(idx) : indiceDoDat(dat)
    return new Tesauro(dat, i.size ? i : indiceDoDat(dat))
  }

  get entradas(): number {
    return this.indice.size
  }

  verbete(entrada: string): Verbete | null {
    const off = this.indice.get(entrada)
    return off === undefined ? null : lerVerbete(this.dat, off, this.dec)
  }

  private mapas(): { semAcento: Map<string, string[]>; radicais: Map<string, string[]> } {
    if (!this.porSemAcento || !this.porRadical) {
      const sa = new Map<string, string[]>()
      const ra = new Map<string, string[]>()
      for (const e of this.indice.keys()) {
        const k = semAcentoMin(e)
        sa.set(k, [...(sa.get(k) ?? []), e])
        if (/\s/.test(e)) continue
        const r = radical(e)
        ra.set(r, [...(ra.get(r) ?? []), e])
      }
      this.porSemAcento = sa
      this.porRadical = ra
    }
    return { semAcento: this.porSemAcento, radicais: this.porRadical }
  }

  /**
   * Procura a palavra: igual (minúscula) → sem acento → forma básica provável
   * ("olhou" → "olhar") → mesma família pelo radical ("correu" → "correr").
   * `lema` diz qual entrada achou.
   */
  buscar(palavra: string): { lema: string; verbete: Verbete; exato: boolean } | null {
    const p = palavra.trim().toLowerCase()
    if (!p) return null
    const direto = this.verbete(p)
    if (direto) return { lema: p, verbete: direto, exato: true }
    const { semAcento, radicais } = this.mapas()
    const porAcento = semAcento.get(semAcentoMin(p))?.[0]
    if (porAcento) {
      const v = this.verbete(porAcento)
      if (v) return { lema: porAcento, verbete: v, exato: true }
    }
    for (const f of formasBasicas(p)) {
      const v = this.verbete(f)
      if (v) return { lema: f, verbete: v, exato: false }
    }
    const candidatos = radicais.get(radical(p)) ?? []
    const melhor = [...candidatos].sort((a, b) => prefixo(b, p) - prefixo(a, p) || a.length - b.length || (a < b ? -1 : 1))[0]
    if (!melhor) return null
    const v = this.verbete(melhor)
    return v ? { lema: melhor, verbete: v, exato: false } : null
  }
}

/**
 * Converte um verbete no resultado do popup: sinônimos ordenados pelo número
 * de sentidos em que aparecem (o rótulo de cada sentido conta mais), sem a
 * própria palavra; os sentidos vão separados para o autor escolher.
 */
export function resultadoDoVerbete(palavra: string, achado: { lema: string; verbete: Verbete; exato: boolean }, max = 12): SinonimosResult {
  const fora = new Set([semAcentoMin(palavra), semAcentoMin(achado.lema)])
  const pontos = new Map<string, { n: number; ordem: number; forma: string }>()
  let ordem = 0
  for (const s of achado.verbete.sentidos) {
    s.palavras.forEach((w, i) => {
      const k = semAcentoMin(w)
      if (fora.has(k)) return
      const e = pontos.get(k) ?? { n: 0, ordem: ordem++, forma: w }
      e.n += i === 0 ? 3 : 1
      pontos.set(k, e)
    })
  }
  const sinonimos = [...pontos.values()].sort((a, b) => b.n - a.n || a.ordem - b.ordem).slice(0, max).map((e) => e.forma)
  const sentidos = achado.verbete.sentidos
    .map((s) => ({
      titulo: s.titulo,
      palavras: s.palavras.filter((w, i, a) => !fora.has(semAcentoMin(w)) && a.findIndex((x) => semAcentoMin(x) === semAcentoMin(w)) === i).slice(0, 10)
    }))
    .filter((s) => s.palavras.length > 0)
  const classes = achado.verbete.sentidos.map((s) => nomeClasse(s.classe)).filter(Boolean)
  const classe = classes.sort((a, b) => classes.filter((x) => x === b).length - classes.filter((x) => x === a).length)[0] ?? ''
  return {
    sinonimos,
    fortes: [],
    classe,
    fonte: 'tesauro',
    sentidos,
    ...(achado.exato ? {} : { lema: achado.lema })
  }
}

// ------------------------------------------------------------------ carga

let cache: { dir: string; t: Promise<Tesauro | null> } | null = null

/** Abre o dicionário de `resourcesDir/thesaurus` (uma vez). null se os arquivos não existem. */
export function abrirTesauro(resourcesDir: string): Promise<Tesauro | null> {
  const dir = join(resourcesDir, DIR_TESAURO)
  if (cache?.dir === dir) return cache.t
  const t = (async (): Promise<Tesauro | null> => {
    let dat: Buffer
    try {
      dat = await readFile(join(dir, DAT))
    } catch {
      return null
    }
    const idx = await readFile(join(dir, IDX), 'utf8').catch(() => undefined)
    return Tesauro.deBuffers(dat, idx)
  })()
  cache = { dir, t }
  // arquivo ausente não fica em cache: o autor pode rodar o fetch com o app aberto
  void t.then((x) => {
    if (!x && cache?.t === t) cache = null
  })
  return t
}

// ------------------------------------------------------------------ política

export interface DepsSinonimos {
  tesauro: () => Promise<Tesauro | null>
  /** IA configurada (provedor ligado e com chave) */
  iaConfigurada: () => Promise<boolean>
  /** sinônimos pela IA, com a frase (o comportamento antigo) */
  ia: () => Promise<SinonimosResult>
}

/**
 * Sinônimos: dicionário primeiro (instantâneo, sem rede); a IA só quando o
 * autor pede (`modo: 'ia'`, botão "Sugestões pelo contexto") ou quando não há
 * dicionário / a palavra não está nele. Sem nenhum dos dois, devolve lista
 * vazia com um aviso em vez de erro.
 */
export async function resolverSinonimos(palavra: string, modo: 'auto' | 'ia', deps: DepsSinonimos): Promise<SinonimosResult> {
  const iaOk = await deps.iaConfigurada()
  if (modo === 'ia') {
    if (!iaOk) throw new Error('Configure a IA em Ajustes para sugestões pelo contexto.')
    return { ...(await deps.ia()), fonte: 'ia', iaDisponivel: true }
  }
  const t = await deps.tesauro()
  const achado = t?.buscar(palavra) ?? null
  if (achado) return { ...resultadoDoVerbete(palavra, achado), iaDisponivel: iaOk }
  const aviso = t ? `“${palavra}” não está no dicionário de sinônimos.` : DICA_TESAURO
  if (iaOk) return { ...(await deps.ia()), fonte: 'ia', iaDisponivel: true, aviso }
  return { sinonimos: [], fortes: [], classe: '', fonte: 'tesauro', iaDisponivel: false, aviso }
}
