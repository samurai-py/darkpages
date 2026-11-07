import type { Conflito, DecisaoRevisao, DecisaoTipo, Sugestao } from './models'

/**
 * Decisões de revisão ("Sempre manter" no Revisor, "Foi de propósito" no
 * Manuscrito) num lugar só. Puro: usado pelo processo principal (Revisor,
 * continuidade, insights proativos) e pela interface (rótulos, chave do
 * conflito).
 *
 * Duas fontes valem juntas:
 * - `ignorados` do capítulo (front-matter, "Foi de propósito" do Manuscrito);
 * - decisões do livro (coleção "revisao", doc "decisoes").
 */

/** Chave estável de um conflito de continuidade (a mesma que o Manuscrito grava em `ignorados`). */
export function chaveConflito(c: Pick<Conflito, 'fichaId' | 'campo' | 'trecho'>): string {
  return `${c.fichaId}|${c.campo}|${c.trecho}`
}

/** Forma comparada: minúscula, sem acento, espaços colapsados. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Decisões que valem no capítulo (as do livro todo e as só dele). */
export function decisoesDoCapitulo(decisoes: DecisaoRevisao[], capId: string | undefined): DecisaoRevisao[] {
  return decisoes.filter((d) => !d.capitulo || d.capitulo === capId)
}

/** Palavras que o autor mandou manter (normalizadas). */
export function palavrasMantidas(decisoes: DecisaoRevisao[]): Set<string> {
  return new Set(decisoes.filter((d) => d.tipo === 'manter-palavra').map((d) => normalizar(d.valor)).filter(Boolean))
}

/** O conflito foi marcado como de propósito (no capítulo ou nas decisões do livro)? */
export function conflitoMantido(
  c: Pick<Conflito, 'fichaId' | 'campo' | 'trecho'>,
  ignorados: string[] | undefined,
  decisoes: DecisaoRevisao[],
  capId?: string
): boolean {
  const k = chaveConflito(c)
  if (ignorados?.includes(k)) return true
  return decisoesDoCapitulo(decisoes, capId).some((d) => d.tipo === 'continuidade' && d.valor === k)
}

/** O trecho está dentro de (ou é) um trecho mantido? Trechos curtos (< 4 letras) só valem se forem iguais. */
export function trechoMantido(trecho: string, decisoes: DecisaoRevisao[]): boolean {
  const t = normalizar(trecho)
  if (!t) return false
  return decisoes.some((d) => {
    if (d.tipo !== 'manter-trecho') return false
    const v = normalizar(d.valor)
    if (!v) return false
    return t === v || t.includes(v) || (t.length >= 4 && v.includes(t))
  })
}

/** A sugestão contraria alguma decisão (ou "foi de propósito")? */
export function sugestaoMantida(s: Sugestao, decisoes: DecisaoRevisao[], ignorados?: string[], capId?: string): boolean {
  const ds = decisoesDoCapitulo(decisoes, capId)
  if (s.chave && (ignorados?.includes(s.chave) || ds.some((d) => d.tipo === 'continuidade' && d.valor === s.chave))) return true
  if (s.regra && ds.some((d) => d.tipo === 'ignorar-regra' && d.valor === s.regra)) return true
  const palavras = palavrasMantidas(ds)
  if (s.palavra && palavras.has(normalizar(s.palavra))) return true
  if ((s.categoria === 'ortografia' || s.categoria === 'repeticao') && palavras.has(normalizar(s.original))) return true
  return trechoMantido(s.original, ds)
}

export function filtrarSugestoes(lista: Sugestao[], decisoes: DecisaoRevisao[], ignorados?: string[], capId?: string): Sugestao[] {
  return lista.filter((s) => !sugestaoMantida(s, decisoes, ignorados, capId))
}

export interface DecisaoProposta {
  tipo: DecisaoTipo
  valor: string
  /** vale só neste capítulo? */
  soCapitulo: boolean
  rotulo: string
  /** texto do botão "Sempre manter …" */
  acao: string
}

/**
 * Que decisão "Sempre manter" grava para esta sugestão:
 * - continuidade → o conflito, só neste capítulo;
 * - ortografia e repetição de palavra → a palavra, no livro todo;
 * - regra do LanguageTool (gramática/estilo) → ignorar a regra;
 * - estilo/repetição da IA → o trecho.
 */
export function decisaoPara(s: Sugestao): DecisaoProposta {
  if (s.categoria === 'continuidade' && s.chave) {
    return { tipo: 'continuidade', valor: s.chave, soCapitulo: true, rotulo: `continuidade: ${s.motivo}`, acao: 'Foi de propósito' }
  }
  if (s.palavra) {
    return { tipo: 'manter-palavra', valor: s.palavra, soCapitulo: false, rotulo: `repetição: ${s.palavra}`, acao: `Manter “${s.palavra}”` }
  }
  if (s.categoria === 'ortografia' && !/\s/.test(s.original.trim())) {
    return { tipo: 'manter-palavra', valor: s.original.trim(), soCapitulo: false, rotulo: `palavra: ${s.original.trim()}`, acao: 'Aceitar no livro todo' }
  }
  if (s.regra) {
    return { tipo: 'ignorar-regra', valor: s.regra, soCapitulo: false, rotulo: `regra: ${s.motivo}`, acao: 'Ignorar esta regra' }
  }
  return { tipo: 'manter-trecho', valor: s.original, soCapitulo: false, rotulo: `trecho: ${s.original.slice(0, 60)}`, acao: 'Sempre manter' }
}

/** Linhas para o prompt da IA: o que o autor já decidiu manter (no máximo `max`). */
export function decisoesEmTexto(decisoes: DecisaoRevisao[], max = 40): string[] {
  const out: string[] = []
  for (const d of decisoes) {
    if (out.length >= max) break
    if (d.tipo === 'manter-palavra') out.push(`- manter a palavra “${d.valor}” (escolha do autor, não é erro nem repetição a corrigir)`)
    else if (d.tipo === 'manter-trecho') out.push(`- manter o trecho “${d.valor.slice(0, 160)}” como está`)
  }
  return out
}
