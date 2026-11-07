import { distPolilinha, novoId } from './geom'
import { larguraRotulo, NOMES_SIMBOLO } from './render'
import { tamanho } from './simbolos'
import type { CamadaId, MapaDoc, Ponto, Rio, Rota, Rotulo, Simbolo, SimboloCamada } from './types'

/** Funções puras sobre os itens vetoriais do mapa (seleção, edição, borracha). */

export type CamadaItem = SimboloCamada | 'rotulos' | 'rios' | 'rotas'
export interface ItemRef {
  camada: CamadaItem
  id: string
}
export type Item = Simbolo | Rotulo | Rio | Rota

export const CAMADAS_SIMBOLO: SimboloCamada[] = ['simbolos', 'relevo', 'vegetacao']
export const ehSimboloCamada = (c: CamadaItem): c is SimboloCamada => c === 'simbolos' || c === 'relevo' || c === 'vegetacao'

export function acharItem(d: MapaDoc, r: ItemRef): Item | undefined {
  switch (r.camada) {
    case 'simbolos':
    case 'relevo':
    case 'vegetacao':
      return d[r.camada].find((s) => s.id === r.id)
    case 'rotulos':
      return d.rotulos.find((s) => s.id === r.id)
    case 'rios':
      return d.rios.find((s) => s.id === r.id)
    case 'rotas':
      return d.rotas.find((s) => s.id === r.id)
  }
}

export function acharPorId(d: MapaDoc, id: string): ItemRef | null {
  for (const c of CAMADAS_SIMBOLO) if (d[c].some((s) => s.id === id)) return { camada: c, id }
  if (d.rotulos.some((s) => s.id === id)) return { camada: 'rotulos', id }
  if (d.rios.some((s) => s.id === id)) return { camada: 'rios', id }
  if (d.rotas.some((s) => s.id === id)) return { camada: 'rotas', id }
  return null
}

export function editarSimbolo(d: MapaDoc, camada: SimboloCamada, id: string, f: (s: Simbolo) => Simbolo): MapaDoc {
  return { ...d, [camada]: d[camada].map((s) => (s.id === id ? f(s) : s)) }
}
export function editarRotulo(d: MapaDoc, id: string, f: (s: Rotulo) => Rotulo): MapaDoc {
  return { ...d, rotulos: d.rotulos.map((s) => (s.id === id ? f(s) : s)) }
}
export function editarRio(d: MapaDoc, id: string, f: (s: Rio) => Rio): MapaDoc {
  return { ...d, rios: d.rios.map((s) => (s.id === id ? f(s) : s)) }
}
export function editarRota(d: MapaDoc, id: string, f: (s: Rota) => Rota): MapaDoc {
  return { ...d, rotas: d.rotas.map((s) => (s.id === id ? f(s) : s)) }
}

const desloca = (p: Ponto[], dx: number, dy: number): Ponto[] => p.map((q) => ({ x: q.x + dx, y: q.y + dy }))

export function moverItem(d: MapaDoc, r: ItemRef, dx: number, dy: number): MapaDoc {
  if (ehSimboloCamada(r.camada)) return editarSimbolo(d, r.camada, r.id, (s) => ({ ...s, x: s.x + dx, y: s.y + dy }))
  if (r.camada === 'rotulos') return editarRotulo(d, r.id, (s) => ({ ...s, x: s.x + dx, y: s.y + dy }))
  if (r.camada === 'rios') return editarRio(d, r.id, (s) => ({ ...s, pontos: desloca(s.pontos, dx, dy) }))
  return editarRota(d, r.id, (s) => ({ ...s, pontos: desloca(s.pontos, dx, dy) }))
}

export function removerItens(d: MapaDoc, ids: Set<string>): MapaDoc {
  if (ids.size === 0) return d
  const fora = <T extends { id: string }>(l: T[]): T[] => (l.some((x) => ids.has(x.id)) ? l.filter((x) => !ids.has(x.id)) : l)
  return {
    ...d,
    relevo: fora(d.relevo),
    vegetacao: fora(d.vegetacao),
    simbolos: fora(d.simbolos),
    rotulos: fora(d.rotulos),
    rios: fora(d.rios),
    rotas: fora(d.rotas),
    ligacoes: d.ligacoes.some((l) => ids.has(l.item)) ? d.ligacoes.filter((l) => !ids.has(l.item)) : d.ligacoes
  }
}

export function duplicarItem(d: MapaDoc, r: ItemRef): { doc: MapaDoc; novo: ItemRef } | null {
  const it = acharItem(d, r)
  if (!it) return null
  const id = novoId(r.camada.slice(0, 3))
  const desl = 24
  if (ehSimboloCamada(r.camada)) {
    const s = it as Simbolo
    return { doc: { ...d, [r.camada]: [...d[r.camada], { ...s, id, x: s.x + desl, y: s.y + desl }] }, novo: { camada: r.camada, id } }
  }
  if (r.camada === 'rotulos') {
    const s = it as Rotulo
    return { doc: { ...d, rotulos: [...d.rotulos, { ...s, id, x: s.x + desl, y: s.y + desl }] }, novo: { camada: r.camada, id } }
  }
  if (r.camada === 'rios') {
    const s = it as Rio
    return { doc: { ...d, rios: [...d.rios, { ...s, id, pontos: desloca(s.pontos, desl, desl) }] }, novo: { camada: r.camada, id } }
  }
  const s = it as Rota
  return { doc: { ...d, rotas: [...d.rotas, { ...s, id, pontos: desloca(s.pontos, desl, desl) }] }, novo: { camada: r.camada, id } }
}

