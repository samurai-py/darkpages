import type { Conflito, Ficha, Sugestao } from '../../shared/models'
import { escaparRegex, numeroCapitulo, contexto, semAcento, type Troca } from './texto'
import { mencoes, nomesDaFicha, type Mencao } from './contexto'

/**
 * Primeiro passe de continuidade, determinístico (sem IA):
 * 1. Atributos descritivos: campo "Olhos: verdes" na ficha × "olhos azuis"
 *    escrito perto do nome do personagem.
 * 2. Status: campo "Status: morto@cap12" × personagem com fala ou ação num
 *    capítulo de número maior (número pelo prefixo do arquivo, 013-x.md = 13).
 */

/** Vocabulário de cores/tons para comparar atributos sem falso positivo ("olhos cansados" não conta). */
const TONS = [
  'verde', 'azul', 'castanho', 'castanha', 'preto', 'preta', 'negro', 'negra', 'cinza', 'cinzento', 'cinzenta',
  'mel', 'ambar', 'ruivo', 'ruiva', 'loiro', 'loira', 'louro', 'loura', 'branco', 'branca', 'grisalho', 'grisalha',
  'vermelho', 'vermelha', 'dourado', 'dourada', 'prateado', 'prateada', 'violeta', 'roxo', 'roxa', 'lilas',
  'escarlate', 'rubro', 'rubra', 'acobreado', 'acobreada', 'moreno', 'morena', 'palido', 'palida', 'albino', 'albina'
]

/** Forma base para comparar: sem acento, sem plural, masculino. */
function base(adj: string): string {
  let s = semAcento(adj.trim())
  if (s.endsWith('uis')) s = `${s.slice(0, -3)}ul` // azuis → azul
  else if (s.endsWith('es') && TONS.includes(s.slice(0, -1))) s = s.slice(0, -1) // verdes → verde
  else if (s.endsWith('s')) s = s.slice(0, -1)
  if (s === 'negro' || s === 'negra') s = 'preto'
  if (s === 'louro' || s === 'loura') s = 'loiro'
  if (s === 'cinzento' || s === 'cinzenta') s = 'cinza'
  if (s.endsWith('a') && TONS.includes(`${s.slice(0, -1)}o`)) s = `${s.slice(0, -1)}o`
  return s
}

const TONS_BASE = new Set(TONS.map(base))

/** Plural simples para acompanhar "olhos": verde → verdes, azul → azuis, mel → mel. */
function concordar(valor: string, substantivo: string): string {
  const v = valor.trim()
  if (!substantivo.toLowerCase().endsWith('s') || /s$/i.test(v) || /^(mel|âmbar|ambar|violeta|lilás|lilas|cinza)$/i.test(v)) return v
  if (/ul$/i.test(v)) return `${v.slice(0, -2)}uis`
  if (/[aeiou]$/i.test(v)) return `${v}s`
  if (/[rz]$/i.test(v)) return `${v}es`
  return v
}

interface CampoAtributo {
  ficha: Ficha
  campo: string
  valor: string
  regex: RegExp
}

function camposDescritivos(lista: Ficha[]): CampoAtributo[] {
  const out: CampoAtributo[] = []
  for (const f of lista) {
    for (const c of Array.isArray(f.campos) ? f.campos : []) {
      if (!c?.nome || !c?.valor) continue
      const nomeBase = semAcento(c.nome).replace(/s$/, '')
      if (/^(status|estado|idade|nascimento|morte)$/.test(nomeBase)) continue
      const valorBase = base(c.valor.split(/[\s,;]+/)[0] ?? '')
      if (!TONS_BASE.has(valorBase)) continue
      const raiz = escaparRegex(c.nome.trim().replace(/s$/i, ''))
      // "olhos azuis", "olho azul", "cabelos muito negros"
      const re = new RegExp(`(?<![\\p{L}])(${raiz}s?)\\s+(?:(?:muito|tão|bem|mais)\\s+)?(\\p{L}+)(?![\\p{L}])`, 'giu')
      out.push({ ficha: f, campo: c.nome.trim(), valor: c.valor.trim(), regex: re })
    }
  }
  return out
}

/** Menção de personagem mais próxima (antes, no mesmo parágrafo; senão depois) dentro de `raio` caracteres. */
function donoDaMencao(texto: string, pos: number, lista: Mencao[], raio = 260): Mencao | null {
  const iniPar = texto.lastIndexOf('\n\n', pos)
  const fimPar = texto.indexOf('\n\n', pos)
  const dentro = lista.filter(
    (m) => m.ficha.tipo === 'personagem' && m.pos > iniPar && (fimPar < 0 || m.pos < fimPar) && Math.abs(m.pos - pos) <= raio
  )
  const antes = dentro.filter((m) => m.pos <= pos)
  if (antes.length) return antes[antes.length - 1] ?? null
  return dentro[0] ?? null
}

export interface ConflitoComTroca extends Conflito {
  troca?: Troca & { inicio: number }
}

