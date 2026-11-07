import { Fragment, type ReactElement } from 'react'
import {
  campoDe,
  campoGrade,
  campoInfluencia,
  contornos,
  decodeGrade,
  distanciaAgua,
  pathAberto,
  pathFechado,
  pathRio
} from './geom'
import { DefsSimbolos, SIMBOLOS, tamanho } from './simbolos'
import { LAGO, TERRA, type Canto, type MapaDoc, type MapaEstilo, type Rotulo, type Simbolo, type Terreno } from './types'

/** Cores do desenho do mapa (independentes do tema da interface). */
export const TINTAS = {
  pena: { mar: '#E8D9B5', terra: '#F5ECD4', ink: '#3B2E1E', texto: '#2E2416', rota: '#8A2A1E', grade: 'rgba(59,46,30,.14)', papel: '#F4EAD2' },
  colorido: { mar: '#4F7F96', terra: '#A9C07F', ink: '#2B2117', texto: '#231A10', rota: '#7A2219', grade: 'rgba(255,255,255,.22)', papel: '#F3EBD8' }
} as const

export interface TerrenoCalc {
  terra: string
  lagos: string
  faixas: Array<{ d: string; cor: string }>
  floresta: string
}

const FAIXAS_ALTITUDE: Array<{ limiar: number; cor: string }> = [
  { limiar: 0.14, cor: '#98B06C' },
  { limiar: 0.3, cor: '#BDB073' },
  { limiar: 0.5, cor: '#A88C66' },
  { limiar: 0.72, cor: '#8C7560' },
  { limiar: 0.9, cor: '#EEEAE0' }
]

/** Calcula os paths do terreno a partir da grade pintada. */
export function calcularTerreno(
  g: Uint8Array,
  t: Terreno,
  estilo: MapaEstilo,
  relevo: Simbolo[],
  vegetacao: Simbolo[]
): TerrenoCalc {
  const terra = pathFechado(contornos(campoDe(g, t, TERRA, true), 0.5, t.cel))
  const lagos = pathFechado(contornos(campoDe(g, t, LAGO, false), 0.5, t.cel))
  if (estilo === 'pena') return { terra, lagos, faixas: [], floresta: '' }
  const dist = distanciaAgua(g, t)
  const montes = campoInfluencia(t, relevo, 3.2, (s) => (s.tipo === 'colina' ? 0.32 : s.tipo === 'pico' ? 0.9 : 0.62))
  const elev = campoGrade(
    t,
    (k) => (g[k] === TERRA ? Math.min(1, Math.min((dist[k] ?? 0) / 18, 1) * 0.26 + Math.min(montes[k] ?? 0, 1) * 0.75) : 0),
    2
  )
  const faixas = FAIXAS_ALTITUDE.map((f) => ({ d: pathFechado(contornos(elev, f.limiar, t.cel)), cor: f.cor })).filter((f) => f.d)
  const arv = campoInfluencia(t, vegetacao.filter((s) => s.tipo !== 'pantano'), 1.6, () => 0.5)
  const flor = campoGrade(t, (k) => (g[k] === TERRA ? Math.min(1, arv[k] ?? 0) : 0), 2)
  const floresta = pathFechado(contornos(flor, 0.22, t.cel))
  return { terra, lagos, faixas, floresta }
}

export function terrenoDoc(doc: MapaDoc): TerrenoCalc {
  return calcularTerreno(decodeGrade(doc.terreno), doc.terreno, doc.estilo, doc.relevo, doc.vegetacao)
}

// ---------------------------------------------------------------------------
// peças
// ---------------------------------------------------------------------------

