/**
 * Nome dos capítulos ("Capítulo um", "Primeiro Círculo", "Livro I"…), único para o livro inteiro:
 * Manuscrito, Diagramação/PDF, sumário, cabeçalho corrente e EPUB usam estas funções.
 * Sem dependências de node/electron (roda no main e no renderer).
 */
import type { ChapterKind, ChapterLabel, LayoutSettings } from './types'

export type EstiloRotulo =
  | 'classico-extenso'
  | 'classico-numero'
  | 'ordinal-palavra'
  | 'romano'
  | 'romano-palavra'
  | 'numero'
  | 'modelo'
  | 'nenhum'

export type Genero = 'm' | 'f'
export type CaixaRotulo = 'normal' | 'maiusculas' | 'versalete'

export interface RotuloCfg {
  estilo: EstiloRotulo
  /** palavra que acompanha o número: "Capítulo", "Círculo", "Parte", "Livro"… */
  palavra: string
  /** gênero da palavra (concordância de "um/uma", "primeiro/primeira") */
  genero: Genero
  /** caixa no livro diagramado (PDF/EPUB) */
  caixa: CaixaRotulo
  /** modelo livre com {n} {extenso} {ordinal} {romano} {palavra} (estilo = modelo) */
  modelo: string
}

/** Padrão = comportamento antigo (chapterLabel "numero"): "Capítulo 1", em maiúsculas no livro. */
export const DEFAULT_ROTULO: RotuloCfg = {
  estilo: 'classico-numero',
  palavra: 'Capítulo',
  genero: 'm',
  caixa: 'maiusculas',
  modelo: '{palavra} {n}'
}

export const ESTILOS_ROTULO: { v: EstiloRotulo; label: string }[] = [
  { v: 'classico-extenso', label: 'Palavra + número por extenso (Capítulo um)' },
  { v: 'classico-numero', label: 'Palavra + algarismo (Capítulo 1)' },
  { v: 'ordinal-palavra', label: 'Ordinal + palavra (Primeiro Capítulo)' },
  { v: 'romano-palavra', label: 'Palavra + romano (Capítulo I)' },
  { v: 'romano', label: 'Só romano (I)' },
  { v: 'numero', label: 'Só algarismo (1)' },
  { v: 'modelo', label: 'Modelo livre…' },
  { v: 'nenhum', label: 'Só o título' }
]

// ---------------------------------------------------------------- extenso

const UNI_M = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const UNI_F = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** Número por extenso (0–999) com concordância: extenso(21, 'f') → "vinte e uma". */
export function extenso(n: number, genero: Genero = 'm'): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
  const uni = genero === 'f' ? UNI_F : UNI_M
  if (n < 10) return uni[n] ?? String(n)
  if (n < 20) return DEZ_A_DEZENOVE[n - 10] ?? String(n)
  if (n < 100) {
    const d = DEZENAS[Math.floor(n / 10)] ?? ''
    return n % 10 ? `${d} e ${uni[n % 10]}` : d
  }
  if (n === 100) return 'cem'
  let c = CENTENAS[Math.floor(n / 100)] ?? ''
  if (genero === 'f' && c.endsWith('os')) c = `${c.slice(0, -2)}as`
  return n % 100 ? `${c} e ${extenso(n % 100, genero)}` : c
}

// ---------------------------------------------------------------- ordinal

const ORD_UNI = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono']
const ORD_DEZ = ['', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo', 'septuagésimo', 'octogésimo', 'nonagésimo']
const ORD_CEN = ['', 'centésimo', 'ducentésimo', 'trecentésimo', 'quadringentésimo', 'quingentésimo', 'sexcentésimo', 'septingentésimo', 'octingentésimo', 'noningentésimo']

/** Ordinal por extenso (1–999): ordinal(112, 'f') → "centésima décima segunda". */
export function ordinal(n: number, genero: Genero = 'm'): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return `${n}${genero === 'f' ? 'ª' : 'º'}`
  const partes = [ORD_CEN[Math.floor(n / 100)], ORD_DEZ[Math.floor((n % 100) / 10)], ORD_UNI[n % 10]].filter((p): p is string => !!p)
  return partes.map((p) => (genero === 'f' ? `${p.slice(0, -1)}a` : p)).join(' ')
}

// ---------------------------------------------------------------- romano

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

