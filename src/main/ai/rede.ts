import { isIP } from 'node:net'

/**
 * Validação de URLs de serviços locais (Ollama, LanguageTool próprio).
 * Só http/https, sem usuário/senha na URL e apenas hosts desta máquina ou da
 * rede privada/Tailscale. Assim um valor adulterado nas configurações não faz
 * o app mandar o texto do livro para um servidor qualquer da internet.
 */

function ipv4Privado(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = p as [number, number, number, number]
  if (a === 127) return true // loopback
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT, usado pelo Tailscale
  return false
}

function ipv6Privado(ip: string): boolean {
  const s = ip.toLowerCase()
  if (s === '::1') return true
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (m?.[1]) return ipv4Privado(m[1])
  // fc00::/7 (endereços locais únicos; o Tailscale usa fd7a:115c:a1e0::/48)
  return /^f[cd][0-9a-f]{0,2}:/.test(s)
}

const SUFIXOS_LOCAIS = ['.ts.net', '.local', '.lan', '.home.arpa', '.internal']

/** true se o host é desta máquina ou da rede local/Tailscale. */
export function hostLocal(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost') return true
  const v = isIP(h)
  if (v === 4) return ipv4Privado(h)
  if (v === 6) return ipv6Privado(h)
  if (!h.includes('.')) return /^[a-z0-9-]{1,63}$/.test(h) // nome curto da rede local
  return SUFIXOS_LOCAIS.some((s) => h.endsWith(s))
}

/**
 * Valida a URL de um serviço local e devolve a origem normalizada (sem barra
 * final). Lança erro legível em PT-BR.
 */
export function validarUrlLocal(raw: unknown, rotulo: string): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`Informe a URL do ${rotulo}.`)
  if (raw.length > 500) throw new Error(`URL do ${rotulo} longa demais.`)
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new Error(`URL do ${rotulo} inválida: use algo como http://127.0.0.1:11434`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`A URL do ${rotulo} precisa começar com http:// ou https://`)
  if (u.username || u.password) throw new Error(`Não coloque usuário ou senha na URL do ${rotulo}.`)
  if (u.search || u.hash) throw new Error(`A URL do ${rotulo} não pode ter ? ou #.`)
  if (!hostLocal(u.hostname)) {
    throw new Error(
      `Por segurança, a URL do ${rotulo} precisa apontar para esta máquina (127.0.0.1, localhost), ` +
        'para a rede local ou para a sua rede Tailscale. O endereço informado é público.'
    )
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Erro de rede do fetch (conexão recusada, DNS, tempo esgotado) em PT-BR. */
export function erroDeRede(e: unknown, servico: string, url: string, timeoutMs: number): Error {
  const err = e as { name?: string; message?: string; cause?: { code?: string } }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new Error(`${servico} demorou mais de ${Math.round(timeoutMs / 1000)} s para responder. Tente de novo ou use um modelo menor.`)
  }
  const causa = err?.cause as { code?: string; message?: string; errors?: Array<{ code?: string }> } | undefined
  const code = causa?.code ?? causa?.errors?.find((x) => x?.code)?.code ?? ''
  if (causa?.message === 'bad port') return new Error(`A porta de ${url} é bloqueada por segurança. Use outra porta para ${servico}.`)
  if (code === 'ECONNREFUSED') return new Error(`${servico} não está respondendo em ${url} (conexão recusada).`)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new Error(`Não encontrei o endereço de ${servico} (${url}). Confira a URL ou a internet.`)
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return new Error(`${servico} fechou a conexão no meio da resposta. Tente de novo.`)
  return new Error(`Falha ao falar com ${servico}: ${err?.message ?? String(e)}`)
}
