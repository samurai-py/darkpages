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

/** Mesma regra de nome de modelo de ai/index.ts (impede injetar opções: não começa com "-"). */
export const MODELO_CLI_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/

/**
 * Apelidos aceitos pelo Claude Code em `--model` (conferido em `claude --help`:
 * "an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet') or a
 * model's full name"). "haiku" é o apelido do modelo mais leve.
 */
export const APELIDOS_CLAUDE = ['haiku', 'sonnet', 'opus', 'fable'] as const

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
export async function chatViaCli(kind: CliKind, system: string, prompt: string, timeoutMs: number, modelo = ''): Promise<string> {
  if (modelo && !MODELO_CLI_RE.test(modelo)) throw new Error(`Nome de modelo inválido para o ${NOME[kind]}.`)
  const bin = await findBin(kind)
  const cwd = await mkdtemp(join(tmpdir(), 'folio-ia-'))
  try {
    if (kind === 'claude') {
      const args = ['-p', '--output-format', 'text', '--tools', '']
      if (modelo) args.push('--model', modelo)
      if (system) args.push('--system-prompt', system)
      const r = await run(bin, args, prompt, cwd, timeoutMs)
      if (r.code !== 0 || !r.stdout.trim()) throw explicaFalha(kind, r.stderr, r.stdout)
      return r.stdout.trim()
    }
    const saida = join(cwd, 'resposta.txt')
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '-o', saida]
    if (modelo) args.push('-m', modelo)
    args.push('-')
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

export interface ModeloCodex {
  id: string
  nome: string
  descricao: string
}

let cacheCodex: { em: number; lista: ModeloCodex[] } | null = null

/**
 * Modelos que o Codex desta máquina oferece, lidos do catálogo local com
 * `codex debug models` (não chama a IA nem gasta limite da assinatura).
 * Só os visíveis na lista do próprio Codex. Cache de 10 minutos.
 */
export async function modelosCodex(): Promise<ModeloCodex[]> {
  if (cacheCodex && Date.now() - cacheCodex.em < 600_000) return cacheCodex.lista
  const bin = await findBin('codex')
  const cwd = await mkdtemp(join(tmpdir(), 'folio-codex-'))
  try {
    const r = await run(bin, ['debug', 'models'], '', cwd, 20_000)
    if (r.code !== 0) throw explicaFalha('codex', r.stderr, r.stdout)
    let j: unknown
    try {
      j = JSON.parse(r.stdout)
    } catch {
      throw new Error('O Codex não devolveu a lista de modelos num formato conhecido.')
    }
    const itens = (j && typeof j === 'object' && Array.isArray((j as { models?: unknown }).models) ? (j as { models: unknown[] }).models : []) as Array<
      Record<string, unknown>
    >
    const lista = itens
      .filter((m) => typeof m.slug === 'string' && MODELO_CLI_RE.test(m.slug) && (m.visibility === undefined || m.visibility === 'list'))
      .map((m) => ({
        id: m.slug as string,
        nome: typeof m.display_name === 'string' ? m.display_name : (m.slug as string),
        descricao: typeof m.description === 'string' ? m.description.slice(0, 200) : ''
      }))
    cacheCodex = { em: Date.now(), lista }
    return lista
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
