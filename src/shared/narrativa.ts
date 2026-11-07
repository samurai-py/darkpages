/**
 * Narrativa ao longo do livro, por POSIÇÃO do capítulo (nunca pelo número do
 * arquivo): estado temporal das fichas ("mudou a partir de…"), cartões "fato"
 * (verdade, crença, revelação), fios soltos e impacto de uma mudança.
 * Puro, sem node/electron: roda no main e no renderer.
 *
 * Toda referência duradoura a capítulo é o id estável (ChapterInfo.id), então
 * reordenar capítulos não exige reescrever nada aqui.
 */
import type { Cartao, Conflito, EnredoBoard, Ficha, FichaCampo, ImpactoItem } from './models'
import type { ChapterKind } from './types'
import { numerarCapitulos } from './rotulo'

/** Capítulo na ordem do livro (o que as checagens precisam de ChapterInfo). */
export interface CapituloOrdem {
  file: string
  id: string
  kind: ChapterKind
  /** palavras (fios: último capítulo escrito) */
  words?: number
  title?: string
}

// ---------------------------------------------------------------------------
// referência legada `valor@capN` / `valor@ch-<id>` nos campos da ficha
// ---------------------------------------------------------------------------

export type RefCapitulo = { tipo: 'numero'; n: number } | { tipo: 'id'; id: string }

/** "@cap12", "@ 12", "@capítulo 12", "@ch-3f9a…" → referência; null se não há. */
export const REF_CAPITULO = /@\s*(?:(ch-[a-z0-9]{6,32})|(cap(?:[ií]tulo)?\.?\s*)?(\d{1,3}))(?![\p{L}\p{N}])/iu

export function lerRefCapitulo(m: RegExpMatchArray | null): RefCapitulo | null {
  if (!m) return null
  if (m[1]) return { tipo: 'id', id: m[1].toLowerCase() }
  if (m[3]) return { tipo: 'numero', n: Number(m[3]) }
  return null
}

/** Posição (índice na ordem do livro) do capítulo referido, ou -1. */
export function posicaoDaRef(ref: RefCapitulo, caps: Array<{ id: string; kind: ChapterKind }>): number {
  if (ref.tipo === 'id') return caps.findIndex((c) => c.id === ref.id)
  const nums = numerarCapitulos(caps)
  return nums.findIndex((n) => n === ref.n)
}

/** Como a tela chama o capítulo na posição i: "cap. 3", "prólogo", "epílogo". */
export function nomeDaPosicao(i: number, caps: Array<{ kind: ChapterKind }>): string {
  const c = caps[i]
  if (!c) return 'este capítulo'
  if (c.kind === 'prologo') return 'prólogo'
  if (c.kind === 'epilogo') return 'epílogo'
  if (c.kind === 'parte') return 'página de parte'
  return `cap. ${numerarCapitulos(caps)[i]}`
}

/** Posição do capítulo de id estável `id` (-1 se não existe ou vazio). */
export function posicaoDoId(id: string | undefined, caps: Array<{ id: string }>): number {
  return id ? caps.findIndex((c) => c.id === id) : -1
}

/** "morto@cap12" → { valor: 'morto', ref }; null se o valor não termina numa referência. */
export function refLegada(valor: string): { valor: string; ref: RefCapitulo } | null {
  if (!valor.includes('@')) return null
  const m = valor.match(new RegExp(`^([\\s\\S]*?)\\s*(${REF_CAPITULO.source})\\s*$`, 'iu'))
  if (!m) return null
  const ref = lerRefCapitulo((m[2] ?? '').match(REF_CAPITULO))
  return ref ? { valor: (m[1] ?? '').trim(), ref } : null
}

// ---------------------------------------------------------------------------
// estado temporal da ficha
// ---------------------------------------------------------------------------

export interface ValorResolvido {
  valor: string
  /** id do capítulo de onde vem o valor (ausente = valor do início do livro) */
  desde?: string
  /** posição desse capítulo */
  pos?: number
}

