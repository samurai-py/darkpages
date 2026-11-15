import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { EstadoAtualizacao } from '../shared/atualizacao'

/**
 * Atualização pelo GitHub (releases de samurai-py/darkpages) com electron-updater.
 * - Só o instalador do Windows e o AppImage se atualizam; a versão portátil e o
 *   modo de desenvolvimento não.
 * - Nada baixa ou instala sozinho: a interface pede cada passo.
 * - O próprio electron-updater confere o SHA-512 do arquivo contra o latest.yml
 *   da release antes de instalar. Sem assinatura digital, essa conferência e o
 *   HTTPS são a proteção (a conta do GitHub precisa de verificação em duas etapas).
 */

const REPO = 'https://github.com/samurai-py/darkpages'

let estado: EstadoAtualizacao = { fase: 'parado', versaoAtual: '' }

function motivoIndisponivel(): string | null {
  if (!app.isPackaged) return 'Atualização automática só existe no app instalado.'
  if (process.env['PORTABLE_EXECUTABLE_DIR']) return 'A versão portátil não se atualiza sozinha: baixe a nova em Releases.'
  if (process.platform === 'linux' && !process.env['APPIMAGE']) return 'No Linux, só o AppImage se atualiza sozinho.'
  if (process.platform === 'darwin') return 'Sem atualização automática no macOS.'
  return null
}

function mudar(patch: Partial<EstadoAtualizacao>): EstadoAtualizacao {
  estado = { ...estado, ...patch, versaoAtual: app.getVersion() }
  return estado
}

function mensagemDeErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::ERR/i.test(m)) return 'Sem conexão com o GitHub. Tente de novo mais tarde.'
  if (/404|latest.*yml|Cannot find/i.test(m)) return 'Ainda não há versão publicada para atualizar.'
  if (/sha512|checksum/i.test(m)) return 'O arquivo baixado não confere com o publicado, então não foi instalado.'
  return `Não consegui atualizar: ${m.replace(/\s+/g, ' ').slice(0, 200)}`
}

let pronto = false

function preparar(): void {
  if (pronto) return
  pronto = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null
  autoUpdater.on('update-available', (i) => mudar({ fase: 'disponivel', versao: i.version, url: `${REPO}/releases/tag/v${i.version}`, progresso: undefined, mensagem: undefined }))
  autoUpdater.on('update-not-available', () => mudar({ fase: 'atual', versao: undefined, mensagem: undefined }))
  autoUpdater.on('download-progress', (p) => mudar({ fase: 'baixando', progresso: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => mudar({ fase: 'pronto', versao: i.version, progresso: 100 }))
  autoUpdater.on('error', (e) => mudar({ fase: 'erro', mensagem: mensagemDeErro(e) }))
}

async function verificar(): Promise<EstadoAtualizacao> {
  const motivo = motivoIndisponivel()
  if (motivo) return mudar({ fase: 'indisponivel', mensagem: motivo })
  if (estado.fase === 'verificando' || estado.fase === 'baixando') return estado
  preparar()
  mudar({ fase: 'verificando', mensagem: undefined })
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    mudar({ fase: 'erro', mensagem: mensagemDeErro(e) })
  }
  return estado
}

/** Métodos "atualizacao.*": devolve undefined para o que não é dele. */
export function tratarAtualizacao(method: string): Promise<unknown> | undefined {
  switch (method) {
    case 'atualizacao.estado':
      return Promise.resolve(mudar({}))
    case 'atualizacao.verificar':
      return verificar()
    case 'atualizacao.baixar':
      if (estado.fase !== 'disponivel') return Promise.reject(new Error('Não há versão nova para baixar.'))
      mudar({ fase: 'baixando', progresso: 0 })
      autoUpdater.downloadUpdate().catch((e: unknown) => mudar({ fase: 'erro', mensagem: mensagemDeErro(e) }))
      return Promise.resolve(estado)
    case 'atualizacao.instalar':
      if (estado.fase !== 'pronto') return Promise.reject(new Error('A atualização ainda não foi baixada.'))
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
      return Promise.resolve(estado)
    default:
      return undefined
  }
}

/** Procura versão nova uma vez, pouco depois de abrir (silencioso: erro não incomoda). */
export function verificarAoAbrir(): void {
  setTimeout(() => void verificar(), 20_000)
}
