import type { Sugestao } from './models'

/**
 * Contratos do "Corrigir" do Manuscrito (prefixo "corrigir."):
 * - 'corrigir.revisor'(dir, chapterFile, texto) → ResultadoRevisorCorrigir
 *   Só LanguageTool (sem IA), só ortografia e gramática, sobre o texto
 *   simples do trecho escolhido; respeita "Sempre manter", "Foi de propósito"
 *   e o dicionário do livro.
 * - 'corrigir.snapshot'(dir) → { id } — versão "antes de corrigir" na Arca.
 */

export interface SugestaoCorrigir extends Sugestao {
  /** onde `original` começa no texto enviado */
  inicio: number
}

export interface ResultadoRevisorCorrigir {
  /** o LanguageTool conferiu o texto */
  ativo: boolean
  modo: 'off' | 'local' | 'publico'
  sugestoes: SugestaoCorrigir[]
  /** por que não conferiu (desligado, fora do ar) */
  aviso?: string
}

/**
 * Posição da sugestão no texto enviado. O LanguageTool devolve o deslocamento
 * no id ("lt-<início>-<n>"); se ele não bater, procura pelo contexto
 * (antes + original + depois). → -1 quando não acha com segurança.
 */
export function posicaoDaSugestao(texto: string, s: Pick<Sugestao, 'id' | 'original' | 'antes' | 'depois'>): number {
  const m = /^lt-(\d+)-/.exec(s.id)
  if (m) {
    const i = Number(m[1])
    if (texto.slice(i, i + s.original.length) === s.original) return i
  }
  const alvo = s.antes + s.original + s.depois
  const i = texto.indexOf(alvo)
  if (i < 0 || texto.indexOf(alvo, i + 1) >= 0) return -1
  return i + s.antes.length
}