function TerrenoSvg({ calc, estilo }: { calc: TerrenoCalc; estilo: MapaEstilo }): ReactElement {
  if (estilo === 'pena') {
    const c = TINTAS.pena
    const aneis = [30, 22, 15, 9, 4.5]
    const opac = [0.16, 0.24, 0.32, 0.42, 0.55]
    return (
      <g>
        {aneis.map((d, i) => (
          <Fragment key={d}>
            <path d={calc.terra} fill="none" stroke={c.ink} strokeOpacity={opac[i]} strokeWidth={2 * d + 0.9} strokeLinejoin="round" />
            <path d={calc.terra} fill="none" stroke={c.mar} strokeWidth={2 * d - 0.9} strokeLinejoin="round" />
          </Fragment>
        ))}
        <path d={calc.terra} fill={c.terra} fillRule="evenodd" stroke={c.ink} strokeWidth={2} strokeLinejoin="round" />
      </g>
    )
  }
  const c = TINTAS.colorido
  return (
    <g>
      <path d={calc.terra} fill="none" stroke="#6E9DB0" strokeWidth={34} strokeLinejoin="round" />
      <path d={calc.terra} fill="none" stroke="#8DB8C4" strokeWidth={14} strokeLinejoin="round" />
      <path d={calc.terra} fill={c.terra} fillRule="evenodd" />
      {calc.faixas.map((f) => (
        <path key={f.cor} d={f.d} fill={f.cor} fillRule="evenodd" />
      ))}
      {calc.floresta && <path d={calc.floresta} fill="#5F8A4C" fillOpacity={0.55} fillRule="evenodd" />}
      {calc.lagos && <path d={calc.lagos} fill="#5C93AC" fillRule="evenodd" stroke="#2F5E73" strokeWidth={1} />}
      <path d={calc.terra} fill="none" stroke="#3A4A34" strokeWidth={1.3} strokeLinejoin="round" />
    </g>
  )
}

