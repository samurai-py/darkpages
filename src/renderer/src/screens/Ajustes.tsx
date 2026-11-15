import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio } from '../api'
import { ia, type IaSettings, type LtModo, type ModeloCodex, type ModeloOllama, type Provedor, type RevisorSettings, type SugestaoModelo, type TesteIa, type TesteLt } from '../features/ia/api'
import { Ico } from '../features/ia/icones'
import { ArteSettingsPanel } from '../features/arte/SettingsPanel'
import { SyncSettingsPanel } from '../features/sync/SettingsPanel'
import { SecaoProativo } from '../features/insights/SecaoProativo'
import './ajustes.css'
import { SecaoAtualizacao } from '../features/atualizacao/Atualizacao'

/** Configurações do app (IA, revisor, arte, Drive, Spotify). Não depende de livro aberto. */

type Secao = 'ia' | 'revisor' | 'arte' | 'sync' | 'atualizacao'

const SECOES: Array<{ id: Secao; nome: string; desc: string }> = [
  { id: 'ia', nome: 'Inteligência artificial', desc: 'Provedor, modelo e chaves' },
  { id: 'revisor', nome: 'Revisor', desc: 'Ortografia e gramática' },
  { id: 'arte', nome: 'Arte', desc: 'Gerador de imagens' },
  { id: 'sync', nome: 'Sincronização', desc: 'Google Drive e Spotify' },
  { id: 'atualizacao', nome: 'Atualizações', desc: 'Versão e novidades' }
]

const PROVEDORES: Array<{ id: Provedor; nome: string; desc: string; externo: boolean }> = [
  { id: 'off', nome: 'Desligada', desc: 'Nenhum recurso de IA é usado.', externo: false },
  { id: 'ollama', nome: 'Ollama', desc: 'Roda no seu computador, offline.', externo: false },
  { id: 'claude-cli', nome: 'Claude · assinatura', desc: 'Usa seu Claude Pro/Max pelo Claude Code logado neste computador. Sem chave.', externo: true },
  { id: 'codex-cli', nome: 'ChatGPT · assinatura', desc: 'Usa seu ChatGPT Plus/Pro pelo Codex logado neste computador. Sem chave.', externo: true },
  { id: 'anthropic', nome: 'Claude', desc: 'Anthropic, com sua chave.', externo: true },
  { id: 'openai', nome: 'ChatGPT', desc: 'OpenAI, com sua chave.', externo: true },
  { id: 'gemini', nome: 'Gemini', desc: 'Google, com sua chave.', externo: true },
  { id: 'groq', nome: 'Groq', desc: 'Modelos abertos muito rápidos, com sua chave.', externo: true }
]

/** Modelos sugeridos (conferidos na documentação de cada provedor); o campo aceita qualquer outro. */
const MODELOS: Record<Nuvem, string[]> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  openai: ['gpt-5.4-mini-2026-03-17', 'gpt-5.4-nano-2026-03-17', 'gpt-5.5-2026-04-23'],
  gemini: ['gemini-3.8-flash', 'gemini-2.5-flash-lite'],
  groq: ['openai/gpt-oss-120b']
}

type Nuvem = 'anthropic' | 'openai' | 'gemini' | 'groq'

const CHAVE: Record<Nuvem, { campo: 'anthropicKey' | 'openaiKey' | 'geminiKey' | 'groqKey'; modelo: 'anthropicModel' | 'openaiModel' | 'geminiModel' | 'groqModel'; onde: string }> = {
  anthropic: { campo: 'anthropicKey', modelo: 'anthropicModel', onde: 'console.anthropic.com' },
  openai: { campo: 'openaiKey', modelo: 'openaiModel', onde: 'platform.openai.com' },
  gemini: { campo: 'geminiKey', modelo: 'geminiModel', onde: 'aistudio.google.com' },
  groq: { campo: 'groqKey', modelo: 'groqModel', onde: 'console.groq.com' }
}

const IA_PADRAO: Required<IaSettings> = {
  provider: 'ollama',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-5-5',
  openaiKey: '',
  openaiModel: 'gpt-5.4-mini-2026-03-17',
  geminiKey: '',
  geminiModel: 'gemini-3.8-flash',
  groqKey: '',
  groqModel: 'openai/gpt-oss-120b',
  claudeCliModel: '',
  codexCliModel: '',
  claudeCliModelAuto: 'haiku',
  codexCliModelAuto: ''
}

