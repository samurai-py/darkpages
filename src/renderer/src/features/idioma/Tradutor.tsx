import { useMemo, useState, type ReactElement } from 'react'
import { call } from '../../api'
import { TextoEmGlifos } from './GlifoView'
import { Ico } from './icones'
import type { Classe, Lingua, TraducaoIA } from './model'
import { normalizar, traduzir, type Sugestao } from './tradutor'

export interface NovaEntrada {
  pt: string
  termo: string
  classe: Classe
  nota?: string
}

interface Props {
  l: Lingua
  dir: string
  texto: string
  setTexto: (t: string) => void
  onAdicionar: (e: NovaEntrada[]) => void
  /** grava o estado atual antes de chamar a IA (ela lê a língua salva) */
  salvar: () => Promise<void>
}

export function Tradutor({ l, dir, texto, setTexto, onAdicionar, salvar }: Props): ReactElement {
  const t = useMemo(() => traduzir(l, texto), [l, texto])
  const [ia, setIa] = useState<TraducaoIA | null>(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)
  const noLexico = useMemo(() => new Set(l.lexico.map((e) => normalizar(e.pt))), [l.lexico])

  const refinar = async (): Promise<void> => {
    setIaBusy(true)
    setIaErro(null)
    try {
      await salvar()
      setIa(await call<TraducaoIA>('idioma.traduzirIA', dir, l.id, texto, t.texto))
    } catch (e) {
      setIaErro(e instanceof Error ? e.message : String(e))
    } finally {
      setIaBusy(false)
    }
  }

  const pendentes = (lista: Sugestao[]): Sugestao[] => lista.filter((s) => !noLexico.has(normalizar(s.pt)))
  const novasRegra = pendentes(t.novas)
  const novasIa = ia ? pendentes(ia.novas) : []

  return (
    <section className="idi-sec" aria-label="Tradutor">
      <div className="panel idi-trad">
        <div className="idi-linha">
          <span className="idi-eb">Tradutor</span>
          <span className="pill">português → {l.nome}</span>
          <span className="pill">ordem <b>{l.morfologia.ordem}</b></span>
        </div>
        <label className="idi-sr" htmlFor="idi-pt">
          Texto em português
        </label>
        <textarea id="idi-pt" className="idi-pt" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma frase em português" />

        {t.texto ? (
          <>
            <div className="idi-glifos-linha" key={t.texto}>
              <TextoEmGlifos texto={t.texto} glifos={l.glifos} altura={34} />
            </div>
            <p className="idi-romano" lang="und">
              {t.texto}
            </p>
            <ol className="idi-glosa" aria-label="Glosa palavra a palavra">
              {t.tokens
                .filter((k) => k.tipo !== 'pontuacao')
                .map((k, i) => (
                  <li key={i} className={`idi-glosa-item ${k.tipo}`}>
                    <b>{k.termo}</b>
                    <span>{k.glosa}</span>
                    {k.tipo === 'novo' && <em>novo</em>}
                    {k.tipo === 'nome' && <em>nome</em>}
                  </li>
                ))}
            </ol>
          </>
        ) : (
          <p className="idi-dica">A tradução aparece aqui, em glifos, romanizada e com glosa.</p>
        )}

        {novasRegra.length > 0 && (
          <div className="idi-novas">
            <div className="idi-linha">
              <span className="idi-eb">Sem tradução no léxico</span>
              <button type="button" className="btn sm idi-push" onClick={() => onAdicionar(novasRegra)}>
                <Ico n="mais" />
                Adicionar todas
              </button>
            </div>
            <ul>
              {novasRegra.map((s) => (
                <li key={s.pt}>
                  <span>{s.pt}</span>
                  <span aria-hidden="true">→</span>
                  <b className="idi-termo">{s.termo}</b>
                  <span className="idi-dica">{s.classe}</span>
                  <button type="button" className="btn sm" onClick={() => onAdicionar([s])} aria-label={`Adicionar ${s.pt} = ${s.termo} ao léxico`}>
                    <Ico n="mais" />
                    Adicionar
                  </button>
                </li>
              ))}
            </ul>
            <p className="idi-dica">Termos criados pela fonotática, sempre os mesmos para a mesma palavra. Verbos conjugados entram como foram escritos; ajuste para o infinitivo no léxico.</p>
          </div>
        )}

        <div className="idi-linha">
          <button type="button" className="btn sm" onClick={() => void refinar()} disabled={iaBusy || !texto.trim()} aria-busy={iaBusy}>
            <Ico n="ia" />
            {iaBusy ? 'Refinando…' : 'Refinar com IA'}
          </button>
          <span className="idi-dica">Opcional. Usa o léxico e as regras como contexto.</span>
        </div>
        {iaErro && (
          <p className="err" role="alert">
            {iaErro}
          </p>
        )}
      </div>

      {ia && (
        <div className="panel idi-trad" aria-live="polite">
          <div className="idi-linha">
            <span className="idi-eb">Sugestão da IA</span>
            <button type="button" className="btn sm idi-push" onClick={() => setIa(null)}>
              Descartar
            </button>
          </div>
          <div className="idi-glifos-linha" key={ia.traducao}>
            <TextoEmGlifos texto={ia.traducao} glifos={l.glifos} altura={30} />
          </div>
          <p className="idi-romano">{ia.traducao}</p>
          {ia.glosa.length > 0 && (
            <ol className="idi-glosa" aria-label="Glosa da IA">
              {ia.glosa.map((g, i) => (
                <li key={i} className="idi-glosa-item lexico">
                  <b>{g.termo}</b>
                  <span>{g.pt}</span>
                </li>
              ))}
            </ol>
          )}
          {ia.nota && <p className="idi-dica">{ia.nota}</p>}
          {novasIa.length > 0 && (
            <div className="idi-novas">
              <div className="idi-linha">
                <span className="idi-eb">Palavras novas propostas</span>
                <button type="button" className="btn sm idi-push" onClick={() => onAdicionar(novasIa.map((n) => ({ ...n, nota: 'sugerida pela IA' })))}>
                  <Ico n="mais" />
                  Adicionar todas
                </button>
              </div>
              <ul>
                {novasIa.map((s) => (
                  <li key={`${s.pt}-${s.termo}`}>
                    <span>{s.pt}</span>
                    <span aria-hidden="true">→</span>
                    <b className="idi-termo">{s.termo}</b>
                    <span className="idi-dica">{s.classe}</span>
                    <button type="button" className="btn sm" onClick={() => onAdicionar([{ ...s, nota: 'sugerida pela IA' }])} aria-label={`Adicionar ${s.pt} = ${s.termo} ao léxico`}>
                      <Ico n="mais" />
                      Adicionar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
