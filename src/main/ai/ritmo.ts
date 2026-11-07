import type { MetricasRitmo } from '../../shared/models'

/**
 * Métricas de ritmo baratas (sem IA), para visualizar, não para sugerir:
 * tamanho médio de frase e de parágrafo, parcela de diálogo e inícios de
 * frase repetidos. Puro e determinístico.
 */

/** Artigos não contam como "início repetido" (toda língua começa frases assim). */
const INICIO_NEUTRO = new Set(['o', 'a', 'os', 'as', 'um', 'uma'])

const PALAVRA = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu

function contarPalavras(s: string): number {
  return s.match(PALAVRA)?.length ?? 0
}

/** Parágrafos de texto (sem títulos, separadores de cena, notas de rodapé e imagens). */
export function paragrafos(md: string): string[] {
  return md
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#{1,6}\s/.test(p) && !/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(p) && !/^\[\^[^\]]+\]:/.test(p) && !/^!\[/.test(p))
    .map((p) =>
      p
        .replace(/\[\^[^\]]*\]/g, '')
        .replace(/[*_`~]+/g, '')
        .replace(/^>\s?/gm, '')
        .replace(/\n/g, ' ')
    )
}

/** Parágrafo de fala: começa com travessão ou aspas. */
export function ehDialogo(p: string): boolean {
  return /^\s*(?:[—–]|-\s|["“«])/.test(p)
}

/** Frases de um parágrafo (ponto, exclamação, interrogação, reticências). */
export function frases(p: string): string[] {
  return p
    .split(/(?<=[.!?…])["”»]?\s+(?=\S)/u)
    .map((f) => f.trim())
    .filter((f) => contarPalavras(f) > 0)
}

function primeiraPalavra(f: string): string {
  const m = f.replace(/^[\s—–\-"“«(]+/u, '').match(/[\p{L}]+/u)
  return m ? m[0].toLowerCase() : ''
}

const um = (n: number): number => Math.round(n * 10) / 10

export function metricasRitmo(md: string): MetricasRitmo {
  const ps = paragrafos(md)
  let palavras = 0
  let dialogo = 0
  let nFrases = 0
  const inicios = new Map<string, number>()
  for (const p of ps) {
    const w = contarPalavras(p)
    palavras += w
    if (ehDialogo(p)) dialogo += w
    for (const f of frases(p)) {
      nFrases++
      const ini = primeiraPalavra(f)
      if (ini && !INICIO_NEUTRO.has(ini)) inicios.set(ini, (inicios.get(ini) ?? 0) + 1)
    }
  }
  const iniciosRepetidos = [...inicios.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([inicio, n]) => ({ inicio, n }))
  return {
    palavras,
    frases: nFrases,
    paragrafos: ps.length,
    mediaFrase: nFrases ? um(palavras / nFrases) : 0,
    mediaParagrafo: ps.length ? um(palavras / ps.length) : 0,
    pctDialogo: palavras ? Math.round((dialogo / palavras) * 100) : 0,
    iniciosRepetidos
  }
}

/** Média do livro: as métricas do texto de todos os capítulos juntos (capítulos maiores pesam mais). */
export function metricasDoLivro(textos: string[]): MetricasRitmo {
  return metricasRitmo(textos.filter((t) => t.trim()).join('\n\n'))
}
