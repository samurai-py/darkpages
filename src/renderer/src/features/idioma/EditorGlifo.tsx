import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import { tracoD } from './glifos'
import { Ico } from './icones'
import { GRADE, type Glifo, type PontoGlifo } from './model'

type Ferramenta = 'traco' | 'curva' | 'mover' | 'apagar'

const FERRAMENTAS: Array<{ id: Ferramenta; rotulo: string; dica: string }> = [
  { id: 'traco', rotulo: 'Traço', dica: 'Clique nos pontos da grade para desenhar linhas' },
  { id: 'curva', rotulo: 'Curva', dica: 'O próximo ponto puxa a curva; depois marque o fim com Traço' },
  { id: 'mover', rotulo: 'Mover', dica: 'Arraste um ponto existente' },
  { id: 'apagar', rotulo: 'Apagar', dica: 'Clique num ponto para removê-lo' }
]

const LADO = 264
const LINHA_BASE = 20
const lim = (v: number): number => Math.min(GRADE, Math.max(0, v))

interface Ref {
  t: number
  p: number
}

/** Editor de glifo: grade 0..24, traços por pontos, curvas quadráticas, mover/apagar e espessura. */
export function EditorGlifo({ chave, glifo, onChange }: { chave: string; glifo: Glifo; onChange: (g: Glifo) => void }): ReactElement {
  const [ferr, setFerr] = useState<Ferramenta>('traco')
  const [ativo, setAtivo] = useState<number | null>(null)
  const [cursor, setCursor] = useState<[number, number]>([12, 12])
  const [pegado, setPegado] = useState<Ref | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const svg = useRef<SVGSVGElement>(null)

  const tracos = glifo.tracos
  const set = (t: PontoGlifo[][]): void => onChange({ ...glifo, tracos: t.filter((x) => x.length) })

  const pontoDoEvento = (e: PointerEvent<SVGSVGElement>): [number, number] | null => {
    const el = svg.current
    const m = el?.getScreenCTM()
    if (!el || !m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [lim(Math.round(p.x)), lim(Math.round(p.y))]
  }

  const maisProximo = (x: number, y: number, raio = 0.9): Ref | null => {
    let melhor: Ref | null = null
    let dist = raio
    tracos.forEach((t, ti) =>
      t.forEach((p, pi) => {
        const d = Math.hypot(p[0] - x, p[1] - y)
        if (d <= dist) {
          dist = d
          melhor = { t: ti, p: pi }
        }
      })
    )
    return melhor
  }

  const aplicar = (x: number, y: number): void => {
    if (ferr === 'traco' || ferr === 'curva') {
      const ponto: PontoGlifo = ferr === 'curva' ? [x, y, 1] : [x, y]
      if (ativo === null || !tracos[ativo]) {
        set([...tracos, [[x, y]]])
        // traço começa sempre num ponto de linha; na Curva, o clique seguinte é o ponto de controle
        setAtivo(tracos.length)
        return
      }
      const t = tracos[ativo] as PontoGlifo[]
      const ultimo = t[t.length - 1] as PontoGlifo
      if (ultimo[0] === x && ultimo[1] === y && ultimo[2] === ponto[2]) return
      set(tracos.map((tr, i) => (i === ativo ? [...tr, ponto] : tr)))
      // depois do ponto de controle, o próximo clique fecha a curva
      if (ferr === 'curva') setFerr('traco')
      return
    }
    if (ferr === 'apagar') {
      const r = maisProximo(x, y)
      if (!r) return
      const novo = tracos.map((t, i) => (i === r.t ? t.filter((_, j) => j !== r.p) : t))
      set(novo)
      if (novo[r.t]?.length === 0) setAtivo(null)
      return
    }
    // mover via teclado: Enter pega, setas movem, Enter solta
    if (pegado) setPegado(null)
    else {
      const r = maisProximo(x, y)
      if (r) {
        setPegado(r)
        setAtivo(r.t)
      }
    }
  }

  const moverPara = (r: Ref, x: number, y: number): void => {
    set(tracos.map((t, i) => (i === r.t ? t.map((p, j) => (j === r.p ? (p[2] === 1 ? [x, y, 1] : [x, y]) : p) as PontoGlifo) : t)))
  }

  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    const p = pontoDoEvento(e)
    if (!p) return
    setCursor(p)
    if (ferr === 'mover') {
      const r = maisProximo(p[0], p[1], 1.2)
      if (r) {
        setPegado(r)
        setAtivo(r.t)
        setArrastando(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      return
    }
    aplicar(p[0], p[1])
  }

  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const p = pontoDoEvento(e)
    if (!p) return
    if (p[0] !== cursor[0] || p[1] !== cursor[1]) setCursor(p)
    if (arrastando && pegado) moverPara(pegado, p[0], p[1])
  }

  const onUp = (): void => {
    if (arrastando) {
      setArrastando(false)
      setPegado(null)
    }
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>): void => {
    const passo: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const d = passo[e.key]
    if (d) {
      e.preventDefault()
      const n: [number, number] = [lim(cursor[0] + d[0]), lim(cursor[1] + d[1])]
      setCursor(n)
      if (pegado) moverPara(pegado, n[0], n[1])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      aplicar(cursor[0], cursor[1])
    } else if (e.key === 'Escape') {
      setAtivo(null)
      setPegado(null)
    }
  }

  const desfazer = (): void => {
    const i = ativo ?? tracos.length - 1
    const t = tracos[i]
    if (!t) return
    const novo = tracos.map((x, j) => (j === i ? x.slice(0, -1) : x))
    set(novo)
    if (!novo[i]?.length) setAtivo(null)
  }

  const linhas: ReactElement[] = []
  for (let i = 0; i <= GRADE; i++) {
    const forte = i % 4 === 0
    linhas.push(
      <line key={`v${i}`} x1={i} y1={0} x2={i} y2={GRADE} className={forte ? 'idi-grade forte' : 'idi-grade'} />,
      <line key={`h${i}`} x1={0} y1={i} x2={GRADE} y2={i} className={forte ? 'idi-grade forte' : 'idi-grade'} />
    )
  }

  const dicaAtual = FERRAMENTAS.find((f) => f.id === ferr)?.dica ?? ''

  return (
    <div className="idi-editor">
      <svg
        ref={svg}
        width={LADO}
        height={LADO}
        viewBox="-1 -1 26 26"
        className="idi-editor-svg"
        role="application"
        tabIndex={0}
        aria-label={`Editor do glifo “${chave}”. Setas movem o cursor, Enter aplica a ferramenta ${FERRAMENTAS.find((f) => f.id === ferr)?.rotulo}, Esc encerra o traço.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <rect x={0} y={0} width={GRADE} height={GRADE} className="idi-editor-fundo" />
        {linhas}
        <line x1={0} y1={LINHA_BASE} x2={GRADE} y2={LINHA_BASE} className="idi-base" />
        {tracos.map((t, i) => (
          <path
            key={i}
            d={tracoD(t)}
            fill="none"
            className={i === ativo ? 'idi-traco ativo' : 'idi-traco'}
            strokeWidth={glifo.espessura}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {tracos.map((t, ti) =>
          t.map((p, pi) => {
            if (p[2] !== 1) return null
            const a = t[pi - 1]
            const b = t[pi + 1]
            return (
              <g key={`g${ti}-${pi}`} className="idi-alca">
                {a && <line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} />}
                {b && <line x1={p[0]} y1={p[1]} x2={b[0]} y2={b[1]} />}
              </g>
            )
          })
        )}
        {tracos.map((t, ti) =>
          t.map((p, pi) => {
            const sel = pegado?.t === ti && pegado.p === pi
            const cls = `idi-ponto${ti === ativo ? ' ativo' : ''}${sel ? ' sel' : ''}`
            return p[2] === 1 ? (
              <rect key={`p${ti}-${pi}`} x={p[0] - 0.45} y={p[1] - 0.45} width={0.9} height={0.9} className={cls} />
            ) : (
              <circle key={`p${ti}-${pi}`} cx={p[0]} cy={p[1]} r={0.5} className={cls} />
            )
          })
        )}
        <g className="idi-cursor" aria-hidden="true">
          <line x1={cursor[0] - 0.9} y1={cursor[1]} x2={cursor[0] + 0.9} y2={cursor[1]} />
          <line x1={cursor[0]} y1={cursor[1] - 0.9} x2={cursor[0]} y2={cursor[1] + 0.9} />
        </g>
      </svg>

      <div className="idi-ferramentas" role="toolbar" aria-label="Ferramentas do glifo">
        {FERRAMENTAS.map((f) => (
          <button key={f.id} type="button" className="btn sm" aria-pressed={ferr === f.id} title={f.dica} onClick={() => setFerr(f.id)}>
            <Ico n={f.id} />
            {f.rotulo}
          </button>
        ))}
      </div>
      <p className="idi-dica" aria-live="polite">
        {dicaAtual}. Ponto ({cursor[0]}, {cursor[1]}){ativo !== null ? ` · traço ${ativo + 1} de ${tracos.length}` : ''}.
      </p>
      <div className="idi-ferramentas">
        <button type="button" className="btn sm" onClick={() => setAtivo(null)} disabled={ativo === null}>
          <Ico n="novoTraco" />
          Novo traço
        </button>
        <button type="button" className="btn sm" onClick={desfazer} disabled={!tracos.length}>
          <Ico n="desfazer" />
          Desfazer ponto
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={!tracos.length}
          onClick={() => {
            set([])
            setAtivo(null)
          }}
        >
          <Ico n="lixo" />
          Limpar
        </button>
      </div>
      <label className="field idi-espessura">
        Espessura · {glifo.espessura.toFixed(1)}
        <input
          type="range"
          min={0.6}
          max={4}
          step={0.1}
          value={glifo.espessura}
          onChange={(e) => onChange({ ...glifo, espessura: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
