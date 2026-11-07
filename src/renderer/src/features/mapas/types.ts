/**
 * Modelo de dados do editor de mapas. Coleção "mapas", um documento por mapa.
 * O terreno é uma máscara em grade (pintada a pincel) que vira paths suavizados
 * na renderização; o resto são objetos vetoriais posicionados em unidades do mapa.
 */

export type MapaEstilo = 'pena' | 'colorido'

/** Valores da grade de terreno. */
export const MAR = 0
export const TERRA = 1
export const LAGO = 2

export interface Terreno {
  /** tamanho da célula em unidades do mapa */
  cel: number
  cols: number
  rows: number
  /** run-length: comprimentos alternados "valor:quantidade" separados por vírgula */
  rle: string
  /** 0–1: irregularidade da costa */
  rugosidade: number
  /** semente do ruído da costa */
  semente: number
}

export type SimboloTipo =
  | 'montanha' | 'pico' | 'colina' | 'vulcao'
  | 'arvore' | 'pinheiro' | 'palmeira' | 'pantano' | 'arbusto'
  | 'cidade' | 'capital' | 'vila' | 'castelo' | 'ruina' | 'torre' | 'porto'
  | 'templo' | 'farol' | 'caverna' | 'mina' | 'acampamento' | 'ponte'
  | 'navio' | 'monstro' | 'redemoinho' | 'ancora'

export type CamadaId = 'terreno' | 'relevo' | 'vegetacao' | 'simbolos' | 'rios' | 'rotas' | 'rotulos'

export interface Simbolo {
  id: string
  tipo: SimboloTipo
  x: number
  y: number
  escala: number
  /** graus */
  rot: number
  /** nome exibido sob o símbolo (opcional) */
  nome?: string
}

export interface Ponto {
  x: number
  y: number
}

export interface Rio {
  id: string
  pontos: Ponto[]
  /** largura na foz, em unidades do mapa */
  largura: number
}

export interface Rota {
  id: string
  pontos: Ponto[]
  /** 'trilha' tracejada curta, 'mar' tracejada longa */
  tipo: 'trilha' | 'mar'
}

export type RotuloEstilo = 'mar' | 'regiao' | 'cidade'

export interface Rotulo {
  id: string
  texto: string
  x: number
  y: number
  tam: number
  /** espaçamento entre letras, em unidades do mapa */
  espaco: number
  /** -1..1 (0 = reto) */
  curva: number
  rot: number
  estilo: RotuloEstilo
}

export interface Ligacao {
  id: string
  /** id do símbolo ou rótulo */
  item: string
  fichaId?: string
  cartaoId?: string
}

export type Canto = 'no' | 'ne' | 'so' | 'se'

export interface Decoracao {
  moldura: boolean
  cartucho: { on: boolean; canto: Canto; titulo: string; subtitulo: string }
  rosa: { on: boolean; canto: Canto; tam: number }
  escala: { on: boolean; canto: Canto; /** léguas que cabem na largura do mapa */ leguasLargura: number }
  grade: boolean
}

export interface MapaDoc {
  id: string
  nome: string
  estilo: MapaEstilo
  largura: number
  altura: number
  terreno: Terreno
  relevo: Simbolo[]
  vegetacao: Simbolo[]
  simbolos: Simbolo[]
  rios: Rio[]
  rotas: Rota[]
  rotulos: Rotulo[]
  ligacoes: Ligacao[]
  ocultas: CamadaId[]
  deco: Decoracao
  criadoEm: string
  atualizadoEm: string
}

/** Resumo devolvido por "mapas.listar". */
export interface MapaResumo {
  id: string
  nome: string
  estilo: MapaEstilo
  itens: number
  atualizadoEm: string
}

export const CAMADAS: Array<{ id: CamadaId; nome: string }> = [
  { id: 'terreno', nome: 'Terreno' },
  { id: 'relevo', nome: 'Relevo' },
  { id: 'vegetacao', nome: 'Vegetação' },
  { id: 'rios', nome: 'Rios' },
  { id: 'simbolos', nome: 'Cidades e marcos' },
  { id: 'rotas', nome: 'Rotas' },
  { id: 'rotulos', nome: 'Rótulos' }
]

export type SimboloCamada = 'relevo' | 'vegetacao' | 'simbolos'
