import { CLASSES, novoIdEntrada, type Classe, type Entrada } from './model'

const COLUNAS = ['pt', 'termo', 'classe', 'nota'] as const

function campo(v: string): string {
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function paraCsv(lexico: Entrada[]): string {
  const linhas = [COLUNAS.join(',')]
  for (const e of lexico) linhas.push([e.pt, e.termo, e.classe, e.nota].map(campo).join(','))
  return linhas.join('\r\n') + '\r\n'
}

/** Leitor CSV (RFC 4180) com separador "," ou ";" detectado na primeira linha. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { atual += '"'; i++ }
      else if (c === '"') aspas = false
      else atual += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(atual); atual = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(atual)
      linhas.push(linha)
      linha = []
      atual = ''
    } else atual += c
  }
  if (atual || linha.length) { linha.push(atual); linhas.push(linha) }
  return linhas.filter((l) => l.some((c) => c.trim()))
}

export interface Importacao {
  entradas: Entrada[]
  ignoradas: number
}

/** Converte CSV em entradas. Aceita cabeçalho (pt, termo, classe, nota, em qualquer ordem) ou colunas nessa ordem. */
export function importarCsv(texto: string): Importacao {
  const linhas = lerCsv(texto)
  if (!linhas.length) return { entradas: [], ignoradas: 0 }
  const cab = (linhas[0] as string[]).map((c) => c.trim().toLowerCase())
  const temCab = cab.includes('pt') || cab.includes('termo') || cab.includes('português') || cab.includes('portugues')
  const pos = (nome: string, alt: string[], padrao: number): number => {
    if (!temCab) return padrao
    const i = cab.findIndex((c) => c === nome || alt.includes(c))
    return i
  }
  const iPt = pos('pt', ['português', 'portugues'], 0)
  const iTermo = pos('termo', ['palavra', 'lingua', 'língua'], 1)
  const iClasse = pos('classe', [], 2)
  const iNota = pos('nota', ['notas', 'obs'], 3)
  const corpo = temCab ? linhas.slice(1) : linhas
  const entradas: Entrada[] = []
  let ignoradas = 0
  for (const l of corpo) {
    const pt = (l[iPt] ?? '').trim()
    const termo = (l[iTermo] ?? '').trim()
    if (!pt || !termo) { ignoradas++; continue }
    const c = (iClasse >= 0 ? (l[iClasse] ?? '') : '').trim().toLowerCase()
    const classe: Classe = (CLASSES as string[]).includes(c) ? (c as Classe) : 'outro'
    entradas.push({ id: novoIdEntrada(), pt: pt.slice(0, 120), termo: termo.slice(0, 120), classe, nota: (iNota >= 0 ? (l[iNota] ?? '') : '').trim().slice(0, 500) })
  }
  return { entradas, ignoradas }
}
