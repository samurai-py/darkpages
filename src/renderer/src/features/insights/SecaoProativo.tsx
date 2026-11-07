import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { ia } from '../ia/api'
import { Ico } from '../ia/icones'
import type { InsightTipo, ProativoEstado, ProativoModo, ProativoSettings } from '../../../../shared/models'
import { NOME_TIPO_INSIGHT } from './tipos'

/** Ajustes → IA → Modo proativo (seção "proativo"). */

const MODOS: Array<{ id: ProativoModo; nome: string; desc: string }> = [
  { id: 'off', nome: 'Desligado', desc: 'O Folio só analisa quando você pede.' },
  {
    id: 'leve',
    nome: 'Leve',
    desc: 'Checagens locais (repetições, continuidade pelas fichas) nas pausas. A IA só roda quando você troca de capítulo.'
  },
  { id: 'completo', nome: 'Completo', desc: 'Checagens locais e IA nas pausas e trocas de capítulo, e uma sugestão de retomada no resumo do dia.' }
]

const DESC_TIPO: Record<InsightTipo, string> = {
  continuidade: 'contradições com as fichas',
  estilo: 'repetições próximas e frases a enxugar',
  ideias: 'ideias para seguir a cena',
  pistas: 'pistas plantadas e a plantar',
  resumo: 'resumo do dia ao abrir o livro'
}

export function SecaoProativo(): ReactElement {
  const [est, setEst] = useState<ProativoEstado | null>(null)
  const [form, setForm] = useState<ProativoSettings | null>(null)
  const [fb, setFb] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ia.proativo()
      .then((e) => {
        setEst(e)
        setForm(e.config)
      })
      .catch((e: unknown) => setFb({ tipo: 'erro', msg: (e as Error).message }))
  }, [])

  if (!form) {
    return (
      <section className="aj-sec" aria-labelledby="aj-h-pro">
        <h2 id="aj-h-pro" className="disp">Modo proativo</h2>
        {fb ? <p className="err">{fb.msg}</p> : <p className="aj-hint">Carregando…</p>}
      </section>
    )
  }

  const set = (patch: Partial<ProativoSettings>): void => {
    setForm({ ...form, ...patch })
    setFb(null)
  }

  const salvar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setSalvando(true)
    try {
      await ia.salvarProativo(form)
      const novo = await ia.proativo()
      setEst(novo)
      setForm(novo.config)
      setFb({ tipo: 'ok', msg: `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` })
    } catch (err) {
      setFb({ tipo: 'erro', msg: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  const numero = (v: string, padrao: number): number => {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : padrao
  }

  return (
    <form className="aj-sec aj-pro" onSubmit={(e) => void salvar(e)} aria-labelledby="aj-h-pro">
      <header className="aj-sh">
        <h2 id="aj-h-pro" className="disp">Modo proativo</h2>
        <p>
          O Folio observa enquanto você escreve e deixa observações no sininho do topo, sem interromper. Nada dispara no modo foco nem no horário
          silencioso, e nada é aplicado no texto sem você clicar.
        </p>
      </header>

      {est && form.modo !== 'off' && (
        <p className="aj-alerta" role="note">
          <Ico n={est.externo ? 'nuvem' : 'local'} size={16} />
          {!est.iaLigada
            ? 'A IA está desligada: só as checagens locais rodam, e nada sai do computador.'
            : est.externo
              ? `Quando a IA proativa roda, trechos do capítulo vão para ${est.nomeProvedor} (modelo: ${est.modeloAutomatico}). As checagens locais não saem do computador.`
              : `A IA proativa roda em ${est.nomeProvedor}; nada sai do computador.`}
        </p>
      )}

      <fieldset className="aj-prov">
        <legend className="label">Intensidade</legend>
        {MODOS.map((m) => (
          <label key={m.id} className={`aj-opt ${form.modo === m.id ? 'on' : ''}`}>
            <input type="radio" name="proativo-modo" value={m.id} checked={form.modo === m.id} onChange={() => set({ modo: m.id })} />
            <span className="aj-optn">{m.nome}</span>
            <span className="aj-optd">{m.desc}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="aj-pro-tipos" disabled={form.modo === 'off'}>
        <legend className="label">O que observar</legend>
        {(Object.keys(DESC_TIPO) as InsightTipo[]).map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={form.tipos[t]} onChange={(e) => set({ tipos: { ...form.tipos, [t]: e.target.checked } })} />
            <span>
              {NOME_TIPO_INSIGHT[t]} <small className="aj-hint">· {DESC_TIPO[t]}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="aj-pro-grade">
        <label className="field">
          Limite diário de chamadas de IA
          <input
            className="input"
            type="number"
            min={0}
            max={500}
            value={form.limiteDiario}
            onChange={(e) => set({ limiteDiario: numero(e.target.value, 0) })}
            aria-describedby="aj-pro-uso"
          />
          <span id="aj-pro-uso" className="aj-hint">
            Hoje: {est?.usadasHoje ?? 0} de {form.limiteDiario}. Somando todos os livros.
          </span>
        </label>
        <label className="field">
          Palavras novas mínimas
          <input className="input" type="number" min={0} max={20000} value={form.palavrasMin} onChange={(e) => set({ palavrasMin: numero(e.target.value, 0) })} />
          <span className="aj-hint">Antes disso, o capítulo não é analisado de novo.</span>
        </label>
        <label className="field">
          Pausa (segundos sem digitar)
          <input className="input" type="number" min={10} max={3600} value={form.pausaS} onChange={(e) => set({ pausaS: numero(e.target.value, 60) })} />
        </label>
        <div className="field">
          <span id="aj-pro-sil">Horário silencioso</span>
          <span className="aj-row" role="group" aria-labelledby="aj-pro-sil">
            <input className="input" type="time" aria-label="Início do horário silencioso" value={form.silencioInicio} onChange={(e) => set({ silencioInicio: e.target.value })} />
            <span className="aj-hint">até</span>
            <input className="input" type="time" aria-label="Fim do horário silencioso" value={form.silencioFim} onChange={(e) => set({ silencioFim: e.target.value })} />
          </span>
          <span className="aj-hint">{est?.silencioAgora ? 'Agora é horário silencioso. ' : ''}Início igual ao fim desliga o silêncio.</span>
        </div>
      </div>

      <footer className="aj-foot">
        <button type="submit" className="btn pri" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar modo proativo'}
        </button>
        <p className={`aj-fb ${fb?.tipo ?? ''}`} role={fb?.tipo === 'erro' ? 'alert' : 'status'} aria-live="polite">
          {fb && <Ico n={fb.tipo === 'erro' ? 'alerta' : 'check'} size={15} />}
          <span>{fb?.msg ?? ''}</span>
        </p>
      </footer>
    </form>
  )
}
