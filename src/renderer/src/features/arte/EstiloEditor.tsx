import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Ic, PreviaEstilo } from './Previas'
import type { EstiloArte, Paleta, Proporcao } from './api'

const PROP_ABERTURA: Array<[string, Proporcao]> = [
  ['16 × 10 (padrão)', [16, 10]],
  ['2 × 1 (faixa)', [2, 1]],
  ['3 × 2', [3, 2]],
  ['1 × 1', [1, 1]],
  ['Página do livro', 'livro']
]
const PROP_RETRATO: Array<[string, Proporcao]> = [
  ['3 × 4 (padrão)', [3, 4]],
  ['2 × 3', [2, 3]],
  ['1 × 1', [1, 1]]
]
const PALETAS: Array<[Paleta, string, string]> = [
  ['mono', 'Preto e branco', 'convertida para tons de cinza'],
  ['sepia', 'Sépia', 'tinta marrom sobre creme'],
  ['cor', 'Cor', 'sem conversão']
]

function chaveProp(p: Proporcao): string {
  return p === 'livro' ? 'livro' : `${p[0]}x${p[1]}`
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'estilo'
  )
}

export interface EstiloEditorProps {
  /** estilo a editar; sem ele, cria um novo a partir de `partida` */
  estilo?: EstiloArte
  partida: EstiloArte
  presets: EstiloArte[]
  existentes: string[]
  onSalvar(e: Omit<EstiloArte, 'preset'>): Promise<void>
  onFechar(): void
}

/** Cria ou edita um estilo personalizado (prompt base, negativo, paleta e proporções). */
export function EstiloEditor(p: EstiloEditorProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const uid = useId()
  const novo = !p.estilo
  const fonte = p.estilo ?? p.partida
  const [nome, setNome] = useState(novo ? `${p.partida.nome} (meu)` : fonte.nome)
  const [descricao, setDescricao] = useState(fonte.descricao)
  const [base, setBase] = useState(fonte.preset ? fonte.id : fonte.base ?? '')
  const [prompt, setPrompt] = useState(fonte.prompt)
  const [negativo, setNegativo] = useState(fonte.negativo)
  const [paleta, setPaleta] = useState<Paleta>(fonte.paleta)
  const [pAbertura, setPAbertura] = useState(chaveProp(fonte.proporcoes.abertura))
  const [pRetrato, setPRetrato] = useState(chaveProp(fonte.proporcoes.retrato))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const salvar = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault()
    setErro('')
    let id = p.estilo?.id ?? `meu-${slug(nome)}`
    if (novo) {
      let n = 2
      const raiz = id
      while (p.existentes.includes(id)) id = `${raiz}-${n++}`
    }
    const achar = (lista: Array<[string, Proporcao]>, k: string): Proporcao => lista.find(([, v]) => chaveProp(v) === k)?.[1] ?? lista[0]![1]
    setSalvando(true)
    try {
      await p.onSalvar({
        id,
        nome,
        descricao,
        prompt,
        negativo,
        paleta,
        proporcoes: { abertura: achar(PROP_ABERTURA, pAbertura), retrato: achar(PROP_RETRATO, pRetrato), capa: 'livro' },
        ...(base ? { base } : {})
      })
      ref.current?.close()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const previa: EstiloArte = { ...fonte, nome: nome || '?', paleta, preset: false, ...(base ? { base } : { base: undefined }) }

  return (
    <dialog ref={ref} className="arte-dialog arte-editor" aria-labelledby={`${uid}t`} onClose={p.onFechar}>
      <form onSubmit={(e) => void salvar(e)}>
        <header>
          <h2 className="disp" id={`${uid}t`}>
            {novo ? 'Novo estilo' : 'Editar estilo'}
          </h2>
          <button type="button" className="arte-ib" onClick={() => ref.current?.close()} aria-label="Fechar">
            <Ic nome="fechar" />
          </button>
        </header>
        <div className="arte-editor-corpo">
          <div className="arte-editor-previa">
            <PreviaEstilo estilo={previa} />
            <label className="field">
              Prévia do cartão
              <select className="select" value={base} onChange={(e) => setBase(e.target.value)}>
                <option value="">Monograma</option>
                {p.presets.map((e) => (
                  <option key={e.id} value={e.id}>
                    Como {e.nome.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="arte-editor-campos">
            <label className="field">
              Nome
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required />
            </label>
            <label className="field">
              Descrição curta
              <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
            </label>
            <label className="field">
              Prompt base (em inglês funciona melhor nos modelos locais)
              <textarea className="input arte-ta" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={1500} required />
            </label>
            <label className="field">
              O que evitar (prompt negativo)
              <textarea className="input arte-ta" value={negativo} onChange={(e) => setNegativo(e.target.value)} rows={2} maxLength={1500} />
            </label>
            <fieldset className="arte-fs">
              <legend>Paleta</legend>
              <div className="arte-seg">
                {PALETAS.map(([v, rot, dica]) => (
                  <label key={v} className="arte-seg-op" title={dica}>
                    <input type="radio" name={`${uid}pal`} value={v} checked={paleta === v} onChange={() => setPaleta(v)} />
                    <span>{rot}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid2">
              <label className="field">
                Abertura
                <select className="select" value={pAbertura} onChange={(e) => setPAbertura(e.target.value)}>
                  {PROP_ABERTURA.map(([r, v]) => (
                    <option key={chaveProp(v)} value={chaveProp(v)}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Retrato
                <select className="select" value={pRetrato} onChange={(e) => setPRetrato(e.target.value)}>
                  {PROP_RETRATO.map(([r, v]) => (
                    <option key={chaveProp(v)} value={chaveProp(v)}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="label">A capa sempre usa a proporção da página do livro.</span>
            {erro && (
              <p className="err" role="alert">
                {erro}
              </p>
            )}
          </div>
        </div>
        <footer>
          <button type="button" className="btn sm" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn sm pri" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar estilo'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
