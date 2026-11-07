import { createHash } from 'node:crypto'

/** Utilidades de texto usadas pelo revisor, continuidade e contexto da IA. */

export function hashTexto(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32)
}

/**
 * Troca a marcação Markdown por espaços do mesmo tamanho (títulos, ênfase,
 * citações, listas, links), preservando os deslocamentos de cada caractere.
 */
export function mascararMarkdown(md: string): string {
  const esp = (s: string): string => s.replace(/[^\n]/g, ' ')
  return md
    .replace(/^(\s{0,3}#{1,6}\s+)/gm, esp)
    .replace(/^(\s{0,3}>\s?)/gm, esp)
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+)/gm, esp)
    .replace(/^(\s*(?:\*\s*){3,}|\s*(?:-\s*){3,}|\s*(?:_\s*){3,})$/gm, esp)
    .replace(/!?\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m, txt: string) => ` ${txt}${' '.repeat(m.length - txt.length - 1)}`)
    .replace(/(\*\*|__|\*|_|~~|`)/g, esp)
}

/** Texto antes/depois de um trecho para exibir, cortado na linha. */
export function contexto(texto: string, ini: number, len: number, raio = 70): { antes: string; depois: string } {
  let a = Math.max(0, ini - raio)
  const quebraA = texto.lastIndexOf('\n', ini - 1)
  if (quebraA >= a) a = quebraA + 1
  let d = Math.min(texto.length, ini + len + raio)
  const quebraD = texto.indexOf('\n', ini + len)
  if (quebraD >= 0 && quebraD < d) d = quebraD
  return { antes: texto.slice(a, ini), depois: texto.slice(ini + len, d) }
}

export function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Regex de palavra inteira (com acentos) para nome/apelido. */
export function regexNome(nome: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(nome.trim())}(?![\\p{L}\\p{N}])`, 'gu')
}

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Todas as posições em que `agulha` aparece em `texto`. */
export function ocorrencias(texto: string, agulha: string): number[] {
  const out: number[] = []
  if (!agulha) return out
  let i = texto.indexOf(agulha)
  while (i >= 0) {
    out.push(i)
    i = texto.indexOf(agulha, i + 1)
  }
  return out
}

export interface Troca {
  original: string
  substituto: string
  antes?: string
  depois?: string
}

export interface ResultadoTroca {
  texto: string
  aplicadas: number
  falhas: Array<{ original: string; motivo: string }>
}

/**
 * Aplica substituições com segurança: cada troca só acontece se o original
 * ainda existe exatamente. Com contexto (antes/depois), procura a ocorrência
 * cercada por ele; sem contexto ou se ele mudou, só troca se o original for
 * único no texto (para nunca trocar o trecho errado).
 */
export function aplicarTrocas(texto: string, trocas: Troca[]): ResultadoTroca {
  let t = texto
  let aplicadas = 0
  const falhas: ResultadoTroca['falhas'] = []
  for (const tr of trocas) {
    if (!tr.original) {
      falhas.push({ original: tr.original, motivo: 'Trecho original vazio.' })
      continue
    }
    const pos = ocorrencias(t, tr.original)
    if (!pos.length) {
      falhas.push({ original: tr.original, motivo: 'O trecho não existe mais no capítulo (o texto mudou).' })
      continue
    }
    let alvo: number | undefined
    if (tr.antes !== undefined || tr.depois !== undefined) {
      const a = tr.antes ?? ''
      const d = tr.depois ?? ''
      const comCtx = pos.filter((p) => t.slice(p - a.length, p) === a && t.slice(p + tr.original.length, p + tr.original.length + d.length) === d)
      if (comCtx.length === 1) alvo = comCtx[0]
      else if (comCtx.length > 1) {
        // contexto curto repetido: usa a primeira (mesma frase repetida, troca equivalente)
        alvo = comCtx[0]
      }
    }
    if (alvo === undefined) {
      if (pos.length === 1) alvo = pos[0]
      else {
        falhas.push({ original: tr.original, motivo: `O trecho aparece ${pos.length} vezes e o contexto mudou; aplique à mão.` })
        continue
      }
    }
    t = t.slice(0, alvo) + tr.substituto + t.slice((alvo as number) + tr.original.length)
    aplicadas++
  }
  return { texto: t, aplicadas, falhas }
}

/** Divide texto longo em pedaços por parágrafo (para mandar à IA sem cortar no meio). */
export function pedacos(texto: string, max: number): string[] {
  const paras = texto.split(/\n{2,}/)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      out.push(cur)
      cur = ''
    }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max))
      continue
    }
    cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** Número do capítulo pelo prefixo do arquivo (014-x.md → 14). */
export function numeroCapitulo(file: string): number {
  const n = Number.parseInt(file.slice(0, 3), 10)
  return Number.isFinite(n) ? n : 0
}

/** id de documento a partir do arquivo do capítulo (014-x.md → 014-x). */
export function idCapitulo(file: string): string {
  return file.replace(/\.md$/, '')
}
