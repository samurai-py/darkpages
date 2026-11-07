import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { Ficha, FichaCampo, FichaRelacao, FichaTipo } from '../../../../shared/models'
import { AparicoesFaixa } from './Aparicoes'
import { TIPOS, TIPO_ROTULO, porNome, trocarTipo } from './fichas'
import { Mini } from './icons'
import { Retrato } from './Retrato'

export interface FichaPanelProps {
  dir: string
  ficha: Ficha
  todas: Ficha[]
  grupos: string[]
  retratoUrl: string | null | undefined
  /** há alterações ainda não gravadas desta ficha */
  pendente: boolean
  status: string
  focarNome: boolean
  onChange: (f: Ficha) => void
  onEnviarRetrato: (file: File) => Promise<void>
  onGerarRetrato: () => void
  onExcluir: () => Promise<void>
  onAbrirFicha: (id: string) => void
  onAbrirCapitulo: (file: string) => void
  onFechar: () => void
}

export function FichaPanel(props: FichaPanelProps): ReactElement {
  const { ficha: f, todas, onChange } = props
  const uid = useId()
  const nomeRef = useRef<HTMLInputElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [apelido, setApelido] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    setConfirmar(false)
    setErro('')
    setApelido('')
    if (props.focarNome) {
      nomeRef.current?.focus()
      nomeRef.current?.select()
    }
    // roda só ao trocar de ficha
  }, [f.id])

  const set = (patch: Partial<Ficha>): void => onChange({ ...f, ...patch })
  const setCampo = (i: number, patch: Partial<FichaCampo>): void =>
    set({ campos: f.campos.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const setRelacao = (i: number, patch: Partial<FichaRelacao>): void =>
    set({ relacoes: f.relacoes.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  const addApelido = (): void => {
    const a = apelido.trim()
    if (a && !f.apelidos.includes(a)) set({ apelidos: [...f.apelidos, a] })
    setApelido('')
  }
  const onApelidoKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addApelido()
    } else if (e.key === 'Backspace' && !apelido && f.apelidos.length) {
      set({ apelidos: f.apelidos.slice(0, -1) })
    }
  }

  const outras = todas.filter((o) => o.id !== f.id).sort(porNome)
  const nomeDe = (id: string): string => todas.find((o) => o.id === id)?.nome ?? 'ficha ausente'
  const reciprocas = todas
    .filter((o) => o.id !== f.id)
    .flatMap((o) => o.relacoes.filter((r) => r.alvo === f.id).map((r) => ({ de: o, rotulo: r.rotulo })))

  const enviar = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setOcupado('Enviando retrato…')
    setErro('')
    try {
      await props.onEnviarRetrato(file)
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setOcupado('')
    }
  }

  const excluir = async (): Promise<void> => {
    setOcupado('Excluindo…')
    try {
      await props.onExcluir()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setOcupado('')
    }
  }

  const subtitulo = [f.papel || TIPO_ROTULO[f.tipo].um, f.grupo].filter(Boolean).join(' · ')

  return (
    <aside className="uv-aside" aria-label={`Ficha: ${f.nome}`}>
      <div className="uv-hero">
        <Retrato className="uv-hero-img" ficha={f} url={props.retratoUrl} />
        <div className="uv-hero-fade" aria-hidden="true" />
        <div className="uv-hero-acts">
          <button type="button" className="btn sm uv-glass" onClick={props.onGerarRetrato}>
            <Mini name="faisca" /> Gerar retrato
          </button>
          <button type="button" className="btn sm uv-glass" onClick={() => arquivoRef.current?.click()} disabled={!!ocupado}>
            <Mini name="enviar" /> Enviar imagem
          </button>
          {f.retrato && (
            <button type="button" className="btn sm uv-glass" onClick={() => set({ retrato: '' })} aria-label="Remover retrato">
              <Mini name="fechar" />
            </button>
          )}
          <input ref={arquivoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void enviar(e)} />
        </div>
        <button type="button" className="uv-x" onClick={props.onFechar} aria-label="Fechar ficha">
          <Mini name="fechar" />
        </button>
        <div className="uv-hero-txt">
          <span className="uv-eb uv-acc">{subtitulo}</span>
          <input
            ref={nomeRef}
            className="uv-nome disp"
            value={f.nome}
            aria-label="Nome"
            onChange={(e) => set({ nome: e.target.value })}
          />
        </div>
      </div>

      <div className="uv-body">
        <p className="uv-status label" role="status">
          {ocupado || props.status}
        </p>
        {erro && <p className="err">{erro}</p>}

        <div className="uv-grid2">
          <label className="field">
            Tipo
            <select className="select" value={f.tipo} onChange={(e) => onChange(trocarTipo(f, e.target.value as FichaTipo))}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_ROTULO[t].um}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Papel
            <input className="input" value={f.papel} placeholder="protagonista, capital…" onChange={(e) => set({ papel: e.target.value })} />
          </label>
          <label className="field uv-span2">
            Grupo
            <input
              className="input"
              value={f.grupo}
              list={`${uid}-grupos`}
              placeholder="Casa, facção, região…"
              onChange={(e) => set({ grupo: e.target.value })}
            />
            <datalist id={`${uid}-grupos`}>
              {props.grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
        </div>

        <section className="uv-sec">
          <h3 className="uv-eb" id={`${uid}-ap`}>
            Apelidos
          </h3>
          <div className="uv-chips" role="group" aria-labelledby={`${uid}-ap`}>
            {f.apelidos.map((a) => (
              <span key={a} className="pill uv-chip">
                {a}
                <button
                  type="button"
                  className="uv-chipx"
                  aria-label={`Remover apelido ${a}`}
                  onClick={() => set({ apelidos: f.apelidos.filter((x) => x !== a) })}
                >
                  <Mini name="fechar" size={12} />
                </button>
              </span>
            ))}
            <input
              className="uv-chipin"
              value={apelido}
              placeholder={f.apelidos.length ? 'mais um…' : 'outro nome usado no texto'}
              aria-label="Novo apelido (Enter para adicionar)"
              onChange={(e) => setApelido(e.target.value)}
              onKeyDown={onApelidoKey}
              onBlur={addApelido}
            />
          </div>
        </section>

        <section className="uv-sec">
          <h3 className="uv-eb">Atributos</h3>
          <div className="uv-campos">
            {f.campos.map((c, i) => (
              <div className="uv-campo" key={i}>
                <input
                  className="uv-cnome"
                  value={c.nome}
                  aria-label={`Nome do atributo ${i + 1}`}
                  onChange={(e) => setCampo(i, { nome: e.target.value })}
                />
                <input
                  className="input uv-cval"
                  value={c.valor}
                  aria-label={c.nome || `Valor do atributo ${i + 1}`}
                  placeholder="—"
                  onChange={(e) => setCampo(i, { valor: e.target.value })}
                />
                <button
                  type="button"
                  className="uv-ico"
                  aria-label={`Remover atributo ${c.nome || i + 1}`}
                  onClick={() => set({ campos: f.campos.filter((_, j) => j !== i) })}
                >
                  <Mini name="lixo" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn sm uv-self" onClick={() => set({ campos: [...f.campos, { nome: 'Novo campo', valor: '' }] })}>
            <Mini name="mais" /> Campo
          </button>
        </section>

        <section className="uv-sec">
          <h3 className="uv-eb">Relações</h3>
          {f.relacoes.length === 0 && reciprocas.length === 0 && <p className="label">Nenhuma relação ainda.</p>}
          <div className="uv-rels">
            {f.relacoes.map((r, i) => (
              <div className="uv-rel" key={i}>
                <input
                  className="input"
                  value={r.rotulo}
                  placeholder="aprendiz de"
                  aria-label={`Rótulo da relação ${i + 1}`}
                  onChange={(e) => setRelacao(i, { rotulo: e.target.value })}
                />
                <select
                  className="select"
                  value={r.alvo}
                  aria-label={`Ficha da relação ${i + 1}`}
                  onChange={(e) => setRelacao(i, { alvo: e.target.value })}
                >
                  {!todas.some((o) => o.id === r.alvo) && <option value={r.alvo}>(ficha ausente)</option>}
                  {outras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="uv-ico"
                  aria-label={`Abrir ${nomeDe(r.alvo)}`}
                  disabled={!todas.some((o) => o.id === r.alvo)}
                  onClick={() => props.onAbrirFicha(r.alvo)}
                >
                  <Mini name="abrir" />
                </button>
                <button
                  type="button"
                  className="uv-ico"
                  aria-label={`Remover relação com ${nomeDe(r.alvo)}`}
                  onClick={() => set({ relacoes: f.relacoes.filter((_, j) => j !== i) })}
                >
                  <Mini name="lixo" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn sm uv-self"
            disabled={outras.length === 0}
            onClick={() => {
              const alvo = outras[0]
              if (alvo) set({ relacoes: [...f.relacoes, { alvo: alvo.id, rotulo: '' }] })
            }}
          >
            <Mini name="ligar" /> Relação
          </button>
          {reciprocas.length > 0 && (
            <div className="uv-recip">
              <span className="label">Citada por</span>
              <div className="uv-chips">
                {reciprocas.map((r, i) => (
                  <button key={`${r.de.id}-${i}`} type="button" className="pill uv-pillbtn" onClick={() => props.onAbrirFicha(r.de.id)}>
                    <b>{r.de.nome}</b> {r.rotulo || 'ligada a'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <AparicoesFaixa
          dir={props.dir}
          fichaId={f.id}
          termos={[f.nome, ...f.apelidos].join('|')}
          pendente={props.pendente}
          onAbrir={props.onAbrirCapitulo}
        />

        <label className="uv-sec">
          <span className="uv-eb">Anotações</span>
          <textarea
            className="uv-notas"
            value={f.notas}
            placeholder="Segredos, manias, história…"
            onChange={(e) => set({ notas: e.target.value })}
          />
        </label>

        <div className="uv-danger">
          {!confirmar ? (
            <button type="button" className="btn sm" onClick={() => setConfirmar(true)}>
              <Mini name="lixo" /> Excluir ficha
            </button>
          ) : (
            <div className="uv-confirm" role="alertdialog" aria-label="Confirmar exclusão">
              <span>
                Excluir <b>{f.nome}</b>? As relações e ligações no enredo que apontam para ela também saem.
              </span>
              <div className="uv-row">
                <button type="button" className="btn sm pri" onClick={() => void excluir()} disabled={!!ocupado} autoFocus>
                  Excluir
                </button>
                <button type="button" className="btn sm" onClick={() => setConfirmar(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
