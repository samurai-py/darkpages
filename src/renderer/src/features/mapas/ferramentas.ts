import type { IconeMapa } from './icones'
import type { SimboloTipo } from './types'

export type Ferramenta =
  | 'selecionar' | 'borracha' | 'terra' | 'agua' | 'montanha' | 'floresta'
  | 'cidade' | 'vila' | 'castelo' | 'ruina' | 'torre' | 'porto' | 'navio' | 'monstro' | 'carimbo'
  | 'rio' | 'rota' | 'texto' | 'ligar'

export interface FerramentaDef {
  id: Ferramenta
  nome: string
  icone: IconeMapa
  tecla?: string
  dica: string
}

export const GRUPOS: FerramentaDef[][] = [
  [
    { id: 'selecionar', nome: 'Selecionar e mover', icone: 'selecionar', tecla: 'V', dica: 'Clique para selecionar, arraste para mover. Arraste no vazio para navegar.' },
    { id: 'borracha', nome: 'Borracha', icone: 'borracha', tecla: 'E', dica: 'Arraste sobre símbolos, rios, rotas e rótulos para apagar.' }
  ],
  [
    { id: 'terra', nome: 'Pincel de terra', icone: 'terra', tecla: 'B', dica: 'Pinte massas de terra. Alt inverte (apaga).' },
    { id: 'agua', nome: 'Pincel de água', icone: 'agua', tecla: 'W', dica: 'Lagos dentro da terra, ou recorte o mar na costa.' }
  ],
  [
    { id: 'montanha', nome: 'Montanhas', icone: 'montanha', tecla: 'M', dica: 'Clique para uma montanha; arraste para uma cordilheira.' },
    { id: 'floresta', nome: 'Floresta', icone: 'floresta', tecla: 'F', dica: 'Arraste para espalhar árvores.' }
  ],
  [
    { id: 'cidade', nome: 'Cidade', icone: 'cidade', tecla: 'C', dica: 'Clique para pôr uma cidade e dê um nome no painel.' },
    { id: 'vila', nome: 'Vila', icone: 'vila', dica: 'Clique para pôr uma vila.' },
    { id: 'castelo', nome: 'Castelo', icone: 'castelo', dica: 'Clique para pôr um castelo.' },
    { id: 'ruina', nome: 'Ruína', icone: 'ruina', dica: 'Clique para pôr uma ruína.' },
    { id: 'torre', nome: 'Torre', icone: 'torre', dica: 'Clique para pôr uma torre.' },
    { id: 'porto', nome: 'Porto', icone: 'porto', dica: 'Clique para pôr um porto.' },
    { id: 'navio', nome: 'Navio', icone: 'navio', dica: 'Clique no mar para pôr um navio.' },
    { id: 'monstro', nome: 'Monstro marinho', icone: 'monstro', dica: 'Clique no mar para pôr um monstro.' },
    { id: 'carimbo', nome: 'Biblioteca de símbolos', icone: 'carimbo', tecla: 'S', dica: 'Escolha um símbolo da biblioteca e clique no mapa.' }
  ],
  [
    { id: 'rio', nome: 'Rio', icone: 'rio', tecla: 'R', dica: 'Arraste da nascente até a foz: o rio engrossa no caminho.' },
    { id: 'rota', nome: 'Rota', icone: 'rota', tecla: 'P', dica: 'Arraste para traçar uma rota tracejada.' },
    { id: 'texto', nome: 'Texto', icone: 'texto', tecla: 'T', dica: 'Clique para pôr um rótulo; edite no painel.' },
    { id: 'ligar', nome: 'Ligar a ficha ou cartão', icone: 'ligar', tecla: 'L', dica: 'Clique num símbolo ou rótulo para ligá-lo.' }
  ]
]

export const TODAS = GRUPOS.flat()

/** Ferramentas que põem um único símbolo fixo por clique. */
export const CARIMBO_FIXO: Partial<Record<Ferramenta, SimboloTipo>> = {
  vila: 'vila',
  castelo: 'castelo',
  ruina: 'ruina',
  torre: 'torre',
  porto: 'porto',
  navio: 'navio',
  monstro: 'monstro'
}

export type TipoFloresta = 'mista' | 'arvore' | 'pinheiro' | 'palmeira' | 'arbusto' | 'pantano'
export type TipoMontanha = 'montanha' | 'pico' | 'colina' | 'vulcao'
export type ModoTerra = 'pintar' | 'apagar'
export type ModoAgua = 'lago' | 'mar' | 'secar'
