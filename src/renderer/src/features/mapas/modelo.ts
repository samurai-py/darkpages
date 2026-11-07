import { decodeGrade, encodeGrade, novoId, pintar, rng, terrenoVazio } from './geom'
import { CAMADAS, TERRA, type CamadaId, type MapaDoc, type Ponto, type Rotulo, type Simbolo, type SimboloTipo } from './types'

export const LARGURA_PADRAO = 1600
/** proporção dos papéis A (√2), para o PNG preencher A3/A4 sem sobras */
export const ALTURA_PADRAO = 1131

export function novoMapa(nome: string): MapaDoc {
  const agora = new Date().toISOString()
  return {
    id: novoId('mapa'),
    nome,
    estilo: 'pena',
    largura: LARGURA_PADRAO,
    altura: ALTURA_PADRAO,
    terreno: terrenoVazio(LARGURA_PADRAO, ALTURA_PADRAO),
    relevo: [],
    vegetacao: [],
    simbolos: [],
    rios: [],
    rotas: [],
    rotulos: [],
    ligacoes: [],
    ocultas: [],
    deco: {
      moldura: true,
      cartucho: { on: true, canto: 'no', titulo: '', subtitulo: '' },
      rosa: { on: true, canto: 'se', tam: 70 },
      escala: { on: true, canto: 'so', leguasLargura: 600 },
      grade: false
    },
    criadoEm: agora,
    atualizadoEm: agora
  }
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** Completa campos ausentes de um documento lido do disco. */
export function normalizar(raw: Partial<MapaDoc> & { id: string }): MapaDoc {
  const base = novoMapa(raw.nome ?? 'Mapa')
  const largura = num(raw.largura, base.largura)
  const altura = num(raw.altura, base.altura)
  const t = raw.terreno
  const terreno =
    t && typeof t.rle === 'string' && t.cols > 0 && t.rows > 0
      ? { ...t, rugosidade: num(t.rugosidade, 0.5), semente: num(t.semente, 1) }
      : terrenoVazio(largura, altura)
  const d = raw.deco
  const camadasValidas = new Set<CamadaId>(CAMADAS.map((c) => c.id))
  return {
    ...base,
    ...raw,
    id: raw.id,
    estilo: raw.estilo === 'colorido' ? 'colorido' : 'pena',
    largura,
    altura,
    terreno,
    relevo: arr(raw.relevo),
    vegetacao: arr(raw.vegetacao),
    simbolos: arr(raw.simbolos),
    rios: arr(raw.rios),
    rotas: arr(raw.rotas),
    rotulos: arr(raw.rotulos),
    ligacoes: arr(raw.ligacoes),
    ocultas: arr<CamadaId>(raw.ocultas).filter((c) => camadasValidas.has(c)),
    deco: {
      moldura: d?.moldura ?? base.deco.moldura,
      cartucho: { ...base.deco.cartucho, ...(d?.cartucho ?? {}) },
      rosa: { ...base.deco.rosa, ...(d?.rosa ?? {}) },
      escala: { ...base.deco.escala, ...(d?.escala ?? {}) },
      grade: d?.grade ?? false
    }
  }
}

export function contarItens(m: MapaDoc): number {
  return m.relevo.length + m.vegetacao.length + m.simbolos.length + m.rios.length + m.rotas.length + m.rotulos.length
}

// ---------------------------------------------------------------------------
// mapa de exemplo (Brumária)
// ---------------------------------------------------------------------------

const COSTA =
  'M300 90 C 380 60, 470 90, 520 70 C 600 40, 690 80, 720 130 C 760 190, 820 200, 800 270 C 780 330, 840 380, 790 440 C 740 500, 680 520, 600 560 C 520 600, 430 570, 380 520 C 330 470, 260 470, 250 400 C 240 330, 200 300, 230 240 C 260 180, 230 120, 300 90 Z'
const ILHAS = [
  'M90 380 C 120 340, 170 350, 180 390 C 190 430, 150 470, 115 455 C 80 440, 70 410, 90 380 Z',
  'M870 170 C 900 150, 940 170, 930 205 C 920 235, 880 235, 865 210 C 855 195, 858 180, 870 170 Z'
]

/** Gera um mapa completo de exemplo, pronto para editar. */
export function mapaExemplo(nome: string): MapaDoc {
  const m = novoMapa(nome)
  const K = 1.6
  const OY = (ALTURA_PADRAO - 640 * K) / 2
  const P = (x: number, y: number): Ponto => ({ x: x * K, y: y * K + OY })
  const r = rng(20261106)
  const t = m.terreno
  t.semente = 4242
  t.rugosidade = 0.55
  const g = decodeGrade(t)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(K, 0, 0, K, 0, OY)
    const paths = [new Path2D(COSTA), ...ILHAS.map((d) => new Path2D(d))]
    for (let j = 0; j < t.rows; j++) {
      for (let i = 0; i < t.cols; i++) {
        const x = (i + 0.5) * t.cel
        const y = (j + 0.5) * t.cel
        if (paths.some((p) => ctx.isPointInPath(p, x, y))) g[j * t.cols + i] = TERRA
      }
    }
  }
  const lago = P(560, 175)
  pintar(g, t, lago.x, lago.y, 34, 'lago')
  const lago2 = P(585, 160)
  pintar(g, t, lago2.x, lago2.y, 22, 'lago')
  t.rle = encodeGrade(g)

  const simb = (tipo: SimboloTipo, x: number, y: number, escala = 1, nome?: string): Simbolo => {
    const p = P(x, y)
    return { id: novoId('s'), tipo, x: p.x, y: p.y, escala, rot: 0, ...(nome ? { nome } : {}) }
  }

  const montes: Array<[number, number, number]> = [
    [352, 134, 1.1], [382, 153, 1], [419, 133, 1.15], [371, 181, 1.05], [407, 172, 0.95], [445, 160, 1.05], [340, 209, 1],
    [378, 219, 0.9], [680, 433, 1], [712, 447, 0.9], [696, 469, 1], [730, 415, 0.9]
  ]
  m.relevo = montes.map(([x, y, e]) => simb('montanha', x, y, e))
  m.relevo.push(simb('pico', 400, 126, 1.2), simb('colina', 300, 300, 1), simb('colina', 330, 318, 0.9), simb('colina', 560, 520, 1))

  const bosque = (cx: number, cy: number, n: number, rx: number, ry: number, tipo: SimboloTipo): void => {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r())
      m.vegetacao.push(simb(tipo, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 0.9 + r() * 0.3))
    }
  }
  bosque(590, 266, 34, 42, 24, 'arvore')
  bosque(322, 392, 22, 30, 20, 'arvore')
  bosque(705, 360, 14, 18, 26, 'pinheiro')
  m.vegetacao.push(simb('pantano', 520, 520, 1), simb('pantano', 545, 505, 0.9), simb('palmeira', 115, 405, 1), simb('palmeira', 130, 420, 0.9))

  m.simbolos = [
    simb('capital', 485, 310, 1.1, 'Brumagem'),
    simb('castelo', 640, 322, 0.9, 'Vale Cinza'),
    simb('ruina', 431, 479, 1, 'Ruínas de Ost'),
    simb('cidade', 380, 296, 0.9, 'Sinostre'),
    simb('porto', 772, 290, 1, 'Porto Velado'),
    simb('torre', 538, 140, 1.1, 'Torre do Sino'),
    simb('vila', 600, 470, 1, 'Cinzal'),
    simb('farol', 896, 196, 1),
    simb('navio', 150, 545, 1.1),
    simb('monstro', 900, 380, 1),
    simb('redemoinho', 130, 160, 1)
  ]

  m.rios = [
    { id: novoId('rio'), largura: 9, pontos: [P(470, 168), P(462, 230), P(450, 272), P(460, 330), P(455, 382), P(458, 432), P(472, 500), P(496, 548), P(515, 596)] },
    { id: novoId('rio'), largura: 6, pontos: [P(640, 210), P(626, 260), P(640, 300), P(612, 350), P(572, 394), P(520, 412), P(462, 420)] }
  ]
  m.rotas = [
    { id: novoId('rota'), tipo: 'trilha', pontos: [P(486, 318), P(540, 342), P(600, 358), P(640, 334)] },
    { id: novoId('rota'), tipo: 'trilha', pontos: [P(486, 318), P(440, 306), P(392, 300)] },
    { id: novoId('rota'), tipo: 'mar', pontos: [P(782, 300), P(830, 250), P(870, 214)] }
  ]
  const rot = (texto: string, x: number, y: number, estilo: Rotulo['estilo'], tam: number, espaco: number, curva = 0): Rotulo => {
    const p = P(x, y)
    return { id: novoId('r'), texto, x: p.x, y: p.y, estilo, tam, espaco, curva, rot: 0 }
  }
  m.rotulos = [
    rot('Montes do Badalo', 392, 102, 'regiao', 22, 7, 0.12),
    rot('Mata Surda', 590, 232, 'regiao', 17, 5),
    rot('Mar de Sal', 150, 262, 'mar', 34, 10, 0.25),
    rot('Baía Muda', 840, 560, 'mar', 28, 8, -0.15),
    rot('Lago Sereno', 570, 205, 'cidade', 13, 1)
  ]
  m.deco.cartucho.titulo = nome
  m.deco.cartucho.subtitulo = 'e as terras do Badalo'
  return m
}