export function nomeItem(d: MapaDoc, r: ItemRef): string {
  const it = acharItem(d, r)
  if (!it) return ''
  if (ehSimboloCamada(r.camada)) {
    const s = it as Simbolo
    return s.nome || NOMES_SIMBOLO[s.tipo] || 'Símbolo'
  }
  if (r.camada === 'rotulos') return (it as Rotulo).texto || 'Rótulo'
  return r.camada === 'rios' ? 'Rio' : 'Rota'
}

/** Ponto de ancoragem (canto superior direito) para marcas e popups. */
export function ancoraItem(d: MapaDoc, r: ItemRef): Ponto | null {
  const it = acharItem(d, r)
  if (!it) return null
  if (ehSimboloCamada(r.camada)) {
    const s = it as Simbolo
    const { w, h } = tamanho(s.tipo, s.escala)
    return { x: s.x + w / 2, y: s.y - h / 2 }
  }
  if (r.camada === 'rotulos') {
    const s = it as Rotulo
    return { x: s.x + larguraRotulo(s) / 2, y: s.y - s.tam / 2 }
  }
  const p = (it as Rio | Rota).pontos
  return p[Math.floor(p.length / 2)] ?? null
}

/** Caixa (centro, meia-largura, meia-altura, rotação) de um rótulo. */
export function caixaRotulo(r: Rotulo): { hw: number; hh: number } {
  const w = larguraRotulo(r)
  return { hw: w / 2 + 4, hh: r.tam * 0.6 + Math.abs(r.curva) * w * 0.32 + 4 }
}

function dentroRotulo(r: Rotulo, x: number, y: number, tol: number): boolean {
  const a = (-r.rot * Math.PI) / 180
  const dx = x - r.x
  const dy = y - r.y
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  const { hw, hh } = caixaRotulo(r)
  return Math.abs(lx) <= hw + tol && Math.abs(ly) <= hh + tol
}

function dentroSimbolo(s: Simbolo, x: number, y: number, tol: number): boolean {
  const { w, h } = tamanho(s.tipo, s.escala)
  return Math.abs(x - s.x) <= w / 2 + tol && Math.abs(y - s.y) <= h / 2 + tol
}

/** Item mais de cima sob o ponto (respeitando camadas ocultas). */
export function itemEm(d: MapaDoc, x: number, y: number, tol: number, filtro?: (c: CamadaItem) => boolean): ItemRef | null {
  const vis = (c: CamadaId): boolean => !d.ocultas.includes(c)
  const ok = (c: CamadaItem): boolean => vis(c) && (!filtro || filtro(c))
  if (ok('rotulos')) {
    for (let i = d.rotulos.length - 1; i >= 0; i--) {
      const r = d.rotulos[i]
      if (r && dentroRotulo(r, x, y, tol)) return { camada: 'rotulos', id: r.id }
    }
  }
  for (const c of CAMADAS_SIMBOLO) {
    if (!ok(c)) continue
    const l = d[c].slice().sort((a, b) => b.y - a.y)
    const s = l.find((q) => dentroSimbolo(q, x, y, tol))
    if (s) return { camada: c, id: s.id }
  }
  if (ok('rotas')) {
    const r = d.rotas.find((q) => distPolilinha(q.pontos, x, y) <= tol + 3)
    if (r) return { camada: 'rotas', id: r.id }
  }
  if (ok('rios')) {
    const r = d.rios.find((q) => distPolilinha(q.pontos, x, y) <= tol + q.largura / 2)
    if (r) return { camada: 'rios', id: r.id }
  }
  return null
}

/** Ids de tudo que a borracha toca num disco. */
export function itensNoDisco(d: MapaDoc, x: number, y: number, raio: number): Set<string> {
  const out = new Set<string>()
  const vis = (c: CamadaId): boolean => !d.ocultas.includes(c)
  for (const c of CAMADAS_SIMBOLO) {
    if (!vis(c)) continue
    for (const s of d[c]) {
      const { w } = tamanho(s.tipo, s.escala)
      if (Math.hypot(s.x - x, s.y - y) <= raio + w * 0.3) out.add(s.id)
    }
  }
  if (vis('rotulos')) for (const r of d.rotulos) if (dentroRotulo(r, x, y, raio)) out.add(r.id)
  if (vis('rios')) for (const r of d.rios) if (distPolilinha(r.pontos, x, y) <= raio) out.add(r.id)
  if (vis('rotas')) for (const r of d.rotas) if (distPolilinha(r.pontos, x, y) <= raio) out.add(r.id)
  return out
}
