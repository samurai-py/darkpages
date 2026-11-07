import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio, isWeb } from '../../api'
import { SpotifySettings } from '../spotify/SpotifySettings'
import { errMsg, relTime, syncApi, useVisiblePolling, type ConexaoGoogle } from './api'
import { CloudIcon } from './SyncStatus'
import './sync.css'

interface DriveForm {
  clientId: string
  clientSecret: string
  deviceClientId: string
  deviceClientSecret: string
  incluirArca: boolean
}

const VAZIO: DriveForm = { clientId: '', clientSecret: '', deviceClientId: '', deviceClientSecret: '', incluirArca: false }

function DriveSettings(): ReactElement {
  const [form, setForm] = useState<DriveForm>(VAZIO)
  const [masked, setMasked] = useState<{ clientSecret: string; deviceClientSecret: string }>({ clientSecret: '', deviceClientSecret: '' })
  const [c, setC] = useState<ConexaoGoogle | null>(null)
  const [busy, setBusy] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const loadSettings = async (): Promise<void> => {
    const s = await folio.settings.get<Record<string, unknown>>('drive')
    const t = (k: string): string => (typeof s[k] === 'string' ? (s[k] as string) : '')
    setForm({ clientId: t('clientId'), clientSecret: '', deviceClientId: t('deviceClientId'), deviceClientSecret: '', incluirArca: s['incluirArca'] === true })
    setMasked({ clientSecret: t('clientSecret'), deviceClientSecret: t('deviceClientSecret') })
  }

  useEffect(() => {
    void loadSettings().catch((e: unknown) => setErro(errMsg(e)))
    void syncApi.conexao().then(setC, (e: unknown) => setErro(errMsg(e)))
  }, [])

  // enquanto a autorização está em andamento, acompanha o resultado
  useVisiblePolling(
    async () => {
      try {
        setC(await syncApi.conexao())
      } catch (e) {
        setErro(errMsg(e))
      }
    },
    2500,
    Boolean(c?.pendente)
  )

  const save = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    setErro(null)
    setSalvo(false)
    try {
      await folio.settings.put('drive', { ...form, clientId: form.clientId.trim(), deviceClientId: form.deviceClientId.trim() })
      await loadSettings()
      setC(await syncApi.conexao())
      setSalvo(true)
    } catch (err) {
      setErro(errMsg(err))
    }
  }

  const conectar = async (): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      await save()
      setC(await syncApi.conectar())
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const desconectar = async (): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      setC(await syncApi.desconectar())
    } catch (e) {
      setErro(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof DriveForm>(k: K, v: DriveForm[K]): void => {
    setSalvo(false)
    setForm((f) => ({ ...f, [k]: v }))
  }

  const p = c?.pendente ?? null

  return (
    <section className="panel sy-card" aria-labelledby="sy-drive-h">
      <header>
        <CloudIcon estado={c?.conectado ? 'emdia' : 'desconectado'} size={26} />
        <h2 id="sy-drive-h" className="disp">Google Drive</h2>
        <span className="pill">{c?.conectado ? <span className="sy-ok"><b>Conectado</b></span> : 'Desconectado'}</span>
      </header>

      <p className="sy-hint">
        Salvamento automático espelhado: o livro continua salvo neste {isWeb ? 'servidor' : 'computador'} e, a cada ~30 segundos,
        os arquivos que mudaram sobem para a pasta <code>Folio/&lt;pasta do livro&gt;</code> do seu Drive. Sem internet, as mudanças
        esperam numa fila. Se o mesmo arquivo mudar aqui e no Drive, o Folio guarda as duas versões e avisa.
      </p>

      {c?.conectado && (
        <dl className="sy-dl" style={{ maxWidth: 420 }}>
          <dt>Conta</dt>
          <dd>{c.conta}</dd>
          <dt>Conectado</dt>
          <dd>{relTime(c.conectadoEm)}</dd>
        </dl>
      )}

      <form className="sy-set" onSubmit={(e) => void save(e)}>
        {!isWeb && (
          <div className="sy-grid">
            <label className="field">
              ID do cliente (App para computador)
              <input className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)} placeholder="…apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
            </label>
            <label className="field">
              Chave secreta do cliente
              <input className="input" type="password" value={form.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} placeholder={masked.clientSecret || 'GOCSPX-…'} autoComplete="off" />
            </label>
          </div>
        )}
        <div className="sy-grid">
          <label className="field">
            ID do cliente (TVs e dispositivos de entrada limitada){!isWeb && ' — opcional'}
            <input className="input" value={form.deviceClientId} onChange={(e) => set('deviceClientId', e.target.value)} placeholder="…apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            Chave secreta desse cliente
            <input className="input" type="password" value={form.deviceClientSecret} onChange={(e) => set('deviceClientSecret', e.target.value)} placeholder={masked.deviceClientSecret || 'GOCSPX-…'} autoComplete="off" />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.incluirArca} onChange={(e) => set('incluirArca', e.target.checked)} />
          Espelhar também os snapshots da Arca (.arca/), que ocupam mais espaço
        </label>
        <div className="sy-row">
          <button type="submit" className="btn sm">Salvar</button>
          {c?.conectado ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => void desconectar()}>Desconectar</button>
          ) : (
            <button type="button" className="btn pri sm" disabled={busy || Boolean(p)} onClick={() => void conectar()}>
              {busy ? 'Conectando…' : 'Conectar conta Google'}
            </button>
          )}
          {salvo && <span className="sy-hint" role="status">Salvo.</span>}
        </div>
      </form>

      {p?.modo === 'dispositivo' && (
        <div className="sy-device" role="status">
          <span className="sy-hint">Em qualquer aparelho, abra o endereço abaixo e digite o código:</span>
          <a className="sy-link" href={p.url} target="_blank" rel="noopener noreferrer">{p.url}</a>
          <span className="sy-code" aria-label={`Código ${p.codigo.split('').join(' ')}`}>{p.codigo}</span>
          <span className="sy-hint">Esperando a autorização… o código vale até {new Date(p.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</span>
        </div>
      )}
      {p?.modo === 'navegador' && (
        <div className="sy-device" role="status">
          <span className="sy-hint">Abrimos a página do Google no seu navegador. Se ela não abriu, use este link:</span>
          <a className="sy-link" href={p.url} target="_blank" rel="noopener noreferrer">Autorizar o Folio no Google</a>
        </div>
      )}
      {(erro ?? c?.erro) && <p className="err" role="alert">{erro ?? c?.erro}</p>}

      <details className="sy-details">
        <summary>Privacidade</summary>
        <p className="sy-hint">
          O Folio pede só o escopo <code>drive.file</code>: ele enxerga e altera apenas os arquivos que ele mesmo criou no seu Drive,
          nunca o resto. As credenciais ficam no arquivo de configurações deste {isWeb ? 'servidor' : 'computador'} (permissão só do
          seu usuário) e nada passa por servidores de terceiros: o Folio fala direto com o Google. Ao desconectar, o acesso é revogado.
          Arquivos removidos do livro vão para a lixeira do Drive (recuperáveis por 30 dias).
        </p>
      </details>

      <details className="sy-details">
        <summary>Passo a passo: criar o acesso no Google Cloud</summary>
        <ol className="sy-steps">
          <li>Abra <a className="sy-link" href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> e crie um projeto (ex.: “Folio”).</li>
          <li>Em <b>APIs e serviços → Biblioteca</b>, procure <b>Google Drive API</b> e clique em <b>Ativar</b>.</li>
          <li>Em <b>Google Auth Platform</b> (tela de consentimento OAuth): tipo <b>Externo</b>, nome do app “Folio” e seu e-mail. Em <b>Público-alvo</b>, adicione seu e-mail Google como usuário de teste. Em <b>Acesso a dados</b>, adicione o escopo <code>.../auth/drive.file</code>.</li>
          {!isWeb && <li>Em <b>Clientes → Criar cliente</b>, escolha <b>App para computador</b>. Copie o ID e a chave secreta para os dois primeiros campos acima. Não há URI de redirecionamento para cadastrar: o Folio usa <code>http://127.0.0.1</code> numa porta livre.</li>}
          <li>
            {isWeb ? 'Em ' : 'Para usar o modo web (navegador em outro computador), em '}
            <b>Clientes → Criar cliente</b>, escolha <b>TVs e dispositivos de entrada limitada</b> e copie o ID e a chave secreta para os campos “TVs e dispositivos”.
            Nesse modo o Folio mostra um código, que você digita em <code>google.com/device</code> em qualquer aparelho.
          </li>
          <li>Clique em <b>Conectar conta Google</b> e autorize. Se aparecer “o Google não verificou este app”, é o seu próprio app: clique em <b>Avançado → Acessar Folio</b>.</li>
          <li>
            Importante: enquanto o app estiver com status <b>Em teste</b>, o Google faz a autorização vencer em <b>7 dias</b> e será preciso conectar de novo.
            Para não vencer, em <b>Público-alvo</b> clique em <b>Publicar app</b> (status “Em produção”). Como <code>drive.file</code> é um escopo não sensível,
            uso pessoal não exige o processo de verificação de segurança; o aviso de app não verificado pode continuar aparecendo.
          </li>
        </ol>
      </details>
    </section>
  )
}

/** Painel de Ajustes: Google Drive e Spotify. DONO: Sync. Montado na tela Ajustes. */
export function SyncSettingsPanel(): ReactElement | null {
  return (
    <div className="sy-set">
      <DriveSettings />
      <SpotifySettings />
    </div>
  )
}
