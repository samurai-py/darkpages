import type { ChapterContent, ChapterLabel } from '../../shared/types'

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** Número por extenso em português (1–999), forma masculina: "Capítulo vinte e um". */
export function extenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
  if (n < 10) return UNIDADES[n] ?? String(n)
  if (n < 20) return DEZ_A_DEZENOVE[n - 10] ?? String(n)
  if (n < 100) {
    const d = DEZENAS[Math.floor(n / 10)] ?? ''
    return n % 10 ? `${d} e ${UNIDADES[n % 10]}` : d
  }
  if (n === 100) return 'cem'
  const c = CENTENAS[Math.floor(n / 100)] ?? ''
  return n % 100 ? `${c} e ${extenso(n % 100)}` : c
}

export function romano(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n)
  const tab: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ]
  let out = ''
  let r = n
  for (const [v, s] of tab) {
    while (r >= v) {
      out += s
      r -= v
    }
  }
  return out
}

/** Rótulo acima do título ("Capítulo três", "Prólogo") ou null quando não há. */
export function chapterLabelText(kind: ChapterContent['kind'], n: number, mode: ChapterLabel): string | null {
  if (kind === 'prologo') return 'Prólogo'
  if (kind === 'epilogo') return 'Epílogo'
  if (mode === 'nenhum') return null
  if (mode === 'extenso') return `Capítulo ${extenso(n)}`
  if (mode === 'romano') return `Capítulo ${romano(n)}`
  return `Capítulo ${n}`
}

/** Mostra o título quando ele acrescenta algo ao rótulo (prólogo chamado só "Prólogo" não repete). */
export function showsTitle(c: ChapterContent, label: string | null): boolean {
  const t = c.title.trim()
  if (!t) return false
  return !label || t.toLowerCase() !== label.toLowerCase()
}

/** Numera só os capítulos (prólogo e epílogo ficam sem número). */
export function numberChapters(chapters: ChapterContent[]): number[] {
  let n = 0
  return chapters.map((c) => (c.kind === 'capitulo' ? (n += 1) : 0))
}
