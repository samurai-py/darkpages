import { contexto, mascararMarkdown, semAcento } from '../ai/texto'
import type { Sugestao } from '../../shared/models'
import { familias, radical } from '../../shared/stemmer-pt'

/**
 * Repetição próxima (local, determinística, sem IA): a mesma palavra de 5+
 * letras — ou outra da mesma família ("sombra", "sombras", "sombrio"; radical
 * Snowball, ver shared/stemmer-pt.ts) —, fora das palavras comuns e de nomes
 * próprios, duas ou mais vezes dentro de uma janela de N palavras. Puro: usado pelo modo proativo e
 * reaproveitável pelo Revisor.
 */

export const PALAVRAS_COMUNS = new Set(
  'porque quando sobre entre ainda depois antes mesmo mesma assim tinha tinham estava estavam havia seria sendo apenas outro outra outros outras todos todas aquele aquela aquilo nossa nosso minha dele dela deles delas nada tudo agora sempre nunca muito muita muitos muitas pouco quase talvez onde quem coisa disse'.split(
    ' '
  )
)

export interface Ocorrencia {
  /** posição (caractere) no Markdown original */
  pos: number
  /** a palavra como está no texto */
  texto: string
}

/** Um grupo de repetições: ocorrências seguidas da mesma palavra, cada uma a até `janela` palavras da anterior. */
export interface GrupoRepeticao {
  /** radical da família comparada (minúsculo, sem acento) */
  chave: string
  /** a primeira ocorrência, como escrita */
  palavra: string
  ocorrencias: Ocorrencia[]
  /** do início da primeira ao fim da última ocorrência (caracteres) */
  inicio: number
  fim: number
}

/**
 * Todos os grupos de repetição próxima do texto, em ordem de posição. Cada
 * grupo é uma cadeia: a palavra reaparece a até `janela` palavras da
 * ocorrência anterior. A mesma palavra pode formar vários grupos ao longo do
 * capítulo (um por trecho em que ela se acumula).
 */
export function gruposRepeticao(md: string, janela = 30, minLetras = 5): GrupoRepeticao[] {
  const limpo = mascararMarkdown(md)
  const palavras = [...limpo.matchAll(/[\p{L}]+(?:[-'’][\p{L}]+)*/gu)].map((m) => ({
    w: semAcento(m[0].toLowerCase()),
    pos: m.index ?? 0,
    orig: md.slice(m.index ?? 0, (m.index ?? 0) + m[0].length)
  }))
  const conta = (p: { w: string; orig: string }): boolean => p.w.length >= minLetras && !PALAVRAS_COMUNS.has(p.w) && !/^\p{Lu}/u.test(p.orig)
  const radicais = palavras.map((p) => (conta(p) ? radical(p.w) : ''))
  const fam = familias(radicais.filter(Boolean))
  const abertos = new Map<string, { ultimo: number; grupo: GrupoRepeticao }>()
  const out: GrupoRepeticao[] = []
  palavras.forEach((p, i) => {
    if (!conta(p)) return
    const chave = fam.get(radicais[i]!) ?? radicais[i]!
    const oc: Ocorrencia = { pos: p.pos, texto: p.orig }
    const aberto = abertos.get(chave)
    if (aberto && i - aberto.ultimo <= janela) {
      aberto.grupo.ocorrencias.push(oc)
      aberto.grupo.fim = p.pos + p.orig.length
      aberto.ultimo = i
      return
    }
    // começa uma cadeia nova (a anterior, se tinha 2+, já está em `out`)
    const grupo: GrupoRepeticao = { chave, palavra: p.orig, ocorrencias: [oc], inicio: p.pos, fim: p.pos + p.orig.length }
    abertos.set(chave, { ultimo: i, grupo })
    out.push(grupo)
  })
  return out.filter((g) => g.ocorrencias.length >= 2).sort((a, b) => a.inicio - b.inicio)
}

/** Frase do texto em volta de uma posição. */
export function fraseEm(texto: string, i: number): string {
  const ini = Math.max(texto.lastIndexOf('.', i - 1), texto.lastIndexOf('!', i - 1), texto.lastIndexOf('?', i - 1), texto.lastIndexOf('\n', i - 1)) + 1
  const fins = ['.', '!', '?', '\n'].map((c) => texto.indexOf(c, i)).filter((x) => x >= 0)
  const fim = fins.length ? Math.min(...fins) + 1 : texto.length
  return texto.slice(ini, fim).trim().slice(0, 300)
}

export interface AvisoRepeticao {
  /** frase onde o grupo começa */
  trecho: string
  palavras: Array<{ palavra: string; n: number }>
  /** maior número de ocorrências entre as palavras do aviso */
  n: number
}

/**
 * Avisos prontos para mostrar: os grupos que começam na mesma frase viram um
 * aviso só; os mais densos primeiro; no máximo `max` (sem limite se Infinity).
 */
export function avisosRepeticao(md: string, max = 3, janela = 30): AvisoRepeticao[] {
  const porFrase = new Map<string, AvisoRepeticao>()
  for (const g of gruposRepeticao(md, janela)) {
    const trecho = fraseEm(md, g.inicio)
    const a = porFrase.get(trecho) ?? { trecho, palavras: [], n: 0 }
    a.palavras.push({ palavra: g.palavra.toLowerCase(), n: g.ocorrencias.length })
    a.n = Math.max(a.n, g.ocorrencias.length)
    porFrase.set(trecho, a)
  }
  for (const a of porFrase.values()) a.palavras.sort((x, y) => y.n - x.n)
  return [...porFrase.values()].sort((a, b) => b.n - a.n).slice(0, max)
}

/** Quantas palavras há do início da primeira ao fim da última ocorrência do grupo. */
export function palavrasNoGrupo(md: string, g: GrupoRepeticao): number {
  return mascararMarkdown(md.slice(g.inicio, g.fim)).match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/** “sombra” 3× em 24 palavras */
export function mensagemRepeticao(md: string, g: GrupoRepeticao): string {
  return `“${g.palavra.toLowerCase()}” ${g.ocorrencias.length}× em ${palavrasNoGrupo(md, g)} palavras`
}

/**
 * Repetição próxima para o Revisor: um card por grupo (sem limite), em ordem
 * do texto. Só aponta (`soAviso`): o autor decide como variar. `original` é o
 * trecho da primeira à última ocorrência; `marcas` aponta cada ocorrência.
 * Grupos longos demais para exibir (> 400 caracteres) ficam de fora.
 * As decisões "manter palavra" são aplicadas depois (shared/decisoes.ts),
 * pela `palavra`.
 */
export function repeticoesRevisor(md: string, janela = 30): Sugestao[] {
  const out: Sugestao[] = []
  for (const g of gruposRepeticao(md, janela)) {
    if (g.fim - g.inicio > 400) continue
    const original = md.slice(g.inicio, g.fim)
    const { antes, depois } = contexto(md, g.inicio, original.length)
    out.push({
      id: `rp-${g.inicio}-${g.chave}`,
      categoria: 'repeticao',
      motivo: mensagemRepeticao(md, g),
      original,
      substituto: original,
      antes,
      depois,
      palavra: g.palavra.toLowerCase(),
      soAviso: true,
      marcas: g.ocorrencias.map((o): [number, number] => [o.pos - g.inicio, o.pos - g.inicio + o.texto.length])
    })
  }
  return out
}
