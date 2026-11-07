import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { folio } from '../../api'
import { arte, type ArteSettings, type ProvedorId, type TesteResultado } from './api'
import '../../screens/arte.css'

/** Painel de Ajustes: gerador de imagens. DONO: Arte. Montado na tela Ajustes. */

// valores iniciais iguais aos do processo principal (src/main/arte/provedores.ts)
const PADRAO: ArteSettings = {
  provedor: 'off',
  comfyUrl: 'http://127.0.0.1:8188',
  comfyCheckpoint: 'v1-5-pruned-emaonly.safetensors',
  comfyLado: 512,
  comfyPassos: 20,
  comfyCfg: 8,
  comfyWorkflow: '',
  openaiKey: '',
  openaiModel: 'gpt-image-2',
  openaiQualidade: 'auto'
}

const MODELOS_OPENAI = ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-1.5', 'gpt-image-1-mini', 'chatgpt-image-latest']

const PROVEDORES: Array<[ProvedorId, string, string]> = [
  ['off', 'Desligado', 'Nenhuma imagem é gerada.'],
  ['comfyui', 'ComfyUI local', 'Roda no seu computador ou na sua rede. Sem custo por imagem.'],
  ['openai', 'OpenAI Images', 'Na nuvem, com a sua chave. Cobrança por imagem na sua conta.']
]

const EXEMPLO_WF = `{
  "3": { "class_type": "KSampler", "inputs": { "seed": {{semente}}, "positive": ["6", 0], … } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": {{largura}}, "height": {{altura}}, "batch_size": 1 } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "{{prompt}}", "clip": ["4", 1] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "{{negativo}}", "clip": ["4", 1] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "folio", "images": ["8", 0] } }
}`