const FALA = /^[\s,]*(?:—[^—\n]*—\s*)?(?:disse|diz|falou|fala|respondeu|responde|perguntou|pergunta|gritou|grita|murmurou|sussurrou|sussurra|retrucou|exclamou|chamou|riu|sorriu)\b/iu
const ACAO = /^[\s,]*(?:se\s+)?\p{Ll}{3,}(?:ou|eu|iu|ava|ia)\b/u
const MEMORIA = /lembr|mem[oó]ria|saudade|t[uú]mulo|enterr|funeral|morreu|morte|fantasma|esp[ií]rito|sonh|retrato|antes de morrer/i

function statusMorto(f: Ficha): { cap: number; valor: string } | null {
  for (const c of Array.isArray(f.campos) ? f.campos : []) {
    if (!c?.nome || !c?.valor || !/^(status|estado)$/i.test(c.nome.trim())) continue
    const m = c.valor.match(/^\s*(mort[oa]|falecid[oa]|destru[ií]d[oa])\s*@\s*(?:cap(?:[ií]tulo)?\.?\s*)?(\d{1,3})/i)
    if (m?.[2]) return { cap: Number(m[2]), valor: c.valor.trim() }
  }
  return null
}

export function continuidadeDeterministica(texto: string, file: string, lista: Ficha[]): ConflitoComTroca[] {
  const out: ConflitoComTroca[] = []
  const todas = mencoes(texto, lista)

  // 1) atributos descritivos
  for (const attr of camposDescritivos(lista)) {
    for (const m of texto.matchAll(attr.regex)) {
      const adj = m[2] ?? ''
      const b = base(adj)
      if (!TONS_BASE.has(b)) continue
      const esperado = base(attr.valor.split(/[\s,;]+/)[0] ?? '')
      if (b === esperado) continue
      const pos = m.index ?? 0
      const dono = donoDaMencao(texto, pos, todas)
      if (!dono || dono.ficha.id !== attr.ficha.id) continue
      const substantivo = m[1] ?? ''
      const original = m[0]
      const substituto = `${original.slice(0, original.length - adj.length)}${concordar(attr.valor.split(/[,;]/)[0] ?? attr.valor, substantivo)}`
      const { antes, depois } = contexto(texto, pos, original.length)
      out.push({
        trecho: `${antes}${original}${depois}`.trim(),
        fichaId: attr.ficha.id,
        fichaNome: attr.ficha.nome,
        campo: attr.campo,
        esperado: attr.valor,
        encontrado: original,
        explicacao: `A ficha de ${attr.ficha.nome} diz ${attr.campo}: ${attr.valor}, mas o texto diz "${original}".`,
        troca: { original, substituto, antes, depois, inicio: pos }
      })
    }
  }

  // 2) status morto@capN × fala/ação em capítulo posterior
  const atual = numeroCapitulo(file)
  const jaAvisado = new Set<string>()
  for (const f of lista) {
    const st = statusMorto(f)
    if (!st || !atual || atual <= st.cap || jaAvisado.has(f.id)) continue
    for (const nome of nomesDaFicha(f)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(nome)}(?![\\p{L}\\p{N}])`, 'gu')
      for (const m of texto.matchAll(re)) {
        const pos = m.index ?? 0
        const depoisNome = texto.slice(pos + m[0].length, pos + m[0].length + 60)
        const iniFrase = Math.max(texto.lastIndexOf('.', pos), texto.lastIndexOf('\n', pos)) + 1
        const fimFrase = (() => {
          const i = texto.slice(pos).search(/[.!?\n]/)
          return i < 0 ? texto.length : pos + i + 1
        })()
        const frase = texto.slice(iniFrase, fimFrase)
        if (MEMORIA.test(frase)) continue
        const antesNome = texto.slice(Math.max(0, pos - 25), pos)
        const fala = FALA.test(depoisNome) || /(?:disse|respondeu|perguntou|gritou|murmurou|sussurrou)\s*$/iu.test(antesNome)
        const acao = !fala && ACAO.test(depoisNome)
        if (!fala && !acao) continue
        jaAvisado.add(f.id)
        out.push({
          trecho: frase.trim(),
          fichaId: f.id,
          fichaNome: f.nome,
          campo: 'Status',
          esperado: st.valor,
          encontrado: fala ? `fala no cap. ${atual}` : `age no cap. ${atual}`,
          explicacao: `${f.nome} está marcado como ${st.valor}, mas ${fala ? 'fala' : 'age'} neste capítulo (${atual}). Se for lembrança ou flashback, ignore.`
        })
        break
      }
      if (jaAvisado.has(f.id)) break
    }
  }
  return out
}

/** Converte conflitos com troca proposta em sugestões do Revisor (categoria continuidade). */
export function conflitosComoSugestoes(cs: ConflitoComTroca[]): Sugestao[] {
  return cs
    .filter((c) => c.troca)
    .map((c, i) => ({
      id: `ct-${c.troca?.inicio ?? i}-${i}`,
      categoria: 'continuidade' as const,
      motivo: `ficha: ${c.fichaNome} · ${c.campo}: ${c.esperado}`,
      original: c.troca?.original ?? '',
      substituto: c.troca?.substituto ?? '',
      antes: c.troca?.antes ?? '',
      depois: c.troca?.depois ?? ''
    }))
}