/**
 * Valor do campo válido no capítulo da posição `pos`: a última mudança do
 * histórico cujo capítulo vem na posição `pos` ou antes; sem nenhuma, o valor
 * base. Mudança que aponta para capítulo inexistente é ignorada. Valor legado
 * `x@capN` vale como "x a partir do cap. N" (antes dele, fica vazio).
 * `pos` < 0 (posição desconhecida) devolve o valor base.
 */
export function valorNoCapitulo(campo: FichaCampo, pos: number, caps: CapituloOrdem[]): ValorResolvido {
  const base = typeof campo.valor === 'string' ? campo.valor : ''
  if (pos < 0) return { valor: base }
  const hs = (Array.isArray(campo.historico) ? campo.historico : [])
    .map((h, i) => ({ h, i, p: posicaoDoId(h?.desde, caps) }))
    .filter((x) => x.p >= 0 && x.p <= pos && typeof x.h.valor === 'string')
    .sort((a, b) => a.p - b.p || a.i - b.i)
  const ult = hs[hs.length - 1]
  if (ult) return { valor: ult.h.valor, desde: ult.h.desde, pos: ult.p }
  const leg = refLegada(base)
  if (leg) {
    const p = posicaoDaRef(leg.ref, caps)
    if (p >= 0) return p <= pos ? { valor: leg.valor, desde: caps[p]?.id, pos: p } : { valor: '' }
  }
  return { valor: base }
}

/** A ficha como ela é no capítulo da posição `pos` (campos com o valor válido ali, sem histórico). */
export function fichaNoCapitulo(f: Ficha, pos: number, caps: CapituloOrdem[]): Ficha {
  if (!Array.isArray(f.campos)) return f
  return {
    ...f,
    campos: f.campos.filter((c) => c && typeof c.nome === 'string').map((c) => ({ nome: c.nome, valor: valorNoCapitulo(c, pos, caps).valor }))
  }
}

/** Campos com a sintaxe antiga `valor@capN` que dá para converter (a referência existe no livro). */
export function camposLegados(f: Ficha, caps: CapituloOrdem[]): number[] {
  const out: number[] = []
  ;(Array.isArray(f.campos) ? f.campos : []).forEach((c, i) => {
    const leg = c && typeof c.valor === 'string' ? refLegada(c.valor) : null
    if (leg && leg.valor && posicaoDaRef(leg.ref, caps) >= 0) out.push(i)
  })
  return out
}

/**
 * Converte `Status = morto@cap12` em histórico estruturado: o valor base fica
 * vazio (nada dito antes) e "morto" passa a valer desde o capítulo (pelo id
 * estável). Referência que não existe fica como está.
 */
export function converterLegado(f: Ficha, caps: CapituloOrdem[]): { ficha: Ficha; convertidos: number } {
  const idx = new Set(camposLegados(f, caps))
  if (!idx.size) return { ficha: f, convertidos: 0 }
  const campos = f.campos.map((c, i) => {
    if (!idx.has(i)) return c
    const leg = refLegada(c.valor)
    const cap = leg ? caps[posicaoDaRef(leg.ref, caps)] : undefined
    if (!leg || !cap) return c
    return { ...c, valor: '', historico: [...(c.historico ?? []), { valor: leg.valor, desde: cap.id }] }
  })
  return { ficha: { ...f, campos }, convertidos: idx.size }
}

// ---------------------------------------------------------------------------
// busca de termos sem acento e sem caixa, em palavra inteira
// ---------------------------------------------------------------------------

/** Texto minúsculo e sem acento, com o mapa de volta para as posições do original. */
export function normalizarComMapa(texto: string): { norm: string; ini: number[]; fim: number[] } {
  let norm = ''
  const ini: number[] = []
  const fim: number[] = []
  let i = 0
  for (const ch of texto) {
    const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (let k = 0; k < n.length; k++) {
      ini.push(i)
      fim.push(i + ch.length)
    }
    norm += n
    i += ch.length
  }
  return { norm, ini, fim }
}