export function SimboloUso({ s, p }: { s: Simbolo; p: string }): ReactElement {
  const { w, h } = tamanho(s.tipo, s.escala)
  return (
    <use
      href={`#${p}s-${s.tipo}`}
      x={-w / 2}
      y={-h / 2}
      width={w}
      height={h}
      transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})${s.rot ? ` rotate(${s.rot})` : ''}`}
    />
  )
}

const porY = (a: Simbolo, b: Simbolo): number => a.y - b.y

export function fonteRotulo(estilo: Rotulo['estilo']): { family: string; italic: boolean; weight: number; upper: boolean } {
  if (estilo === 'mar') return { family: "'EB Garamond', Georgia, serif", italic: true, weight: 400, upper: false }
  if (estilo === 'regiao') return { family: "'Cormorant Garamond', Georgia, serif", italic: false, weight: 600, upper: true }
  return { family: "'EB Garamond', Georgia, serif", italic: false, weight: 400, upper: false }
}

/** Largura aproximada de um rótulo (para curva, seleção e caixa). */
export function larguraRotulo(r: Pick<Rotulo, 'texto' | 'tam' | 'espaco' | 'estilo'>): number {
  const f = fonteRotulo(r.estilo)
  const n = Math.max(1, r.texto.length)
  return n * r.tam * (f.upper ? 0.66 : 0.5) + (n - 1) * r.espaco
}

function RotuloSvg({ r, estilo, p }: { r: Rotulo; estilo: MapaEstilo; p: string }): ReactElement {
  const f = fonteRotulo(r.estilo)
  const tinta = TINTAS[estilo]
  const texto = f.upper ? r.texto.toLocaleUpperCase('pt-BR') : r.texto
  const corMar = estilo === 'colorido' ? '#E9F1F3' : tinta.ink
  const fill = r.estilo === 'mar' ? corMar : tinta.texto
  const halo = r.estilo === 'mar' ? 'none' : estilo === 'colorido' ? 'rgba(243,235,216,.85)' : tinta.terra
  const comum = {
    fontFamily: f.family,
    fontStyle: f.italic ? 'italic' : 'normal',
    fontWeight: f.weight,
    fontSize: r.tam,
    letterSpacing: r.espaco,
    fill,
    fillOpacity: r.estilo === 'mar' ? 0.88 : 1,
    stroke: halo,
    strokeWidth: halo === 'none' ? 0 : Math.max(1.5, r.tam * 0.16),
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke'
  }
  const tr = `translate(${r.x.toFixed(1)} ${r.y.toFixed(1)})${r.rot ? ` rotate(${r.rot})` : ''}`
  if (Math.abs(r.curva) < 0.01) {
    return (
      <text transform={tr} textAnchor="middle" dy={r.tam * 0.34} {...comum}>
        {texto}
      </text>
    )
  }
  const L = larguraRotulo(r) * 1.35 + r.tam
  const k = -r.curva * L * 0.55
  const id = `${p}lp-${r.id}`
  return (
    <g transform={tr}>
      <path id={id} d={`M${(-L / 2).toFixed(1)} ${(-k / 2).toFixed(1)}Q0 ${(k * 1.5).toFixed(1)} ${(L / 2).toFixed(1)} ${(-k / 2).toFixed(1)}`} fill="none" />
      <text dy={r.tam * 0.34} {...comum}>
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {texto}
        </textPath>
      </text>
    </g>
  )
}

function NomeSimbolo({ s, estilo }: { s: Simbolo; estilo: MapaEstilo }): ReactElement | null {
  if (!s.nome) return null
  const { h } = tamanho(s.tipo, s.escala)
  const tam = Math.round(11 + Math.min(6, s.escala * 2.5))
  const tinta = TINTAS[estilo]
  const mar = s.tipo === 'navio' || s.tipo === 'monstro' || s.tipo === 'redemoinho' || s.tipo === 'ancora'
  return (
    <text
      x={s.x}
      y={s.y + h / 2 + tam * 0.95}
      textAnchor="middle"
      fontFamily="'EB Garamond', Georgia, serif"
      fontStyle={mar ? 'italic' : 'normal'}
      fontSize={tam}
      fill={estilo === 'colorido' && mar ? '#E9F1F3' : tinta.texto}
      stroke={mar ? 'none' : estilo === 'colorido' ? 'rgba(243,235,216,.85)' : tinta.terra}
      strokeWidth={mar ? 0 : 2.2}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {s.nome}
    </text>
  )
}

// ---------------------------------------------------------------------------
// decoração: moldura, cartucho, rosa dos ventos, escala
// ---------------------------------------------------------------------------

function niceNumero(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / e
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e
}

interface Caixa {
  w: number
  h: number
}

function posicionar(canto: Canto, cx: Caixa, W: number, H: number, margem: number, pilha: Record<Canto, number>): { x: number; y: number } {
  const desl = pilha[canto]
  pilha[canto] += cx.h + margem * 0.6
  const x = canto.endsWith('o') ? margem : W - margem - cx.w
  const y = canto.startsWith('n') ? margem + desl : H - margem - cx.h - desl
  return { x, y }
}

function Decoracao({ doc }: { doc: MapaDoc }): ReactElement {
  const { largura: W, altura: H, deco, estilo } = doc
  const t = TINTAS[estilo]
  const ink = t.ink
  const papel = t.papel
  const m = Math.round(Math.min(W, H) * 0.045)
  const pilha: Record<Canto, number> = { no: 0, ne: 0, so: 0, se: 0 }
  const out: ReactElement[] = []

  if (deco.moldura) {
    const a = Math.round(Math.min(W, H) * 0.012)
    const b = a + 7
    out.push(
      <g key="moldura" fill="none" stroke={ink}>
        <rect x={a} y={a} width={W - 2 * a} height={H - 2 * a} strokeWidth={3} />
        <rect x={b} y={b} width={W - 2 * b} height={H - 2 * b} strokeWidth={1} />
        {estilo === 'colorido' && <rect x={a + 2.5} y={a + 2.5} width={W - 2 * a - 5} height={H - 2 * a - 5} stroke="#A8432E" strokeWidth={1.4} />}
        {[
          [b, b],
          [W - b, b],
          [b, H - b],
          [W - b, H - b]
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x={-6} y={-6} width={12} height={12} fill={papel} strokeWidth={1.2} />
            <path d="M-3 0h6M0 -3v6" strokeWidth={1} />
          </g>
        ))}
        {Array.from({ length: Math.floor((W - 2 * b) / 40) }, (_, i) => (
          <path key={`t${i}`} d={`M${b + 20 + i * 40} ${a}v${b - a}M${b + 20 + i * 40} ${H - a}v${a - b}`} strokeWidth={0.8} />
        ))}
      </g>
    )
  }

  if (deco.cartucho.on) {
    const titulo = (deco.cartucho.titulo || doc.nome).toLocaleUpperCase('pt-BR')
    const sub = deco.cartucho.subtitulo
    const ts = Math.max(22, Math.min(46, W * 0.026))
    const cw = Math.max(titulo.length * ts * 0.72 + ts * 2.4, sub.length * ts * 0.3 + ts * 2)
    const ch = ts * (sub ? 2.5 : 1.9)
    const { x, y } = posicionar(deco.cartucho.canto, { w: cw, h: ch }, W, H, m, pilha)
    out.push(
      <g key="cartucho" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        <path
          d={`M${ts * 0.5} 0H${cw - ts * 0.5}q0 ${ts * 0.5} ${ts * 0.5} ${ts * 0.5}V${ch - ts * 0.5}q-${ts * 0.5} 0 -${ts * 0.5} ${ts * 0.5}H${ts * 0.5}q0 -${ts * 0.5} -${ts * 0.5} -${ts * 0.5}V${ts * 0.5}q${ts * 0.5} 0 ${ts * 0.5} -${ts * 0.5}z`}
          fill={papel}
          stroke={ink}
          strokeWidth={1.6}
        />
        <rect x={ts * 0.32} y={ts * 0.32} width={cw - ts * 0.64} height={ch - ts * 0.64} fill="none" stroke={ink} strokeWidth={0.7} />
        <text
          x={cw / 2}
          y={sub ? ts * 1.32 : ch / 2 + ts * 0.34}
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', Georgia, serif"
          fontWeight={600}
          fontSize={ts}
          letterSpacing={ts * 0.22}
          fill={t.texto}
        >
          {titulo}
        </text>
        {sub && (
          <text x={cw / 2} y={ts * 2.02} textAnchor="middle" fontFamily="'EB Garamond', Georgia, serif" fontStyle="italic" fontSize={ts * 0.42} fill={t.texto}>
            {sub}
          </text>
        )}
      </g>
    )
  }

  if (deco.rosa.on) {
    const r = deco.rosa.tam
    const box = { w: r * 2.4, h: r * 2.6 }
    const { x, y } = posicionar(deco.rosa.canto, box, W, H, m, pilha)
    const cx = x + box.w / 2
    const cy = y + box.h / 2 + r * 0.12
    const ponta = (ang: number, len: number, larg: number, escuro: string, claro: string): ReactElement => {
      const rad = (ang * Math.PI) / 180
      const px = Math.sin(rad) * len
      const py = -Math.cos(rad) * len
      const lx = Math.sin(rad + Math.PI / 2) * larg
      const ly = -Math.cos(rad + Math.PI / 2) * larg
      return (
        <g key={`${ang}-${len}`}>
          <path d={`M${px.toFixed(2)} ${py.toFixed(2)}L${lx.toFixed(2)} ${ly.toFixed(2)}L0 0z`} fill={escuro} />
          <path d={`M${px.toFixed(2)} ${py.toFixed(2)}L${(-lx).toFixed(2)} ${(-ly).toFixed(2)}L0 0z`} fill={claro} />
        </g>
      )
    }
    const norte = estilo === 'colorido' ? '#A8432E' : ink
    out.push(
      <g key="rosa" transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`} stroke={ink} strokeWidth={0.9} strokeLinejoin="round">
        <circle r={r * 0.78} fill="none" strokeOpacity={0.7} />
        <circle r={r * 0.66} fill="none" strokeDasharray="2 3" />
        {Array.from({ length: 32 }, (_, i) => {
          const a = (i * Math.PI) / 16
          const r1 = r * 0.78
          const r2 = r * (i % 4 === 0 ? 0.9 : 0.84)
          return <path key={i} d={`M${(Math.sin(a) * r1).toFixed(2)} ${(-Math.cos(a) * r1).toFixed(2)}L${(Math.sin(a) * r2).toFixed(2)} ${(-Math.cos(a) * r2).toFixed(2)}`} />
        })}
        {[45, 135, 225, 315].map((a) => ponta(a, r * 0.62, r * 0.09, ink, papel))}
        {[90, 180, 270].map((a) => ponta(a, r, r * 0.14, ink, papel))}
        {ponta(0, r, r * 0.14, norte, papel)}
        <circle r={r * 0.06} fill={papel} />
        <text y={-r * 1.06} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontWeight={600} fontSize={r * 0.3} fill={t.texto} stroke={papel} strokeWidth={3} paintOrder="stroke">
          N
        </text>
      </g>
    )
  }

  if (deco.escala.on && deco.escala.leguasLargura > 0) {
    const porUnidade = deco.escala.leguasLargura / W
    const leguas = niceNumero(W * 0.16 * porUnidade)
    const comp = leguas / porUnidade
    const fs = Math.max(11, Math.min(18, W * 0.009))
    const box = { w: comp + fs * 5, h: fs * 2.6 }
    const { x, y } = posicionar(deco.escala.canto, box, W, H, m, pilha)
    const seg = comp / 4
    const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
    out.push(
      <g key="escala" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} fontFamily="'EB Garamond', Georgia, serif" fontSize={fs} fill={t.texto}>
        <g stroke={papel} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * seg} y={0} width={seg} height={fs * 0.45} fill={i % 2 === 0 ? ink : papel} stroke={ink} strokeWidth={0.8} />
        ))}
        <text x={0} y={fs * 1.6} textAnchor="middle">0</text>
        <text x={comp / 2} y={fs * 1.6} textAnchor="middle">{fmt(leguas / 2)}</text>
        <text x={comp} y={fs * 1.6} textAnchor="start" dx={-fs * 0.3}>
          {fmt(leguas)} {leguas === 1 ? 'légua' : 'léguas'}
        </text>
        </g>
      </g>
    )
  }

  return <g>{out}</g>
}

