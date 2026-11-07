/**
 * Radical (stem) de palavras em português — puro, sem dependências; usado no
 * processo principal e no editor.
 *
 * `stemSnowballPt` é uma tradução fiel do algoritmo Snowball para o português
 * (Martin Porter), a partir do código-fonte oficial
 * https://github.com/snowballstem/snowball/blob/master/algorithms/portuguese.sbl
 * e da descrição em https://snowballstem.org/algorithms/portuguese/stemmer.html.
 * Conferido contra o vocabulário de teste oficial (snowball-data/portuguese,
 * 32 016 palavras: voc.txt → output.txt).
 *
 * Licença do Snowball (BSD 3 cláusulas):
 *   Copyright (c) 2001, Dr Martin Porter
 *   Copyright (c) 2004,2005, Richard Boulton
 *   Copyright (c) 2013, Yoshiki Shibukawa
 *   Copyright (c) 2006-2025, Olly Betts
 *   All rights reserved.
 *   Redistribution and use in source and binary forms, with or without
 *   modification, are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of the Snowball project nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *   AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED (texto completo no
 *   arquivo COPYING do projeto Snowball).
 *
 * `radical` é a chave que o Folio usa para agrupar repetições: Snowball +
 * dois ajustes documentados abaixo (plural -ões/-ães do RSLP, de Orengo &
 * Huyck 2001, e comparação sem acento).
 */

const VOGAIS = new Set([...'aeiouáéíóúâêô'])
const vogal = (c: string | undefined): boolean => c !== undefined && VOGAIS.has(c)

/** Índice logo depois da primeira vogal a partir de `i` (ou -1). */
function depoisDeVogal(w: string, i: number): number {
  for (let k = i; k < w.length; k++) if (vogal(w[k])) return k + 1
  return -1
}

/** Índice logo depois da primeira não-vogal a partir de `i` (ou -1). */
function depoisDeConsoante(w: string, i: number): number {
  for (let k = i; k < w.length; k++) if (!vogal(w[k])) return k + 1
  return -1
}

/** Regiões RV, R1 e R2 (posições de início), como no `mark_regions` do Snowball. */
function regioes(w: string): { pV: number; p1: number; p2: number } {
  const n = w.length
  let pV = n
  if (n >= 2) {
    if (vogal(w[0])) {
      // v (non-v gopast v) or (v gopast non-v)
      let r = -1
      if (!vogal(w[1])) r = depoisDeVogal(w, 2)
      if (r < 0 && vogal(w[1])) r = depoisDeConsoante(w, 2)
      if (r >= 0) pV = r
    } else {
      // non-v (non-v gopast v) or (v next)
      let r = -1
      if (!vogal(w[1])) r = depoisDeVogal(w, 2)
      if (r < 0 && vogal(w[1]) && n >= 3) r = 3
      if (r >= 0) pV = r
    }
  }
  let p1 = n
  let p2 = n
  const a = depoisDeVogal(w, 0)
  const b = a < 0 ? -1 : depoisDeConsoante(w, a)
  if (b >= 0) {
    p1 = b
    const c = depoisDeVogal(w, b)
    const d = c < 0 ? -1 : depoisDeConsoante(w, c)
    if (d >= 0) p2 = d
  }
  return { pV, p1, p2 }
}

// os sufixos usam a forma do prelúdio: ã → "a~", õ → "o~"
const lista = (s: string): string[] => s.trim().split(/\s+/)

type Regra = (w: string, ini: number, r: { pV: number; p1: number; p2: number }) => string | null

/** Sufixo mais longo de `sufixos` que termina `w` (o `among` do Snowball). */
function maisLongo(w: string, sufixos: string[]): string | null {
  let melhor: string | null = null
  for (const s of sufixos) if (w.endsWith(s) && (!melhor || s.length > melhor.length)) melhor = s
  return melhor
}

/** `try ([substring] among(...) R2 delete)`: apaga o sufixo se ele está em R2. */
function tentarApagarR2(w: string, sufixos: string[], p2: number): string {
  const s = maisLongo(w, sufixos)
  if (s && w.length - s.length >= p2) return w.slice(0, -s.length)
  return w
}

const PADRAO: Array<[string[], Regra]> = [
  [
    lista(`eza ezas ico ica icos icas ismo ismos ável ível ista istas oso osa osos osas amento amentos
      imento imentos adora ador aça~o adoras adores aço~es ante antes ância`),
    (w, ini, r) => (ini >= r.p2 ? w.slice(0, ini) : null)
  ],
  [lista('logia logias'), (w, ini, r) => (ini >= r.p2 ? `${w.slice(0, ini)}log` : null)],
  [lista('uça~o uço~es'), (w, ini, r) => (ini >= r.p2 ? `${w.slice(0, ini)}u` : null)],
  [lista('ência ências'), (w, ini, r) => (ini >= r.p2 ? `${w.slice(0, ini)}ente` : null)],
  [
    ['amente'],
    (w, ini, r) => {
      if (ini < r.p1) return null
      let x = w.slice(0, ini)
      const s = maisLongo(x, ['iv', 'os', 'ic', 'ad'])
      if (s && x.length - s.length >= r.p2) {
        x = x.slice(0, -s.length)
        if (s === 'iv' && x.endsWith('at') && x.length - 2 >= r.p2) x = x.slice(0, -2)
      }
      return x
    }
  ],
  [['mente'], (w, ini, r) => (ini >= r.p2 ? tentarApagarR2(w.slice(0, ini), ['ante', 'avel', 'ível'], r.p2) : null)],
  [lista('idade idades'), (w, ini, r) => (ini >= r.p2 ? tentarApagarR2(w.slice(0, ini), ['abil', 'ic', 'iv'], r.p2) : null)],
  [lista('iva ivo ivas ivos'), (w, ini, r) => (ini >= r.p2 ? tentarApagarR2(w.slice(0, ini), ['at'], r.p2) : null)],
  // -eira/-eiras quase nunca é verbo: vira -eir
  [lista('ira iras'), (w, ini, r) => (ini >= r.pV && w[ini - 1] === 'e' ? `${w.slice(0, ini)}ir` : null)]
]
const PADRAO_SUFIXOS = PADRAO.flatMap(([ss, regra]) => ss.map((s) => [s, regra] as const))