function normalizarTermo(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ocorrências do termo no texto ([início, fim) no texto original). Ignora acento e caixa; palavra inteira. */
export function acharTermo(texto: string, termo: string, mapa = normalizarComMapa(texto)): Array<{ inicio: number; fim: number }> {
  const t = normalizarTermo(termo)
  if (t.length < 2) return []
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(t).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'gu')
  const out: Array<{ inicio: number; fim: number }> = []
  for (const m of mapa.norm.matchAll(re)) {
    const a = m.index ?? 0
    const b = a + m[0].length - 1
    const inicio = mapa.ini[a]
    const fim = mapa.fim[b]
    if (inicio !== undefined && fim !== undefined) out.push({ inicio, fim })
  }
  return out
}

/** A frase em volta da posição (para citar o trecho). */
export function fraseEm(texto: string, inicio: number, fim: number): string {
  const antes = texto.slice(0, inicio)
  const a = Math.max(antes.search(/[^.!?\n]*$/), inicio - 240)
  const resto = texto.slice(fim)
  const j = resto.search(/[.!?\n]/)
  const b = j < 0 ? Math.min(texto.length, fim + 240) : Math.min(fim + j + 1, fim + 240)
  return texto.slice(Math.max(0, a), b).trim()
}

// ---------------------------------------------------------------------------
// cartões "fato": revelação antecipada
// ---------------------------------------------------------------------------

export function ehFato(c: Cartao): boolean {
  return c?.tipo === 'fato' && c.estado !== 'descartado'
}

export function ehCrenca(c: Cartao): boolean {
  return c.perspectiva?.tipo === 'crenca'
}

export interface ConflitoRevelacao extends Conflito {
  cartaoId: string
  termo: string
  /** posição do termo no texto */
  inicio: number
  fim: number
}

/**
 * Revelação antecipada: algum termo de um cartão "fato" aparece num capítulo
 * que vem ANTES de `revelarEm` na ordem do livro (prólogo e partes contam pela
 * posição). Um aviso por termo por fato (a primeira ocorrência). Descartados
 * ficam de fora; fato sem `revelarEm` ou sem termos não é checado.
 */