// ---------------------------------------------------------------------------
// conteúdo completo
// ---------------------------------------------------------------------------

export function MapaDefs({ doc, p }: { doc: MapaDoc; p: string }): ReactElement {
  return (
    <defs>
      <DefsSimbolos estilo={doc.estilo} p={p} />
      <pattern id={`${p}textura`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <path d="M0 0v5" stroke="#000" strokeWidth="1" />
      </pattern>
      <radialGradient id={`${p}vinheta`} cx="50%" cy="50%" r="72%">
        <stop offset="58%" stopColor="#5A4020" stopOpacity="0" />
        <stop offset="100%" stopColor="#5A4020" stopOpacity=".22" />
      </radialGradient>
    </defs>
  )
}

/**
 * Conteúdo do mapa em unidades do mapa (0..largura × 0..altura). Usado no editor
 * (dentro de um <g> com zoom/pan), na miniatura e na exportação.
 */
export function MapaConteudo({ doc, calc, p }: { doc: MapaDoc; calc: TerrenoCalc; p: string }): ReactElement {
  const t = TINTAS[doc.estilo]
  const W = doc.largura
  const H = doc.altura
  const vis = (c: string): boolean => !doc.ocultas.includes(c as MapaDoc['ocultas'][number])
  const rioCor = doc.estilo === 'pena' ? t.ink : '#3F7896'
  const passoGrade = Math.max(60, Math.round(Math.min(W, H) / 10))
  return (
    <g>
      <rect width={W} height={H} fill={t.mar} />
      {vis('terreno') && <TerrenoSvg calc={calc} estilo={doc.estilo} />}
      {doc.deco.grade && (
        <g stroke={t.grade} strokeWidth={1}>
          {Array.from({ length: Math.floor(W / passoGrade) }, (_, i) => (
            <path key={`v${i}`} d={`M${(i + 1) * passoGrade} 0V${H}`} />
          ))}
          {Array.from({ length: Math.floor(H / passoGrade) }, (_, i) => (
            <path key={`h${i}`} d={`M0 ${(i + 1) * passoGrade}H${W}`} />
          ))}
        </g>
      )}
      {vis('rios') && (
        <g>
          {doc.rios.map((r) => (
            <path
              key={r.id}
              d={pathRio(r.pontos, r.largura)}
              fill={rioCor}
              stroke={doc.estilo === 'pena' ? 'none' : '#2F5E73'}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}
      {vis('rotas') && (
        <g fill="none" stroke={t.rota} strokeLinecap="round" strokeLinejoin="round">
          {doc.rotas.map((r) => (
            <path key={r.id} d={pathAberto(r.pontos)} strokeWidth={r.tipo === 'mar' ? 1.4 : 1.8} strokeDasharray={r.tipo === 'mar' ? '9 7' : '4 5'} />
          ))}
        </g>
      )}
      {vis('vegetacao') && <g>{doc.vegetacao.slice().sort(porY).map((s) => <SimboloUso key={s.id} s={s} p={p} />)}</g>}
      {vis('relevo') && <g>{doc.relevo.slice().sort(porY).map((s) => <SimboloUso key={s.id} s={s} p={p} />)}</g>}
      {vis('simbolos') && <g>{doc.simbolos.slice().sort(porY).map((s) => <SimboloUso key={s.id} s={s} p={p} />)}</g>}
      {vis('rotulos') && (
        <g>
          {[...doc.relevo, ...doc.vegetacao, ...doc.simbolos]
            .filter((s) => s.nome)
            .map((s) => (
              <NomeSimbolo key={`n-${s.id}`} s={s} estilo={doc.estilo} />
            ))}
          {doc.rotulos.map((r) => (
            <RotuloSvg key={r.id} r={r} estilo={doc.estilo} p={p} />
          ))}
        </g>
      )}
      {doc.estilo === 'pena' && (
        <>
          <rect width={W} height={H} fill={`url(#${p}textura)`} opacity={0.035} pointerEvents="none" />
          <rect width={W} height={H} fill={`url(#${p}vinheta)`} pointerEvents="none" />
        </>
      )}
      <Decoracao doc={doc} />
    </g>
  )
}

/** SVG completo e autônomo (exportação e miniaturas). */
export function MapaSvg({
  doc,
  calc,
  p,
  largura,
  altura,
  estiloFontes
}: {
  doc: MapaDoc
  calc: TerrenoCalc
  p: string
  largura?: number
  altura?: number
  estiloFontes?: string
}): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${doc.largura} ${doc.altura}`}
      width={largura ?? doc.largura}
      height={altura ?? doc.altura}
      role="img"
      aria-label={`Mapa ${doc.nome}`}
    >
      {estiloFontes ? <style>{estiloFontes}</style> : null}
      <MapaDefs doc={doc} p={p} />
      <MapaConteudo doc={doc} calc={calc} p={p} />
    </svg>
  )
}

export const NOMES_SIMBOLO = Object.fromEntries(Object.entries(SIMBOLOS).map(([k, v]) => [k, v.nome])) as Record<string, string>