const VERBAIS = lista(`ada ida ia aria eria iria ará ara erá era irá ava asse esse isse aste este iste
  ei arei erei irei am iam ariam eriam iriam aram eram iram avam em arem erem irem assem
  essem issem ado ido ando endo indo ara~o era~o ira~o ar er ir as adas idas ias
  arias erias irias arás aras erás eras irás avas es ardes erdes irdes ares eres
  ires asses esses isses astes estes istes is ais eis íeis aríeis eríeis iríeis
  áreis areis éreis ereis íreis ireis ásseis ésseis ísseis áveis ados idos
  ámos amos íamos aríamos eríamos iríamos áramos éramos íramos ávamos
  emos aremos eremos iremos ássemos êssemos íssemos imos armos ermos irmos eu iu ou
  ira iras`).sort((a, b) => b.length - a.length)

const RESIDUAIS = lista('os a i o á í ó')

function sufixoPadrao(w: string, r: { pV: number; p1: number; p2: number }): string | null {
  let melhor: (typeof PADRAO_SUFIXOS)[number] | null = null
  for (const e of PADRAO_SUFIXOS) if (w.endsWith(e[0]) && (!melhor || e[0].length > melhor[0].length)) melhor = e
  if (!melhor) return null
  return melhor[1](w, w.length - melhor[0].length, r)
}

function sufixoVerbal(w: string, pV: number): string | null {
  // setlimit tomark pV: só sufixos inteiros dentro de RV; o mais longo que couber
  for (const s of VERBAIS) if (w.endsWith(s) && w.length - s.length >= pV) return w.slice(0, -s.length)
  return null
}

/** Algoritmo Snowball para o português, palavra em minúsculas. */
export function stemSnowballPt(palavra: string): string {
  // prelúdio: ã e õ viram "a~" e "o~" (o til conta como consoante)
  let w = palavra.replace(/ã/g, 'a~').replace(/õ/g, 'o~')
  const r = regioes(w)

  const passo = sufixoPadrao(w, r) ?? sufixoVerbal(w, r.pV)
  if (passo !== null) {
    w = passo
    // apaga i em RV depois de c
    if (w.endsWith('ci') && w.length - 1 >= r.pV) w = w.slice(0, -1)
  } else {
    const s = maisLongo(w, RESIDUAIS)
    if (s && w.length - s.length >= r.pV) w = w.slice(0, -s.length)
  }

  // forma residual
  const e = maisLongo(w, ['e', 'é', 'ê'])
  if (e && w.length - 1 >= r.pV) {
    w = w.slice(0, -1)
    if ((w.endsWith('gu') || w.endsWith('ci')) && w.length - 1 >= r.pV) w = w.slice(0, -1)
  } else if (w.endsWith('ç')) {
    w = `${w.slice(0, -1)}c`
  }

  // pós-lúdio
  return w.replace(/a~/g, 'ã').replace(/o~/g, 'õ')
}

/** Minúsculas e sem acento (ç → c). */
export function semAcentoMin(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Chave de agrupamento do Folio: radical Snowball, sem acento, com o plural
 * -ões/-ães reduzido a -ão antes (regra da etapa de plural do RSLP, Orengo &
 * Huyck 2001) — o Snowball sozinho separa "coração" (coraçã) de "corações"
 * (coraçõ). Hífen e apóstrofo são ignorados.
 */
export function radical(palavra: string): string {
  let w = palavra.toLowerCase().replace(/['’-]/g, '')
  if (w.length <= 3) return semAcentoMin(w)
  if (/[õã]es$/.test(w)) w = `${w.slice(0, -3)}ão`
  return semAcentoMin(stemSnowballPt(w))
}

/**
 * Junta famílias que o Snowball separa: adjetivos em -io/-ios ("sombrio",
 * radical "sombri") e a forma sem o i ("sombra", "sombria" → "sombr"), mas só
 * quando as duas aparecem no mesmo texto e o radical curto tem 4+ letras —
 * assim "desafio"/"desafiar" (ambos "desafi") continuam juntos e radicais
 * curtos ("rio", "frio") não grudam em nada. Devolve radical → chave final.
 */
export function familias(radicais: Iterable<string>): Map<string, string> {
  const todos = new Set(radicais)
  const out = new Map<string, string>()
  for (const r of todos) {
    const curto = r.slice(0, -1)
    out.set(r, r.length >= 5 && r.endsWith('i') && todos.has(curto) ? curto : r)
  }
  return out
}

/** Chaves de família para uma lista de palavras (mesma ordem). */
export function chavesFamilia(palavras: string[]): string[] {
  const rs = palavras.map(radical)
  const f = familias(rs)
  return rs.map((r) => f.get(r) ?? r)
}