export function revelacoesAntecipadas(texto: string, file: string, caps: CapituloOrdem[], cartoes: Cartao[]): ConflitoRevelacao[] {
  const atual = caps.findIndex((c) => c.file === file)
  if (atual < 0 || !texto) return []
  const out: ConflitoRevelacao[] = []
  let mapa: ReturnType<typeof normalizarComMapa> | null = null
  for (const c of cartoes) {
    if (!ehFato(c) || !c.revelarEm || !Array.isArray(c.termos) || !c.termos.length) continue
    const p = posicaoDoId(c.revelarEm, caps)
    if (p < 0 || atual >= p) continue
    mapa ??= normalizarComMapa(texto)
    const vistos = new Set<string>()
    for (const termo of c.termos) {
      const chave = normalizarTermo(termo)
      if (vistos.has(chave)) continue
      vistos.add(chave)
      const oc = acharTermo(texto, termo, mapa)[0]
      if (!oc) continue
      const achado = texto.slice(oc.inicio, oc.fim)
      const titulo = c.titulo.trim() || 'Fato sem título'
      const quando = nomeDaPosicao(p, caps)
      out.push({
        trecho: fraseEm(texto, oc.inicio, oc.fim),
        fichaId: c.id,
        fichaNome: titulo,
        campo: 'Revelação',
        esperado: `o leitor só sabe a partir do ${quando}`,
        encontrado: `“${achado}” no ${nomeDaPosicao(atual, caps)}`,
        explicacao: `“${achado}” entrega o fato “${titulo}”, que o leitor só deve saber a partir do ${quando}.`,
        cartaoId: c.id,
        termo: achado,
        inicio: oc.inicio,
        fim: oc.fim
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// o que o leitor sabe (e o contexto da IA)
// ---------------------------------------------------------------------------

export interface ConhecimentoLeitor {
  /** verdades com revelarEm ≤ capítulo (ou sem revelarEm) */
  sabidos: Cartao[]
  /** verdades ainda não reveladas */
  segredos: Cartao[]
  /** crenças/afirmações de personagens */
  crencas: Cartao[]
}

/** Fatos do livro na posição `pos`, em ordem de revelação. Descartados ficam de fora. */
export function conhecimentoNoCapitulo(cartoes: Cartao[], pos: number, caps: CapituloOrdem[]): ConhecimentoLeitor {
  const r: ConhecimentoLeitor = { sabidos: [], segredos: [], crencas: [] }
  const ordem = (c: Cartao): number => (c.revelarEm ? posicaoDoId(c.revelarEm, caps) : -1)
  const fatos = cartoes.filter(ehFato).sort((a, b) => ordem(a) - ordem(b) || a.criadoEm.localeCompare(b.criadoEm))
  for (const c of fatos) {
    if (ehCrenca(c)) r.crencas.push(c)
    else if (revelado(c, pos, caps)) r.sabidos.push(c)
    else r.segredos.push(c)
  }
  return r
}

/** O leitor já pode saber o fato na posição `pos`? Sem `revelarEm` = sempre; capítulo removido = nunca. */
export function revelado(c: Cartao, pos: number, caps: CapituloOrdem[]): boolean {
  if (!c.revelarEm) return true
  const p = posicaoDoId(c.revelarEm, caps)
  return p >= 0 && pos >= 0 && p <= pos
}

const MARCA_PROV = ' (ideia provisória, NÃO é fato do livro)'

function corpoFato(c: Cartao): string {
  const t = (c.texto ?? '').trim().slice(0, 500)
  const tit = c.titulo.trim() || 'fato'
  return t ? `${tit}: ${t}` : tit
}

/** Linhas de contexto da IA: fatos sabidos, segredos e crenças na posição `pos`. */
export function fatosParaContexto(
  cartoes: Cartao[],
  pos: number,
  caps: CapituloOrdem[],
  todas: Ficha[]
): { fatos: string[]; segredos: string[]; crencas: string[] } {
  const k = conhecimentoNoCapitulo(cartoes, pos, caps)
  const prov = (c: Cartao): string => (c.estado === 'provisorio' ? MARCA_PROV : '')
  const termos = (c: Cartao): string => (c.termos?.length ? `; palavras que entregam (não use): ${c.termos.slice(0, 12).join(', ')}` : '')
  return {
    fatos: k.sabidos.map((c) => `- ${corpoFato(c)}${prov(c)}`),
    segredos: k.segredos.map((c) => {
      const p = posicaoDoId(c.revelarEm, caps)
      const quando = p >= 0 ? `só a partir do ${nomeDaPosicao(p, caps)}` : 'ainda sem capítulo de revelação'
      return `- ${corpoFato(c)} (o leitor ${quando}${termos(c)})${prov(c)}`
    }),
    crencas: k.crencas.map((c) => {
      const per = c.perspectiva
      const quem = (per?.tipo === 'crenca' ? todas.find((f) => f.id === per.fichaId)?.nome : undefined) ?? 'Um personagem'
      const oculto = revelado(c, pos, caps) ? '' : ' (o leitor ainda não sabe disso)'
      return `- ${quem} acredita/afirma: ${corpoFato(c)} (não é necessariamente verdade)${oculto}${prov(c)}`
    })
  }
}

// ---------------------------------------------------------------------------
// fios soltos
// ---------------------------------------------------------------------------

export type EstadoFio = 'aberto' | 'resolvido' | 'atrasado'

/** Último capítulo com texto (posição), ou -1. Página de parte não conta. */
export function ultimoEscrito(caps: CapituloOrdem[]): number {
  for (let i = caps.length - 1; i >= 0; i--) if ((caps[i]?.words ?? 0) > 0 && caps[i]?.kind !== 'parte') return i
  return -1
}

/**
 * Situação do fio: "atrasado" quando ainda aberto e o capítulo onde devia se
 * resolver já ficou para trás (vem antes do último capítulo escrito).
 * null se o cartão não é fio.
 */
export function estadoFio(c: Cartao, caps: CapituloOrdem[]): EstadoFio | null {
  if (!c.fio) return null
  if (c.fio.status === 'resolvido') return 'resolvido'
  const p = posicaoDoId(c.fio.resolveEm, caps)
  const ult = ultimoEscrito(caps)
  return p >= 0 && ult >= 0 && p < ult ? 'atrasado' : 'aberto'
}

// ---------------------------------------------------------------------------
// impacto: o que muda adiante quando o capítulo X muda
// ---------------------------------------------------------------------------

function nomesDe(f: Ficha): string[] {
  const nomes = new Set<string>()
  const add = (n: unknown): void => {
    if (typeof n === 'string' && n.trim().length >= 2) nomes.add(n.trim())
  }
  add(f.nome)
  for (const a of Array.isArray(f.apelidos) ? f.apelidos : []) add(a)
  if (f.tipo === 'personagem') {
    const primeiro = f.nome.trim().split(/\s+/)[0]
    if (primeiro && primeiro.length >= 3) add(primeiro)
  }
  return [...nomes]
}

function tituloCartao(c: Cartao): string {
  return c.titulo.trim() || 'sem título'
}

/**
 * Capítulos SEGUINTES a `file` que podem ser afetados quando ele muda:
 * - cartões alcançados a partir dos cartões do capítulo por ligações de causa
 *   (travessia, também indireta);
 * - fatos revelados ou plantados nele: capítulos seguintes que usam os termos;
 * - fios plantados nele que se resolvem adiante;
 * - fichas com mudança de valor a partir dele: capítulos seguintes que citam a ficha.
 * `textos` = corpo dos capítulos seguintes (arquivo → texto); sem ele, os
 * itens de fato/ficha valem para "o resto do livro". Só leitura.
 */
export function calcularImpacto(
  file: string,
  caps: CapituloOrdem[],
  board: EnredoBoard,
  fichas: Ficha[],
  textos: Record<string, string> = {}
): ImpactoItem[] {
  const posX = caps.findIndex((c) => c.file === file)
  const capX = caps[posX]
  if (!capX) return []
  const depois = caps.slice(posX + 1)
  if (!depois.length) return []
  const posFile = (f?: string): number => (f ? caps.findIndex((c) => c.file === f) : -1)
  const vivos = board.cartoes.filter((c) => c && c.estado !== 'descartado')
  const porId = new Map(vivos.map((c) => [c.id, c]))
  const out: ImpactoItem[] = []
  const mapas = new Map<string, ReturnType<typeof normalizarComMapa>>()
  const mapaDe = (f: string): ReturnType<typeof normalizarComMapa> | null => {
    const t = textos[f]
    if (!t) return null
    let m = mapas.get(f)
    if (!m) {
      m = normalizarComMapa(t)
      mapas.set(f, m)
    }
    return m
  }
  const usam = (termos: string[]): CapituloOrdem[] =>
    depois.filter((c) => {
      const m = mapaDe(c.file)
      return !!m && termos.some((t) => acharTermo(textos[c.file] ?? '', t, m).length > 0)
    })

  // 1) causa: travessia em largura a partir dos cartões do capítulo
  const raiz = vivos.filter((c) => c.capitulo === file)
  const pai = new Map<string, { de: string; raiz: string }>()
  const fila = raiz.map((c) => c.id)
  const visto = new Set(fila)
  while (fila.length) {
    const id = fila.shift() as string
    for (const l of board.ligacoes) {
      if (l?.tipo !== 'causa' || l.de !== id || visto.has(l.para)) continue
      const para = porId.get(l.para)
      if (!para) continue
      visto.add(para.id)
      const r = pai.get(id)?.raiz ?? id
      pai.set(para.id, { de: id, raiz: r })
      fila.push(para.id)
      if (posFile(para.capitulo) > posX) {
        const origem = porId.get(r)
        const via = porId.get(id)
        out.push({
          tipo: 'causa',
          capitulo: para.capitulo,
          cartaoId: para.id,
          texto:
            id === r
              ? `“${origem ? tituloCartao(origem) : 'cartão'}” causa “${tituloCartao(para)}”${l.rotulo?.trim() ? ` (${l.rotulo.trim()})` : ''}`
              : `“${tituloCartao(para)}” é consequência indireta de “${origem ? tituloCartao(origem) : 'cartão'}” (via “${via ? tituloCartao(via) : 'cartão'}”)`
        })
      }
    }
  }

  // 2) fatos revelados ou plantados aqui
  for (const c of vivos) {
    if (c.tipo !== 'fato' || (c.revelarEm !== capX.id && c.capitulo !== file)) continue
    const como = c.revelarEm === capX.id ? 'revelado' : 'plantado'
    const termos = Array.isArray(c.termos) ? c.termos : []
    const afetados = termos.length ? usam(termos) : []
    if (afetados.length) {
      for (const a of afetados) out.push({ tipo: 'fato', capitulo: a.file, cartaoId: c.id, texto: `cita o fato “${tituloCartao(c)}”, ${como} aqui` })
    } else {
      out.push({ tipo: 'fato', cartaoId: c.id, texto: `o fato “${tituloCartao(c)}” é ${como} aqui: os capítulos seguintes contam com ele` })
    }
  }

  // 3) fios plantados aqui que se resolvem adiante
  for (const c of vivos) {
    if (!c.fio || c.capitulo !== file) continue
    const p = posicaoDoId(c.fio.resolveEm, caps)
    if (p <= posX) continue
    out.push({
      tipo: 'fio',
      capitulo: caps[p]?.file,
      cartaoId: c.id,
      texto: `fio “${tituloCartao(c)}”, plantado aqui, ${c.fio.status === 'resolvido' ? 'é resolvido' : 'deve ser resolvido'} neste capítulo`
    })
  }

  // 4) fichas cujo valor muda a partir daqui
  for (const f of fichas) {
    const mudancas: string[] = []
    for (const campo of Array.isArray(f.campos) ? f.campos : []) {
      if (!campo?.nome) continue
      for (const h of campo.historico ?? []) if (h?.desde === capX.id) mudancas.push(`${campo.nome}: ${h.valor}`)
      const leg = typeof campo.valor === 'string' ? refLegada(campo.valor) : null
      if (leg && posicaoDaRef(leg.ref, caps) === posX) mudancas.push(`${campo.nome}: ${leg.valor}`)
    }
    if (!mudancas.length) continue
    const afetados = usam(nomesDe(f))
    const desc = mudancas.join('; ')
    if (afetados.length) {
      for (const a of afetados) out.push({ tipo: 'ficha', capitulo: a.file, fichaId: f.id, texto: `${f.nome} aparece; desde aqui vale ${desc}` })
    } else {
      out.push({ tipo: 'ficha', fichaId: f.id, texto: `${f.nome}: desde aqui vale ${desc}` })
    }
  }

  // um item por (tipo, capítulo, alvo), na ordem do livro ("resto do livro" no fim)
  const vistos = new Set<string>()
  return out
    .filter((x) => {
      const k = `${x.tipo}|${x.capitulo ?? ''}|${x.cartaoId ?? ''}|${x.fichaId ?? ''}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    .sort((a, b) => (a.capitulo ? posFile(a.capitulo) : 1e9) - (b.capitulo ? posFile(b.capitulo) : 1e9))
}