export function ArteSettingsPanel(): ReactElement | null {
  const uid = useId()
  const [s, setS] = useState<ArteSettings>(PADRAO)
  const [salvo, setSalvo] = useState<ArteSettings>(PADRAO)
  const [chaveNova, setChaveNova] = useState('')
  const [chaveIa, setChaveIa] = useState('')
  const [usarWf, setUsarWf] = useState(false)
  const [teste, setTeste] = useState<(TesteResultado & { provedor: string }) | null>(null)
  const [testando, setTestando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    void Promise.all([folio.settings.get<Partial<ArteSettings>>('arte'), folio.settings.get<{ openaiKey?: string }>('ia').catch(() => ({}))])
      .then(([a, ia]) => {
        const v = { ...PADRAO, ...a } as ArteSettings
        setS(v)
        setSalvo(v)
        setUsarWf(!!v.comfyWorkflow.trim())
        setChaveIa((ia as { openaiKey?: string }).openaiKey ?? '')
        setCarregado(true)
      })
      .catch((e: Error) => setErro(e.message))
  }, [])

  const set = <K extends keyof ArteSettings>(k: K, v: ArteSettings[K]): void => {
    setS((x) => ({ ...x, [k]: v }))
    setMsg('')
    setTeste(null)
  }

  const patch = (): Partial<ArteSettings> => {
    const { openaiKey: _k, ...resto } = s
    return { ...resto, comfyWorkflow: usarWf ? s.comfyWorkflow : '', ...(chaveNova.trim() ? { openaiKey: chaveNova.trim() } : {}) }
  }

  const salvar = async (ev?: FormEvent): Promise<void> => {
    ev?.preventDefault()
    setErro('')
    setMsg('')
    try {
      const p = patch()
      // a URL do ComfyUI é validada no processo principal (só host local/privado/Tailscale) antes de gravar
      if (p.comfyUrl !== salvo.comfyUrl || p.provedor === 'comfyui') p.comfyUrl = await arte.validarUrl(p.comfyUrl ?? '')
      const r = await folio.settings.put<Partial<ArteSettings>>('arte', p)
      const v = { ...PADRAO, ...r } as ArteSettings
      setS(v)
      setSalvo(v)
      setChaveNova('')
      setMsg('Salvo.')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const testar = async (): Promise<void> => {
    setTestando(true)
    setTeste(null)
    setErro('')
    try {
      setTeste(await arte.testar(patch()))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setTestando(false)
    }
  }

  const removerChave = async (): Promise<void> => {
    if (!window.confirm('Apagar a chave da OpenAI guardada para imagens?')) return
    // segredos: string vazia mantém o valor; um espaço é gravado e tratado como "sem chave"
    await folio.settings.put('arte', { openaiKey: ' ' }).catch((e: Error) => setErro(e.message))
    setS((x) => ({ ...x, openaiKey: '' }))
    setSalvo((x) => ({ ...x, openaiKey: '' }))
  }

  const mudou = JSON.stringify(patch()) !== JSON.stringify({ ...(({ openaiKey: _k, ...r }) => r)(salvo), comfyWorkflow: salvo.comfyWorkflow })

  if (!carregado && !erro) return <section className="panel arte-ajustes" aria-busy="true" aria-label="Gerador de imagens" />

  const chaveSalva = s.openaiKey.trim() && s.openaiKey !== '•••• ' ? s.openaiKey : ''

  return (
    <section className="panel arte-ajustes" aria-labelledby={`${uid}t`}>
      <form onSubmit={(e) => void salvar(e)}>
        <header>
          <h2 id={`${uid}t`} className="disp">
            Arte por IA
          </h2>
          <span className="muted">Aberturas de capítulo, retratos das fichas e capa.</span>
        </header>

        <fieldset className="arte-fs">
          <legend>Gerador de imagens</legend>
          <div className="arte-prov">
            {PROVEDORES.map(([id, nome, dica]) => (
              <label key={id} className="arte-prov-op">
                <input type="radio" name={`${uid}p`} value={id} checked={s.provedor === id} onChange={() => set('provedor', id)} />
                <span>
                  <b>{nome}</b>
                  <span className="muted">{dica}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {s.provedor === 'comfyui' && (
          <div className="arte-ajustes-grupo">
            <div className="grid2">
              <label className="field">
                Endereço do ComfyUI
                <input className="input" value={s.comfyUrl} onChange={(e) => set('comfyUrl', e.target.value)} placeholder="http://127.0.0.1:8188" spellCheck={false} />
              </label>
              <label className="field">
                Checkpoint
                <input
                  className="input"
                  value={s.comfyCheckpoint}
                  onChange={(e) => set('comfyCheckpoint', e.target.value)}
                  list={`${uid}ck`}
                  spellCheck={false}
                  disabled={usarWf}
                />
                <datalist id={`${uid}ck`}>
                  {(teste?.checkpoints ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid4 arte-ajustes-num">
              <label className="field">
                Lado base
                <select className="select" value={s.comfyLado} onChange={(e) => set('comfyLado', Number(e.target.value))} disabled={usarWf}>
                  <option value={512}>512 (SD 1.5)</option>
                  <option value={768}>768 (SD 2)</option>
                  <option value={1024}>1024 (SDXL, Flux)</option>
                </select>
              </label>
              <label className="field">
                Passos
                <input className="input" type="number" min={1} max={150} value={s.comfyPassos} onChange={(e) => set('comfyPassos', Math.max(1, Number(e.target.value) || 20))} disabled={usarWf} />
              </label>
              <label className="field">
                CFG
                <input className="input" type="number" min={1} max={30} step={0.5} value={s.comfyCfg} onChange={(e) => set('comfyCfg', Math.max(1, Number(e.target.value) || 8))} disabled={usarWf} />
              </label>
            </div>
            {teste?.checkpoints && teste.checkpoints.length > 0 && !usarWf && (
              <p className="label">Instalados: {teste.checkpoints.join(' · ')}</p>
            )}
            <label className="check">
              <input type="checkbox" checked={usarWf} onChange={(e) => { setUsarWf(e.target.checked); setTeste(null) }} />
              Usar meu workflow (formato API)
            </label>
            {usarWf && (
              <label className="field">
                Cole o JSON exportado com “Export (API)”. Marcadores: {'{{prompt}} {{negativo}} {{semente}} {{largura}} {{altura}}'}
                <textarea
                  className="input arte-ta arte-wf"
                  value={s.comfyWorkflow}
                  onChange={(e) => set('comfyWorkflow', e.target.value)}
                  rows={10}
                  spellCheck={false}
                  placeholder={EXEMPLO_WF}
                />
              </label>
            )}
          </div>
        )}

        {s.provedor === 'openai' && (
          <div className="arte-ajustes-grupo">
            <div className="grid2">
              <label className="field">
                Chave da API
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={chaveNova}
                  onChange={(e) => { setChaveNova(e.target.value); setTeste(null) }}
                  placeholder={chaveSalva ? `${chaveSalva} (guardada)` : chaveIa ? `usa a da IA (${chaveIa})` : 'sk-…'}
                  spellCheck={false}
                />
              </label>
              <label className="field">
                Modelo
                <input className="input" value={s.openaiModel} onChange={(e) => set('openaiModel', e.target.value)} list={`${uid}om`} spellCheck={false} />
                <datalist id={`${uid}om`}>
                  {MODELOS_OPENAI.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid2">
              <label className="field">
                Qualidade
                <select className="select" value={s.openaiQualidade} onChange={(e) => set('openaiQualidade', e.target.value as ArteSettings['openaiQualidade'])}>
                  <option value="auto">Automática</option>
                  <option value="low">Baixa (mais barata)</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>
              {chaveSalva && (
                <div className="field">
                  &nbsp;
                  <button type="button" className="btn sm" onClick={() => void removerChave()}>
                    Apagar chave guardada
                  </button>
                </div>
              )}
            </div>
            <p className="label">A OpenAI não aceita semente: a consistência vem do estilo e do prompt. Deixe a chave vazia para usar a da seção IA.</p>
          </div>
        )}

        <div className="arte-privacidade">
          <span className="arte-eb">O que sai da sua máquina</span>
          <ul>
            <li>
              <b>Para montar o prompt</b>, o texto do capítulo (ou a ficha) vai para a IA de texto escolhida em Ajustes › IA. Com Ollama, fica tudo
              local; com um provedor na nuvem, o trecho vai para ele.
            </li>
            {s.provedor === 'comfyui' && (
              <li>
                <b>ComfyUI</b> recebe só o prompt final (descrição visual, sem o texto do livro). Em 127.0.0.1 nada sai do computador; num endereço de rede,
                vai só até essa máquina.
              </li>
            )}
            {s.provedor === 'openai' && (
              <li>
                <b>OpenAI</b> recebe o prompt final (descrição visual, sem o texto do livro) e devolve a imagem. A chave fica só neste computador, em
                arquivo com permissão restrita, e nunca volta inteira para a interface.
              </li>
            )}
            {s.provedor === 'off' && <li>Com o gerador desligado, nenhuma imagem é pedida a ninguém.</li>}
            <li>As imagens e os prompts usados ficam na pasta do livro (assets/ e arte/).</li>
          </ul>
        </div>

        {teste && (
          <p className={teste.ok ? 'arte-ok' : 'err'} role="status">
            {teste.mensagem}
          </p>
        )}
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}

        <footer>
          {msg && <span className="muted" role="status">{msg}</span>}
          <button type="button" className="btn sm" onClick={() => void testar()} disabled={testando || s.provedor === 'off'}>
            {testando ? 'Testando…' : 'Testar conexão'}
          </button>
          <button type="submit" className="btn sm pri" disabled={!mudou && !chaveNova.trim()}>
            Salvar
          </button>
        </footer>
      </form>
    </section>
  )
}