// ---------------------------------------------------------------- rótulo

function inicialMaiuscula(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1) : s
}

/** Aplica a caixa: "maiusculas" vira texto em caixa alta; "versalete" fica a cargo de quem desenha (CSS/Typst). */
export function aplicarCaixa(s: string, caixa: CaixaRotulo): string {
  return caixa === 'maiusculas' ? s.toLocaleUpperCase('pt-BR') : s
}

/** Rótulo do capítulo n (1, 2, 3…) conforme a configuração. "" quando estilo = nenhum. */
export function rotuloCapitulo(n: number, cfg: RotuloCfg): string {
  const palavra = cfg.palavra.trim()
  const comPalavra = (x: string): string => (palavra ? `${palavra} ${x}` : x)
  let s: string
  switch (cfg.estilo) {
    case 'nenhum':
      return ''
    case 'classico-extenso':
      s = comPalavra(extenso(n, cfg.genero))
      break
    case 'classico-numero':
      s = comPalavra(String(n))
      break
    case 'ordinal-palavra':
      s = palavra ? `${ordinal(n, cfg.genero)} ${palavra}` : ordinal(n, cfg.genero)
      break
    case 'romano':
      s = romano(n)
      break
    case 'romano-palavra':
      s = comPalavra(romano(n))
      break
    case 'numero':
      s = String(n)
      break
    case 'modelo':
      s = cfg.modelo
        .replace(/\{n\}/g, String(n))
        .replace(/\{extenso\}/g, extenso(n, cfg.genero))
        .replace(/\{ordinal\}/g, ordinal(n, cfg.genero))
        .replace(/\{romano\}/g, romano(n))
        .replace(/\{palavra\}/g, palavra)
        .replace(/\s+/g, ' ')
        .trim()
      break
    default:
      s = comPalavra(String(n))
  }
  return aplicarCaixa(inicialMaiuscula(s), cfg.caixa)
}

/** Rótulo de qualquer item do sumário: "Prólogo"/"Epílogo" ou o rótulo do capítulo; null quando não há. */
export function rotuloDe(kind: ChapterKind, n: number, cfg: RotuloCfg): string | null {
  if (kind === 'prologo') return aplicarCaixa('Prólogo', cfg.caixa)
  if (kind === 'epilogo') return aplicarCaixa('Epílogo', cfg.caixa)
  return rotuloCapitulo(n, cfg) || null
}

/** Mesmo rótulo, em caixa normal (para a interface do app: listas, selects, cabeçalho do editor). */
export function rotuloTela(kind: ChapterKind, n: number, cfg: RotuloCfg): string | null {
  return rotuloDe(kind, n, { ...cfg, caixa: 'normal' })
}

const LEGADO: Record<ChapterLabel, EstiloRotulo> = {
  numero: 'classico-numero',
  extenso: 'classico-extenso',
  romano: 'romano-palavra',
  nenhum: 'nenhum'
}

const ESTILOS = new Set<string>(ESTILOS_ROTULO.map((e) => e.v))

/** Configuração efetiva do livro: usa `rotulo` quando existe; senão migra a opção antiga `chapterLabel`. */
export function resolveRotulo(l: Pick<LayoutSettings, 'rotulo' | 'chapterLabel'> | undefined): RotuloCfg {
  const base: RotuloCfg = { ...DEFAULT_ROTULO, estilo: LEGADO[l?.chapterLabel ?? 'numero'] ?? DEFAULT_ROTULO.estilo }
  const r = l?.rotulo
  if (!r) return base
  return {
    estilo: ESTILOS.has(r.estilo) ? r.estilo : base.estilo,
    palavra: typeof r.palavra === 'string' ? r.palavra : base.palavra,
    genero: r.genero === 'f' ? 'f' : 'm',
    caixa: r.caixa === 'normal' || r.caixa === 'versalete' ? r.caixa : 'maiusculas',
    modelo: typeof r.modelo === 'string' && r.modelo.trim() ? r.modelo : base.modelo
  }
}

/** Numera só os capítulos (prólogo e epílogo ficam com 0). */
export function numerarCapitulos(kinds: Array<{ kind: ChapterKind }>): number[] {
  let n = 0
  return kinds.map((c) => (c.kind === 'capitulo' ? (n += 1) : 0))
}
