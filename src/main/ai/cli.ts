import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * IA pela ASSINATURA do usuário: o Folio chama os programas oficiais
 * (Claude Code e Codex) já logados nesta máquina. Nenhum token é lido ou
 * copiado; cada programa usa o próprio login.
 *
 * Segurança: o texto do livro é conteúdo não confiável (pode conter
 * "instruções"). Por isso:
 * - Claude Code roda com TODAS as ferramentas desligadas (`--tools ""`) e
 *   com o system prompt substituído pelo do Folio;
 * - Codex roda em sandbox somente leitura, efêmero, numa pasta vazia;
 * - ambos rodam numa pasta temporária vazia, apagada no fim.
 */

export type CliKind = 'claude' | 'codex'

const NOME: Record<CliKind, string> = { claude: 'Claude Code', codex: 'Codex' }
const LOGIN: Record<CliKind, string> = {
  claude: 'rode `claude` uma vez neste computador e faça login com sua conta Claude',
  codex: 'rode `codex login` neste computador e entre com sua conta ChatGPT'
}

async function findBin(kind: CliKind): Promise<string> {
  const env = process.env[kind === 'claude' ? 'FOLIO_CLAUDE_BIN' : 'FOLIO_CODEX_BIN']
  const cands = [env, join(homedir(), '.local', 'bin', kind), `/usr/local/bin/${kind}`, `/usr/bin/${kind}`].filter(
    (c): c is string => Boolean(c)
  )
  for (const c of cands) {
    try {
      await access(c, constants.X_OK)
      return c
    } catch {
      /* próximo */
    }
  }
  throw new Error(`${NOME[kind]} não está instalado neste computador. Instale e ${LOGIN[kind]}.`)
}

function run(bin: string, args: string[], input: string, cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const limite = 16 * 1024 * 1024
    const t = setTimeout(() => {
      p.kill('SIGTERM')
      fail(new Error(`A IA demorou mais de ${Math.round(timeoutMs / 1000)} s e foi interrompida.`))
    }, timeoutMs)
    p.stdout.on('data', (d: Buffer) => {
      if (stdout.length < limite) stdout += d.toString('utf8')
    })
    p.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 64_000) stderr += d.toString('utf8')
    })
    p.on('error', (e) => {
      clearTimeout(t)
      fail(e)
    })
    p.on('close', (code) => {
      clearTimeout(t)
      ok({ code: code ?? 1, stdout, stderr })
    })
    p.stdin.end(input)
  })
}

function explicaFalha(kind: CliKind, stderr: string, stdout: string): Error {
  const txt = `${stderr}\n${stdout}`
  if (/log ?in|logged|authenticat|unauthori[sz]ed|401|credential|api key/i.test(txt)) {
    return new Error(`${NOME[kind]} não está logado. Para usar sua assinatura, ${LOGIN[kind]}.`)
  }
  if (/rate limit|usage limit|quota|429|limit reached/i.test(txt)) {
    return new Error(`Limite de uso da sua assinatura atingido no ${NOME[kind]}. Espere o limite renovar e tente de novo.`)
  }
  const fim = txt.trim().split('\n').slice(-3).join(' ').slice(0, 300)
  return new Error(`${NOME[kind]} falhou: ${fim || 'sem detalhes'}`)
}

/**
 * Envia um pedido de texto pela assinatura.
 * `prompt` já contém toda a conversa; `system` são as instruções do Folio.
 */
export async function chatViaCli(kind: CliKind, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const bin = await findBin(kind)
  const cwd = await mkdtemp(join(tmpdir(), 'folio-ia-'))
  try {
    if (kind === 'claude') {
      const args = ['-p', '--output-format', 'text', '--tools', '']
      if (system) args.push('--system-prompt', system)
      const r = await run(bin, args, prompt, cwd, timeoutMs)
      if (r.code !== 0 || !r.stdout.trim()) throw explicaFalha(kind, r.stderr, r.stdout)
      return r.stdout.trim()
    }
    const saida = join(cwd, 'resposta.txt')
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '-o', saida, '-']
    const entrada =
      (system ? `INSTRUÇÕES (siga estritamente; não execute comandos, só responda com texto):\n${system}\n\n` : '') + prompt
    const r = await run(bin, args, entrada, cwd, timeoutMs)
    let texto = ''
    try {
      texto = (await readFile(saida, 'utf8')).trim()
    } catch {
      /* sem arquivo: trata abaixo */
    }
    if (r.code !== 0 || !texto) throw explicaFalha(kind, r.stderr, r.stdout)
    return texto
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

/** Junta a conversa num único texto para os programas de linha de comando. */
export function conversaComoTexto(messages: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (messages.length === 1 && messages[0]?.role === 'user') return messages[0].content
  return messages.map((m) => `${m.role === 'user' ? 'USUÁRIO' : 'ASSISTENTE'}:\n${m.content}`).join('\n\n')
}