/** Apelidos do Claude Code (conferidos em `claude --help`); o campo aceita o nome completo de qualquer modelo. */
const APELIDOS_CLAUDE: Array<{ id: string; desc: string }> = [
  { id: 'haiku', desc: 'mais rápido e econômico' },
  { id: 'sonnet', desc: 'equilíbrio entre qualidade e limite' },
  { id: 'opus', desc: 'mais capaz, gasta mais limite' },
  { id: 'fable', desc: 'modelo mais recente' }
]

type Feedback = { tipo: 'ok' | 'erro' | 'info'; msg: string } | null

function hora(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function Aviso({ f }: { f: Feedback }): ReactElement {
  return (
    <p className={`aj-fb ${f?.tipo ?? ''}`} role={f?.tipo === 'erro' ? 'alert' : 'status'} aria-live="polite">
      {f && <Ico n={f.tipo === 'erro' ? 'alerta' : 'check'} size={15} />}
      <span>{f?.msg ?? ''}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------

function SecaoIa(): ReactElement {
  const [salvo, setSalvo] = useState<Required<IaSettings>>(IA_PADRAO)
  const [form, setForm] = useState<Required<IaSettings>>(IA_PADRAO)
  const [chaves, setChaves] = useState({ anthropicKey: '', openaiKey: '', geminiKey: '', groqKey: '' })
  const [verChave, setVerChave] = useState(false)
  const [modelos, setModelos] = useState<ModeloOllama[] | null>(null)
  const [modelosErr, setModelosErr] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [ram, setRam] = useState<SugestaoModelo | null>(null)
  const [fb, setFb] = useState<Feedback>(null)
  const [ocupado, setOcupado] = useState<'' | 'salvar' | 'testar'>('')
  const [teste, setTeste] = useState<TesteIa | null>(null)
  const [codex, setCodex] = useState<ModeloCodex[] | null>(null)
  const [codexErr, setCodexErr] = useState('')

  const listarCodex = useCallback(async () => {
    setCodexErr('')
    try {
      setCodex(await ia.modelosCodex())
    } catch (e) {
      setCodex([])
      setCodexErr((e as Error).message)
    }
  }, [])

  const listar = useCallback(async (url?: string) => {
    setBuscando(true)
    setModelosErr('')
    try {
      setModelos(await ia.modelosOllama(url))
    } catch (e) {
      setModelos(null)
      setModelosErr((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [s, r] = await Promise.all([folio.settings.get<IaSettings>('ia'), ia.sugestaoModelo()])
        const v = { ...IA_PADRAO, ...s, ollamaModel: s.ollamaModel || r.modelo }
        setSalvo(v)
        setForm(v)
        setRam(r)
        if (v.provider === 'ollama') void listar()
        if (v.provider === 'codex-cli') void listarCodex()
      } catch (e) {
        setFb({ tipo: 'erro', msg: (e as Error).message })
      }
    })()
  }, [listar, listarCodex])

  const set = <K extends keyof IaSettings>(k: K, v: Required<IaSettings>[K]): void => {
    setForm((f) => ({ ...f, [k]: v }))
    setTeste(null)
  }

  const salvar = async (): Promise<boolean> => {
    setOcupado('salvar')
    setFb(null)
    try {
      const patch: IaSettings = { ...form, ...chaves }
      const r = await ia.salvarIa(patch)
      const v = { ...IA_PADRAO, ...r }
      setSalvo(v)
      setForm(v)
      setChaves({ anthropicKey: '', openaiKey: '', geminiKey: '', groqKey: '' })
      setFb({ tipo: 'ok', msg: `Salvo às ${hora()}.` })
      return true
    } catch (e) {
      setFb({ tipo: 'erro', msg: (e as Error).message })
      return false
    } finally {
      setOcupado('')
    }
  }

  const testar = async (): Promise<void> => {
    if (!(await salvar())) return
    setOcupado('testar')
    setTeste(null)
    setFb({ tipo: 'info', msg: 'Testando…' })
    try {
      const t = await ia.testar()
      setTeste(t)
      setFb(null)
    } catch (e) {
      setFb({ tipo: 'erro', msg: (e as Error).message })
    } finally {
      setOcupado('')
    }
  }

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    void salvar()
  }

  const nuvem = form.provider === 'anthropic' || form.provider === 'openai' || form.provider === 'gemini' || form.provider === 'groq' ? form.provider : null
  const instalado = (m: string): boolean => !!modelos?.some((x) => x.nome === m || x.nome === `${m}:latest`)
  const mudou = JSON.stringify(form) !== JSON.stringify(salvo) || Object.values(chaves).some(Boolean)

  return (
    <form className="aj-sec" onSubmit={onSubmit} aria-labelledby="aj-h-ia">
      <header className="aj-sh">
        <h2 id="aj-h-ia" className="disp">Inteligência artificial</h2>
        <p>
          A IA sugere ideias, sinônimos, estilo e faz a leitura crítica. Ela nunca escreve no seu texto sem você aceitar. Com Ollama,
          tudo roda no seu computador.
        </p>
      </header>

      <fieldset className="aj-prov">
        <legend className="label">Provedor</legend>
        {PROVEDORES.map((p) => (
          <label key={p.id} className={`aj-opt ${form.provider === p.id ? 'on' : ''}`}>
            <input
              type="radio"
              name="provider"
              value={p.id}
              checked={form.provider === p.id}
              onChange={() => {
                set('provider', p.id)
                if (p.id === 'ollama' && !modelos) void listar(form.ollamaUrl)
                if (p.id === 'codex-cli' && !codex) void listarCodex()
              }}
            />
            <span className="aj-optn">{p.nome}</span>
            <span className="aj-optd">{p.desc}</span>
            {p.id !== 'off' && (
              <span className={`aj-badge ${p.externo ? 'fora' : ''}`}>
                <Ico n={p.externo ? 'nuvem' : 'local'} size={13} />
                {p.externo ? 'texto sai da máquina' : 'local'}
              </span>
            )}
          </label>
        ))}
      </fieldset>

      {form.provider === 'ollama' && (
        <div className="aj-bloco">
          <label className="field">
            URL do Ollama
            <input
              className="input"
              value={form.ollamaUrl}
              onChange={(e) => set('ollamaUrl', e.target.value)}
              onBlur={() => void listar(form.ollamaUrl)}
              spellCheck={false}
              autoComplete="off"
              inputMode="url"
              aria-describedby="aj-url-d"
            />
            <span id="aj-url-d" className="aj-hint">
              Esta máquina (127.0.0.1), rede local ou Tailscale. Endereços públicos são recusados.
            </span>
          </label>

          <div className="aj-row">
            <label className="field aj-grow">
              Modelo
              {modelos && modelos.length > 0 ? (
                <select className="select" value={form.ollamaModel} onChange={(e) => set('ollamaModel', e.target.value)}>
                  {!instalado(form.ollamaModel) && form.ollamaModel && <option value={form.ollamaModel}>{form.ollamaModel} (não instalado)</option>}
                  {modelos.map((m) => (
                    <option key={m.nome} value={m.nome}>
                      {m.nome}
                      {m.tamanhoGb ? ` · ${m.tamanhoGb.toLocaleString('pt-BR')} GB` : ''}
                      {m.parametros ? ` · ${m.parametros}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" value={form.ollamaModel} onChange={(e) => set('ollamaModel', e.target.value)} spellCheck={false} />
              )}
            </label>
            <button type="button" className="btn sm" onClick={() => void listar(form.ollamaUrl)} disabled={buscando}>
              <Ico n="refazer" /> {buscando ? 'Buscando…' : 'Atualizar lista'}
            </button>
          </div>
          {modelosErr && <p className="err">{modelosErr}</p>}
          {modelos && !modelos.length && <p className="aj-hint">Nenhum modelo instalado ainda.</p>}

          {ram && (
            <div className="aj-ram panel">
              <span className="aj-eb">Sugestão para este computador</span>
              <p>
                {ram.motivo} Modelo indicado: <b>{ram.modelo}</b> (~{ram.tamanhoGb.toLocaleString('pt-BR')} GB).
              </p>
              {!instalado(ram.modelo) && (
                <p className="aj-hint">
                  Para instalar, no terminal: <code>ollama pull {ram.modelo}</code>
                </p>
              )}
              {form.ollamaModel !== ram.modelo && (
                <button type="button" className="btn sm" onClick={() => set('ollamaModel', ram.modelo)}>
                  Usar {ram.modelo}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {(form.provider === 'claude-cli' || form.provider === 'codex-cli') && (
        <div className="aj-bloco">
          <p className="aj-alerta">
            <Ico n="nuvem" size={16} />
            {form.provider === 'claude-cli'
              ? 'O texto que você mandar analisar vai para a Anthropic pelo Claude Code e conta no limite da sua assinatura.'
              : 'O texto que você mandar analisar vai para a OpenAI pelo Codex e conta no limite da sua assinatura.'}
          </p>
          {form.provider === 'claude-cli' ? (
            <>
              <label className="field">
                Modelo
                <input
                  className="input"
                  list="aj-modelos-claude-cli"
                  value={form.claudeCliModel}
                  placeholder="padrão do Claude Code"
                  onChange={(e) => set('claudeCliModel', e.target.value.trim())}
                  spellCheck={false}
                  aria-describedby="aj-cli-d"
                />
              </label>
              <label className="field">
                Modelo para tarefas automáticas
                <input
                  className="input"
                  list="aj-modelos-claude-cli"
                  value={form.claudeCliModelAuto}
                  placeholder="o mesmo do uso normal"
                  onChange={(e) => set('claudeCliModelAuto', e.target.value.trim())}
                  spellCheck={false}
                  aria-describedby="aj-cli-d"
                />
              </label>
              <datalist id="aj-modelos-claude-cli">
                {APELIDOS_CLAUDE.map((m) => (
                  <option key={m.id} value={m.id} label={`${m.id} · ${m.desc}`} />
                ))}
              </datalist>
              <p id="aj-cli-d" className="aj-hint">
                Mais rápido e econômico: <b>haiku</b>. Equilíbrio: <b>sonnet</b>. Mais capaz: <b>opus</b>. Vazio usa o padrão do Claude Code; também
                aceita o nome completo de um modelo. O modelo de tarefas automáticas é usado pelo modo proativo (padrão: haiku, para poupar seu limite).
              </p>
            </>
          ) : (
            <>
              <label className="field">
                Modelo
                <input
                  className="input"
                  list="aj-modelos-codex"
                  value={form.codexCliModel}
                  placeholder="padrão do Codex (deixe vazio)"
                  onChange={(e) => set('codexCliModel', e.target.value.trim())}
                  spellCheck={false}
                  aria-describedby="aj-codex-d"
                />
              </label>
              <label className="field">
                Modelo para tarefas automáticas
                <input
                  className="input"
                  list="aj-modelos-codex"
                  value={form.codexCliModelAuto}
                  placeholder="o mesmo do uso normal"
                  onChange={(e) => set('codexCliModelAuto', e.target.value.trim())}
                  spellCheck={false}
                  aria-describedby="aj-codex-d"
                />
              </label>
              <datalist id="aj-modelos-codex">
                {(codex ?? []).map((m) => (
                  <option key={m.id} value={m.id} label={m.descricao ? `${m.nome} · ${m.descricao}` : m.nome} />
                ))}
              </datalist>
              <p id="aj-codex-d" className="aj-hint">
                {codex && codex.length > 0
                  ? `Sugestões lidas do catálogo do Codex instalado (${codex.length} modelos). Vazio usa o padrão do Codex.`
                  : codexErr
                    ? `Não deu para ler a lista de modelos do Codex: ${codexErr} Digite o nome do modelo, se souber.`
                    : 'Lendo a lista de modelos do Codex…'}{' '}
                Para o modo proativo, escolha um modelo mais leve, se a sua assinatura oferecer.
              </p>
            </>
          )}
        </div>
      )}

      {nuvem && (
        <div className="aj-bloco">
          <p className="aj-alerta">
            <Ico n="nuvem" size={16} />
            Com este provedor, o texto dos capítulos que você mandar analisar é enviado para os servidores de{' '}
            {PROVEDORES.find((p) => p.id === nuvem)?.nome}. A chave fica só neste computador.
          </p>
          <label className="field">
            Chave de API
            <span className="aj-row">
              <input
                className="input aj-grow"
                type={verChave ? 'text' : 'password'}
                value={chaves[CHAVE[nuvem].campo]}
                placeholder={salvo[CHAVE[nuvem].campo] ? `${salvo[CHAVE[nuvem].campo]} salva · deixe vazio para manter` : 'cole a chave aqui'}
                onChange={(e) => setChaves((c) => ({ ...c, [CHAVE[nuvem].campo]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="aj-key-d"
              />
              <button type="button" className="btn sm" aria-pressed={verChave} onClick={() => setVerChave((v) => !v)}>
                <Ico n="olho" /> {verChave ? 'Ocultar' : 'Mostrar'}
              </button>
            </span>
            <span id="aj-key-d" className="aj-hint">
              Crie em {CHAVE[nuvem].onde}. Salva com permissão restrita e nunca é mostrada inteira de volta.
            </span>
          </label>
          <label className="field">
            Modelo
            <input
              className="input"
              list={`aj-modelos-${nuvem}`}
              value={form[CHAVE[nuvem].modelo]}
              onChange={(e) => set(CHAVE[nuvem].modelo, e.target.value)}
              spellCheck={false}
            />
            <datalist id={`aj-modelos-${nuvem}`}>
              {MODELOS[nuvem].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </div>
      )}

      {teste && (
        <div className={`aj-teste ${teste.ok ? 'ok' : 'erro'}`} role={teste.ok ? 'status' : 'alert'}>
          <Ico n={teste.ok ? 'check' : 'alerta'} size={18} />
          {teste.ok ? (
            <span>
              Funcionou: {PROVEDORES.find((p) => p.id === teste.provedor)?.nome} · {teste.modelo} respondeu em{' '}
              {(teste.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s.
            </span>
          ) : (
            <span className="err">{teste.erro}</span>
          )}
        </div>
      )}

      <footer className="aj-foot">
        <button type="submit" className="btn pri" disabled={!!ocupado}>
          {ocupado === 'salvar' ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn" disabled={!!ocupado || form.provider === 'off'} onClick={() => void testar()}>
          {ocupado === 'testar' ? 'Testando…' : 'Salvar e testar'}
        </button>
        {mudou && !fb && <span className="aj-hint">Alterações não salvas</span>}
        <Aviso f={fb} />
      </footer>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Revisor
// ---------------------------------------------------------------------------

const LT_OPCOES: Array<{ id: LtModo; nome: string; desc: string }> = [
  { id: 'off', nome: 'Desligado', desc: 'Sem checagem de ortografia e gramática.' },
  { id: 'local', nome: 'Servidor próprio (recomendado)', desc: 'LanguageTool rodando no seu computador ou rede. O texto não sai de casa.' },
  { id: 'publico', nome: 'Servidor público', desc: 'api.languagetool.org. O texto do capítulo é enviado pela internet, com limite de uso.' }
]

function SecaoRevisor(): ReactElement {
  const [form, setForm] = useState<Required<RevisorSettings>>({ ltModo: 'off', ltUrl: 'http://127.0.0.1:8081' })
  const [aceite, setAceite] = useState(false)
  const [fb, setFb] = useState<Feedback>(null)
  const [ocupado, setOcupado] = useState(false)
  const [teste, setTeste] = useState<{ estado: 'testando' } | { estado: 'ok'; r: TesteLt } | { estado: 'erro'; msg: string } | null>(null)

  const testarConexao = async (): Promise<void> => {
    setTeste({ estado: 'testando' })
    try {
      setTeste({ estado: 'ok', r: await ia.testarLanguageTool(form.ltUrl) })
    } catch (err) {
      setTeste({ estado: 'erro', msg: (err as Error).message })
    }
  }

  useEffect(() => {
    folio.settings.get<RevisorSettings>('revisor').then(
      (s) => {
        setForm((f) => ({ ...f, ...s }))
        if (s.ltModo === 'publico') setAceite(true)
      },
      (e: Error) => setFb({ tipo: 'erro', msg: e.message })
    )
  }, [])

  const salvar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (form.ltModo === 'publico' && !aceite) {
      setFb({ tipo: 'erro', msg: 'Confirme que aceita enviar o texto ao servidor público.' })
      return
    }
    setOcupado(true)
    setFb(null)
    try {
      const r = await ia.salvarRevisor(form)
      setForm((f) => ({ ...f, ...r }))
      setFb({ tipo: 'ok', msg: `Salvo às ${hora()}.` })
    } catch (err) {
      setFb({ tipo: 'erro', msg: (err as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="aj-sec" onSubmit={(e) => void salvar(e)} aria-labelledby="aj-h-rev">
      <header className="aj-sh">
        <h2 id="aj-h-rev" className="disp">Revisor</h2>
        <p>
          Ortografia e gramática em português do Brasil pelo LanguageTool. Estilo e repetição usam a IA configurada acima; a continuidade
          compara o texto com as fichas do Universo.
        </p>
      </header>

      <fieldset className="aj-prov aj-col">
        <legend className="label">LanguageTool</legend>
        {LT_OPCOES.map((o) => (
          <label key={o.id} className={`aj-opt ${form.ltModo === o.id ? 'on' : ''}`}>
            <input type="radio" name="ltModo" value={o.id} checked={form.ltModo === o.id} onChange={() => setForm((f) => ({ ...f, ltModo: o.id }))} />
            <span className="aj-optn">{o.nome}</span>
            <span className="aj-optd">{o.desc}</span>
            {o.id !== 'off' && (
              <span className={`aj-badge ${o.id === 'publico' ? 'fora' : ''}`}>
                <Ico n={o.id === 'publico' ? 'nuvem' : 'local'} size={13} />
                {o.id === 'publico' ? 'texto sai da máquina' : 'local'}
              </span>
            )}
          </label>
        ))}
      </fieldset>

      {form.ltModo === 'local' && (
        <div className="aj-bloco">
          <label className="field">
            URL do servidor
            <input
              className="input"
              value={form.ltUrl}
              onChange={(e) => {
                setForm((f) => ({ ...f, ltUrl: e.target.value }))
                setTeste(null)
              }}
              spellCheck={false}
              autoComplete="off"
              inputMode="url"
              placeholder="http://127.0.0.1:8081"
            />
          </label>
          <div className="aj-lt-teste">
            <button type="button" className="btn" disabled={teste?.estado === 'testando'} onClick={() => void testarConexao()}>
              {teste?.estado === 'testando' ? 'Testando…' : 'Testar conexão'}
            </button>
            {teste?.estado === 'ok' && (
              <p className="aj-fb ok" role="status">
                <Ico n="check" size={15} />
                <span>
                  LanguageTool {teste.r.versao} respondeu em {teste.r.ms.toLocaleString('pt-BR')} ms
                  {teste.r.achados > 0 ? ' e achou o erro da frase de teste.' : ', mas não achou o erro da frase de teste (o português está instalado?).'}
                </span>
              </p>
            )}
            {teste?.estado === 'erro' && (
              <p className="aj-fb erro" role="alert">
                <Ico n="alerta" size={15} />
                <span>{teste.msg}</span>
              </p>
            )}
          </div>
          <div className="aj-ram panel">
            <span className="aj-eb">Como subir o servidor</span>
            <p>Com Java instalado, o script do Darkpages baixa o LanguageTool oficial (uma vez, em ~/.local/share/folio) e sobe o servidor em 127.0.0.1:8081:</p>
            <code className="aj-code">scripts/languagetool-local.sh</code>
            <p className="aj-hint">
              <code>scripts/languagetool-local.sh --systemd</code> mostra um serviço systemd de usuário para subir junto com o computador. Com Docker:{' '}
              <code>docker run -d --name languagetool -p 127.0.0.1:8081:8010 --restart unless-stopped erikvl87/languagetool</code>
            </p>
          </div>
        </div>
      )}

      {form.ltModo === 'publico' && (
        <div className="aj-bloco">
          <label className="check">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            Entendo que o texto dos capítulos revisados será enviado ao languagetool.org.
          </label>
        </div>
      )}

      <footer className="aj-foot">
        <button type="submit" className="btn pri" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </button>
        <Aviso f={fb} />
      </footer>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

export function Ajustes(): ReactElement {
  const [secao, setSecao] = useState<Secao>('ia')
  return (
    <div className="screen aj">
      <nav className="aj-nav" aria-label="Seções de ajustes">
        <h1 className="disp">Ajustes</h1>
        {SECOES.map((s) => (
          <button key={s.id} type="button" className="aj-navb" aria-current={secao === s.id ? 'page' : undefined} onClick={() => setSecao(s.id)}>
            <span>{s.nome}</span>
            <small>{s.desc}</small>
          </button>
        ))}
      </nav>
      <div className="aj-main">
        {secao === 'ia' && (
          <>
            <SecaoIa />
            <SecaoProativo />
          </>
        )}
        {secao === 'revisor' && <SecaoRevisor />}
        {secao === 'arte' && (
          <section className="aj-sec" aria-labelledby="aj-h-arte">
            <header className="aj-sh">
              <h2 id="aj-h-arte" className="disp">Arte</h2>
              <p>Gerador de imagens para aberturas de capítulo, retratos e capa.</p>
            </header>
            <ArteSettingsPanel />
          </section>
        )}
        {secao === 'atualizacao' && <SecaoAtualizacao />}
        {secao === 'sync' && (
          <section className="aj-sec" aria-labelledby="aj-h-sync">
            <header className="aj-sh">
              <h2 id="aj-h-sync" className="disp">Sincronização</h2>
              <p>Cópia automática no Google Drive e música do Spotify enquanto você escreve.</p>
            </header>
            <SyncSettingsPanel />
          </section>
        )}
      </div>
    </div>
  )
}
