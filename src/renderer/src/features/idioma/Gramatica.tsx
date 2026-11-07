import type { ReactElement } from 'react'
import { Ico } from './icones'
import { ORDENS, type Lingua, type Morfologia, type Ordem } from './model'
import { sufixar } from './tradutor'

const NOMES_ORDEM: Record<Ordem, string> = {
  SVO: 'sujeito · verbo · objeto',
  SOV: 'sujeito · objeto · verbo',
  VSO: 'verbo · sujeito · objeto',
  VOS: 'verbo · objeto · sujeito',
  OVS: 'objeto · verbo · sujeito',
  OSV: 'objeto · sujeito · verbo'
}

export function Gramatica({ l, mudar, onExcluir }: { l: Lingua; mudar: (fn: (l: Lingua) => Lingua) => void; onExcluir: () => void }): ReactElement {
  const m = l.morfologia
  const setM = (p: Partial<Morfologia>): void => mudar((x) => ({ ...x, morfologia: { ...x.morfologia, ...p } }))
  const exemplo = l.lexico.find((e) => e.classe === 'substantivo')?.termo ?? 'dorran'
  const exVerbo = l.lexico.find((e) => e.classe === 'verbo')?.termo ?? 'ush'
  const fonemas = [...l.consoantes, ...l.vogais]

  return (
    <section className="idi-sec" aria-label="Gramática">
      <div className="panel idi-form">
        <span className="idi-eb">Língua</span>
        <label className="field">
          Nome
          <input className="input" value={l.nome} maxLength={80} onChange={(e) => mudar((x) => ({ ...x, nome: e.target.value }))} />
        </label>
        <label className="field">
          Descrição (quem fala, onde, como soa)
          <textarea className="input idi-area" rows={3} value={l.descricao} onChange={(e) => mudar((x) => ({ ...x, descricao: e.target.value }))} />
        </label>
        <p className="idi-dica">A fonte gerada fica em fonte-{l.id}.otf; o nome do arquivo não muda ao renomear.</p>
      </div>

      <div className="panel idi-form">
        <span className="idi-eb">Morfologia</span>
        <div className="idi-grade3">
          <label className="field">
            Plural
            <input className="input idi-termo" value={m.plural} maxLength={12} onChange={(e) => setM({ plural: e.target.value })} />
            <span className="idi-dica">{exemplo} → {sufixar(exemplo, m.plural)}</span>
          </label>
          <label className="field">
            Passado
            <input className="input idi-termo" value={m.passado} maxLength={12} onChange={(e) => setM({ passado: e.target.value })} />
            <span className="idi-dica">{exVerbo} → {sufixar(exVerbo, m.passado)}</span>
          </label>
          <label className="field">
            Feminino
            <input className="input idi-termo" value={m.feminino} maxLength={12} onChange={(e) => setM({ feminino: e.target.value })} />
            <span className="idi-dica">{exemplo} → {sufixar(exemplo, m.feminino)}</span>
          </label>
        </div>
        <label className="field">
          Ordem das palavras
          <select className="select" value={m.ordem} onChange={(e) => setM({ ordem: e.target.value as Ordem })}>
            {ORDENS.map((o) => (
              <option key={o} value={o}>
                {o} · {NOMES_ORDEM[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={m.omitirArtigos} onChange={(e) => setM({ omitirArtigos: e.target.checked })} />
          A língua não tem artigos (o, a, um, uma somem na tradução quando não estão no léxico)
        </label>
      </div>

      <div className="panel idi-form">
        <span className="idi-eb">Romanização</span>
        <p className="idi-dica">Como cada som se escreve em letras latinas. Em branco, vale o próprio símbolo. Os glifos seguem a grafia daqui.</p>
        <div className="idi-roman">
          {fonemas.map((f) => (
            <label key={f} className="idi-peso">
              <span>{f}</span>
              <input
                className="input idi-termo"
                value={l.romanizacao[f] ?? ''}
                placeholder={f}
                maxLength={6}
                aria-label={`Grafia de ${f}`}
                onChange={(e) =>
                  mudar((x) => {
                    const r = { ...x.romanizacao }
                    if (e.target.value.trim()) r[f] = e.target.value
                    else delete r[f]
                    return { ...x, romanizacao: r }
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="idi-linha">
        <button type="button" className="btn sm idi-perigo" onClick={onExcluir}>
          <Ico n="lixo" />
          Excluir {l.nome}
        </button>
      </div>
    </section>
  )
}
