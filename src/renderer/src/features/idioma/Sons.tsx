import { useId, useMemo, useState, type ReactElement } from 'react'
import { gerarPalavras, padraoValido } from './fonologia'
import { Ico } from './icones'
import { CLASSES, type Classe, type Lingua, type Posicao, type Proibicao } from './model'

type Mudar = (fn: (l: Lingua) => Lingua) => void

/** Chips editáveis: × remove, campo adiciona (aceita vários separados por espaço ou vírgula). */
function Chips({ rotulo, itens, onChange, destaque = false, max = 4 }: { rotulo: string; itens: string[]; onChange: (v: string[]) => void; destaque?: boolean; max?: number }): ReactElement {
  const [novo, setNovo] = useState('')
  const id = useId()
  const adicionar = (): void => {
    const add = novo
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase().slice(0, max))
      .filter((s) => s && !itens.includes(s))
    if (add.length) onChange([...itens, ...new Set(add)])
    setNovo('')
  }
  return (
    <div className="idi-bloco">
      <span className="idi-eb" id={id}>{rotulo}</span>
      <ul className="idi-chips" aria-labelledby={id}>
        {itens.map((s) => (
          <li key={s} className={destaque ? 'idi-chip vogal' : 'idi-chip'}>
            {s}
            <button type="button" aria-label={`Remover “${s}”`} onClick={() => onChange(itens.filter((x) => x !== s))}>
              ×
            </button>
          </li>
        ))}
        <li className="idi-chip-add">
          <input
            className="input"
            value={novo}
            aria-label={`Adicionar a ${rotulo.toLowerCase()}`}
            placeholder="+"
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                adicionar()
              }
            }}
            onBlur={adicionar}
          />
        </li>
      </ul>
    </div>
  )
}

const POSICOES: Array<{ id: Posicao; rotulo: string }> = [
  { id: 'fim', rotulo: 'no fim' },
  { id: 'inicio', rotulo: 'no início' },
  { id: 'qualquer', rotulo: 'em lugar nenhum' }
]

export function Sons({ l, mudar }: { l: Lingua; mudar: Mudar }): ReactElement {
  const fonemas = [...l.consoantes, ...l.vogais]
  const padraoOk = padraoValido(l.padraoSilaba)
  const setRegras = (patch: Partial<Lingua['regras']>): void => mudar((x) => ({ ...x, regras: { ...x.regras, ...patch } }))
  const setProib = (i: number, p: Partial<Proibicao>): void =>
    setRegras({ proibicoes: l.regras.proibicoes.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  return (
    <>
      <Chips rotulo="Consoantes" itens={l.consoantes} onChange={(v) => mudar((x) => ({ ...x, consoantes: v }))} />
      <Chips rotulo="Vogais" itens={l.vogais} destaque onChange={(v) => mudar((x) => ({ ...x, vogais: v }))} />

      <div className="idi-bloco">
        <label className="field">
          <span className="idi-eb">Sílaba</span>
          <input
            className="input idi-mono"
            value={l.padraoSilaba}
            aria-invalid={!padraoOk}
            aria-describedby="idi-padrao-dica"
            onChange={(e) => mudar((x) => ({ ...x, padraoSilaba: e.target.value.toUpperCase().slice(0, 24) }))}
          />
        </label>
        <span id="idi-padrao-dica" className={padraoOk ? 'idi-dica' : 'idi-dica err'}>
          {padraoOk ? 'C consoante, V vogal, (…) opcional. CC usa os encontros abaixo.' : 'Use só C, V e parênteses, com ao menos uma V.'}
        </span>
      </div>

      <div className="idi-bloco">
        <span className="idi-eb">Regras</span>
        {l.regras.proibicoes.map((p, i) => (
          <div key={i} className="idi-regra">
            <span>sem</span>
            <select className="select" aria-label="Fonema proibido" value={p.fonema} onChange={(e) => setProib(i, { fonema: e.target.value })}>
              {!fonemas.includes(p.fonema) && <option value={p.fonema}>{p.fonema}</option>}
              {fonemas.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select className="select" aria-label="Posição" value={p.posicao} onChange={(e) => setProib(i, { posicao: e.target.value as Posicao })}>
              {POSICOES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            <button type="button" className="idi-x" aria-label={`Remover regra sem ${p.fonema}`} onClick={() => setRegras({ proibicoes: l.regras.proibicoes.filter((_, j) => j !== i) })}>
              <Ico n="lixo" size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn sm idi-self"
          disabled={!fonemas.length}
          onClick={() => setRegras({ proibicoes: [...l.regras.proibicoes, { fonema: l.consoantes[0] ?? fonemas[0] ?? '', posicao: 'fim' }] })}
        >
          <Ico n="mais" />
          Proibição
        </button>
      </div>

      <Chips rotulo="Encontros permitidos (CC)" itens={l.regras.clusters} max={8} onChange={(v) => setRegras({ clusters: v })} />

      <details className="idi-bloco idi-pesos">
        <summary className="idi-eb">Peso de cada fonema</summary>
        <div className="idi-pesos-grade">
          {fonemas.map((f) => (
            <label key={f} className="idi-peso">
              <span>{f}</span>
              <input
                className="input"
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={l.regras.pesos[f] ?? 1}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) setRegras({ pesos: { ...l.regras.pesos, [f]: Math.min(10, Math.max(0, v)) } })
                }}
              />
            </label>
          ))}
        </div>
      </details>
    </>
  )
}

export function Gerador({ l, mudar, onAdicionar }: { l: Lingua; mudar: Mudar; onAdicionar: (e: { pt: string; termo: string; classe: Classe }) => void }): ReactElement {
  const palavras = useMemo(() => gerarPalavras(l), [l])
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [pt, setPt] = useState('')
  const [classe, setClasse] = useState<Classe>('substantivo')
  const g = l.gerador
  const setG = (patch: Partial<Lingua['gerador']>): void => mudar((x) => ({ ...x, gerador: { ...x.gerador, ...patch } }))
  const intN = (v: string, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(Number(v) || min)))

  const adicionar = (): void => {
    if (!escolhida || !pt.trim()) return
    onAdicionar({ pt: pt.trim(), termo: escolhida, classe })
    setEscolhida(null)
    setPt('')
  }

  return (
    <div className="idi-bloco">
      <div className="idi-linha">
        <span className="idi-eb">Gerador</span>
        <button
          type="button"
          className="btn sm idi-push"
          onClick={() => {
            setEscolhida(null)
            setG({ semente: Math.floor(Math.random() * 4294967295) })
          }}
        >
          <Ico n="sortear" />
          Sortear
        </button>
      </div>
      <div className="idi-gerador-campos">
        <label className="field">
          Semente
          <input className="input" type="number" min={0} value={g.semente} onChange={(e) => setG({ semente: intN(e.target.value, 0, 4294967295) })} />
        </label>
        <label className="field">
          Quantas
          <input className="input" type="number" min={1} max={60} value={g.quantidade} onChange={(e) => setG({ quantidade: intN(e.target.value, 1, 60) })} />
        </label>
        <label className="field">
          Sílabas de
          <input className="input" type="number" min={1} max={6} value={g.silabasMin} onChange={(e) => {
            const v = intN(e.target.value, 1, 6)
            setG({ silabasMin: v, silabasMax: Math.max(v, g.silabasMax) })
          }} />
        </label>
        <label className="field">
          até
          <input className="input" type="number" min={1} max={6} value={g.silabasMax} onChange={(e) => {
            const v = intN(e.target.value, 1, 6)
            setG({ silabasMax: v, silabasMin: Math.min(v, g.silabasMin) })
          }} />
        </label>
      </div>
      {palavras.length ? (
        <ul className="idi-palavras" aria-label="Palavras geradas">
          {palavras.map((w) => (
            <li key={w}>
              <button type="button" className="idi-gerada" aria-pressed={escolhida === w} onClick={() => setEscolhida(escolhida === w ? null : w)}>
                {w}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="idi-dica">Sem palavras: confira vogais, consoantes e regras.</p>
      )}
      {escolhida && (
        <form
          className="idi-addlex panel"
          onSubmit={(e) => {
            e.preventDefault()
            adicionar()
          }}
        >
          <span className="idi-termo">{escolhida}</span>
          <label className="field">
            Significado em português
            <input className="input" autoFocus value={pt} onChange={(e) => setPt(e.target.value)} placeholder="ex.: farol" />
          </label>
          <label className="field">
            Classe
            <select className="select" value={classe} onChange={(e) => setClasse(e.target.value as Classe)}>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn sm pri" disabled={!pt.trim()}>
            <Ico n="mais" />
            Adicionar ao léxico
          </button>
        </form>
      )}
    </div>
  )
}
