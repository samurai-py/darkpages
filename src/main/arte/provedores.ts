import { randomUUID } from 'node:crypto'
import { validarUrlLocal } from '../ai/rede'
import type { ArteSettings, ProvedorId, TesteResultado } from './tipos'

/**
 * Provedores de imagem. Cada um recebe prompt, negativo, semente e tamanho e
 * devolve os bytes da imagem (PNG). Endpoints conforme a documentação:
 *
 * ComfyUI (docs.comfy.org "Routes" e script_examples/ do repositório):
 *   POST /prompt {prompt: <workflow em formato API>, client_id}  → {prompt_id, number, node_errors}
 *   GET  /history/{prompt_id}  → {[prompt_id]: {outputs: {[nó]: {images: [{filename, subfolder, type}]}}, status}}
 *   GET  /view?filename=&subfolder=&type=  → bytes da imagem
 *   GET  /object_info, /object_info/{classe}  → nós instalados (checagem do workflow e lista de checkpoints)
 *   GET  /system_stats  → teste de conexão
 *   POST /interrupt {prompt_id}  e  POST /queue {delete: [prompt_id]}  → cancelar
 *
 * OpenAI Images (developers.openai.com, Images › generate):
 *   POST https://api.openai.com/v1/images/generations {model, prompt, size, quality, output_format}
 *   → {data: [{b64_json}]}. Modelo padrão documentado: gpt-image-2. A família
 *   gpt-image-2 aceita tamanho livre LxA (múltiplos de 16, proporção entre 1:3
 *   e 3:1); os demais modelos aceitam 1024x1024, 1536x1024 e 1024x1536.
 *   Não há semente nem prompt negativo: o negativo vira "Avoid: …" no texto.
 */

export const ARTE_DEFAULTS: ArteSettings = {
  provedor: 'off',
  comfyUrl: 'http://127.0.0.1:8188',
  // checkpoint do exemplo oficial do ComfyUI (script_examples/basic_api_example.py)
  comfyCheckpoint: 'v1-5-pruned-emaonly.safetensors',
  comfyLado: 512,
  comfyPassos: 20,
  comfyCfg: 8,
  comfyWorkflow: '',
  openaiKey: '',
  openaiModel: 'gpt-image-2',
  openaiQualidade: 'auto'
}

/** Modelos listados na referência da OpenAI (o campo aceita qualquer texto). */
export const OPENAI_MODELOS = ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-1.5', 'gpt-image-1-mini', 'chatgpt-image-latest']

export interface PedidoImagem {
  prompt: string
  negativo: string
  semente: number
  largura: number
  altura: number
  signal: AbortSignal
}

export interface ResultadoImagem {
  bytes: Buffer
  modelo: string
  /** false quando o provedor ignora a semente (OpenAI) */
  usouSemente: boolean
}

export interface Provedor {
  id: Exclude<ProvedorId, 'off'>
  gerar(p: PedidoImagem): Promise<ResultadoImagem>
}

export const NOME_PROVEDOR: Record<ProvedorId, string> = {
  off: 'Desligado',
  comfyui: 'Gerador local (ComfyUI)',
  openai: 'OpenAI Images'
}

// ---------------------------------------------------------------------------
// tamanhos
// ---------------------------------------------------------------------------

function multiplo(v: number, m: number): number {
  return Math.max(m, Math.round(v / m) * m)
}

function limitarProporcao(r: number): number {
  return Math.min(3, Math.max(1 / 3, r))
}

/**
 * Tamanho pedido ao provedor para a proporção w:h. O pós-processo recorta
 * para a proporção exata depois (os provedores arredondam).
 */
export function tamanhoPara(s: ArteSettings, prop: [number, number]): { largura: number; altura: number } {
  const r = limitarProporcao(prop[0] / prop[1])
  if (s.provedor === 'openai') {
    if (/^gpt-image-2/.test(s.openaiModel)) {
      const area = 1536 * 1024
      return { largura: multiplo(Math.sqrt(area * r), 16), altura: multiplo(Math.sqrt(area / r), 16) }
    }
    if (r > 1.2) return { largura: 1536, altura: 1024 }
    if (r < 1 / 1.2) return { largura: 1024, altura: 1536 }
    return { largura: 1024, altura: 1024 }
  }
  const lado = Math.min(2048, Math.max(256, s.comfyLado || 512))
  const area = lado * lado
  return { largura: multiplo(Math.sqrt(area * r), 64), altura: multiplo(Math.sqrt(area / r), 64) }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function pedir(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const sinais = [AbortSignal.timeout(init.timeoutMs ?? 30_000)]
  if (init.signal) sinais.push(init.signal)
  try {
    // redirect: 'error' — um servidor não pode desviar o pedido para outro host
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any(sinais) })
  } catch (e) {
    const err = e as Error
    if (init.signal?.aborted) throw new Error('Cancelado')
    if (err.name === 'TimeoutError') throw new Error(`Sem resposta de ${new URL(url).host} (tempo esgotado)`)
    throw new Error(`Não foi possível conectar em ${new URL(url).origin}: ${(err.cause as Error | undefined)?.message ?? err.message}`)
  }
}

async function json<T>(res: Response, origem: string): Promise<T> {
  const texto = await res.text()
  if (!res.ok) throw new Error(`${origem} respondeu ${res.status}: ${resumirErro(texto)}`)
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error(`${origem} devolveu resposta inválida`)
  }
}

function resumirErro(texto: string): string {
  try {
    const j = JSON.parse(texto) as { error?: unknown; node_errors?: Record<string, { errors?: Array<{ message?: string; details?: string }>; class_type?: string }> }
    const partes: string[] = []
    const e = j.error
    if (typeof e === 'string') partes.push(e)
    else if (e && typeof e === 'object') {
      const o = e as { message?: string; details?: string }
      partes.push([o.message, o.details].filter(Boolean).join(' — '))
    }
    for (const [no, info] of Object.entries(j.node_errors ?? {})) {
      for (const er of info.errors ?? []) partes.push(`nó ${no} (${info.class_type ?? '?'}): ${[er.message, er.details].filter(Boolean).join(' — ')}`)
    }
    if (partes.length) return partes.join('; ').slice(0, 500)
  } catch {
    /* não era JSON */
  }
  return texto.slice(0, 300)
}

const esperar = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((ok, falha) => {
    const t = setTimeout(ok, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); falha(new Error('Cancelado')) }, { once: true })
  })

// ---------------------------------------------------------------------------
// ComfyUI
// ---------------------------------------------------------------------------

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>

/** txt2img padrão: o grafo do exemplo oficial (basic_api_example.py), com os valores do livro. */
export function workflowPadrao(s: ArteSettings, p: Omit<PedidoImagem, 'signal'>): Workflow {
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: s.comfyCfg,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed: p.semente,
        steps: s.comfyPassos
      }
    },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: s.comfyCheckpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1, height: p.altura, width: p.largura } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: p.prompt } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: p.negativo } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'folio', images: ['8', 0] } }
  }
}

/**
 * Preenche um workflow colado pelo usuário. Placeholders de texto
 * ({{prompt}}, {{negativo}}) ficam dentro de strings JSON; os numéricos
 * ({{semente}}, {{largura}}, {{altura}}) podem vir com ou sem aspas.
 */
export function preencherWorkflow(modelo: string, p: Omit<PedidoImagem, 'signal'>): Workflow {
  const esc = (s: string): string => JSON.stringify(s).slice(1, -1)
  let t = modelo
  for (const [k, v] of [['semente', p.semente], ['largura', p.largura], ['altura', p.altura]] as const) {
    t = t.split(`"{{${k}}}"`).join(String(v)).split(`{{${k}}}`).join(String(v))
  }
  t = t.split('{{prompt}}').join(esc(p.prompt)).split('{{negativo}}').join(esc(p.negativo))
  let obj: unknown
  try {
    obj = JSON.parse(t)
  } catch (e) {
    throw new Error(`Workflow próprio não é JSON válido: ${(e as Error).message}`)
  }
  return validarWorkflow(obj)
}

export function validarWorkflow(obj: unknown): Workflow {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Workflow precisa ser um objeto JSON')
  const o = obj as Record<string, unknown>
  if (Array.isArray(o.nodes)) throw new Error('Esse workflow está no formato da interface. No ComfyUI, exporte com "Export (API)".')
  const wf = (o.prompt && typeof o.prompt === 'object' ? o.prompt : o) as Record<string, unknown>
  const nos = Object.entries(wf)
  if (!nos.length) throw new Error('Workflow vazio')
  for (const [id, n] of nos) {
    if (!n || typeof n !== 'object' || typeof (n as { class_type?: unknown }).class_type !== 'string') {
      throw new Error(`Nó ${id} sem class_type: o workflow precisa estar em formato API`)
    }
  }
  if (!nos.some(([, n]) => /SaveImage|PreviewImage/.test((n as { class_type: string }).class_type))) {
    throw new Error('O workflow precisa de um nó SaveImage para devolver a imagem')
  }
  return wf as Workflow
}

const cacheNos = new Map<string, { em: number; nos: Set<string> }>()

async function nosInstalados(base: string, signal?: AbortSignal): Promise<Set<string>> {
  const c = cacheNos.get(base)
  if (c && Date.now() - c.em < 5 * 60_000) return c.nos
  const info = await json<Record<string, unknown>>(await pedir(`${base}/object_info`, { signal, timeoutMs: 60_000 }), 'ComfyUI')
  const nos = new Set(Object.keys(info))
  cacheNos.set(base, { em: Date.now(), nos })
  return nos
}

/** Lista de opções de um input COMBO (formato antigo [[...], {}] ou novo ["COMBO", {options}]). */
function opcoesCombo(def: unknown): string[] {
  if (!Array.isArray(def)) return []
  if (Array.isArray(def[0])) return (def[0] as unknown[]).filter((x): x is string => typeof x === 'string')
  if (def[0] === 'COMBO' && def[1] && typeof def[1] === 'object') {
    const op = (def[1] as { options?: unknown }).options
    return Array.isArray(op) ? op.filter((x): x is string => typeof x === 'string') : []
  }
  return []
}

export async function checkpointsComfy(base: string, signal?: AbortSignal): Promise<string[]> {
  const info = await json<Record<string, { input?: { required?: Record<string, unknown> } }>>(
    await pedir(`${base}/object_info/CheckpointLoaderSimple`, { signal }),
    'ComfyUI'
  )
  return opcoesCombo(info.CheckpointLoaderSimple?.input?.required?.ckpt_name)
}

/**
 * Valida a URL do ComfyUI com a mesma regra do Ollama (src/main/ai/rede.ts):
 * http/https, sem credenciais/query/fragmento, só host local, privado ou
 * Tailscale (link-local e metadados de nuvem ficam de fora). Todo acesso ao
 * ComfyUI (gerar, testar, checkpoints, cancelar) passa por aqui.
 */
export function baseUrl(u: unknown): string {
  return validarUrlLocal(u, 'ComfyUI')
}

interface HistItem {
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>
  status?: { status_str?: string; completed?: boolean; messages?: Array<[string, Record<string, unknown>]> }
}

export function comfyui(s: ArteSettings, opcoes: { intervaloMs?: number; limiteMs?: number } = {}): Provedor {
  const base = baseUrl(s.comfyUrl)
  const intervalo = opcoes.intervaloMs ?? 1000
  const limite = opcoes.limiteMs ?? 30 * 60_000
  return {
    id: 'comfyui',
    async gerar(p) {
      let wf: Workflow
      if (s.comfyWorkflow.trim()) {
        wf = preencherWorkflow(s.comfyWorkflow, p)
        const nos = await nosInstalados(base, p.signal)
        const faltam = [...new Set(Object.values(wf).map((n) => n.class_type))].filter((c) => !nos.has(c))
        if (faltam.length) throw new Error(`Nós que o seu workflow usa e o ComfyUI não tem: ${faltam.join(', ')}`)
      } else {
        wf = workflowPadrao(s, p)
      }
      const clientId = randomUUID()
      const enviado = await json<{ prompt_id?: string }>(
        await pedir(`${base}/prompt`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: wf, client_id: clientId }),
          signal: p.signal
        }),
        'ComfyUI'
      )
      const id = enviado.prompt_id
      if (!id) throw new Error('ComfyUI não devolveu prompt_id')
      const cancelar = (): void => {
        const corpo = (b: unknown): RequestInit => ({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(b),
          redirect: 'error',
          signal: AbortSignal.timeout(10_000)
        })
        void fetch(`${base}/queue`, corpo({ delete: [id] })).catch(() => undefined)
        void fetch(`${base}/interrupt`, corpo({ prompt_id: id })).catch(() => undefined)
      }
      p.signal.addEventListener('abort', cancelar, { once: true })
      try {
        const t0 = Date.now()
        for (;;) {
          await esperar(intervalo, p.signal)
          if (Date.now() - t0 > limite) throw new Error('ComfyUI demorou demais (30 min)')
          const hist = await json<Record<string, HistItem>>(await pedir(`${base}/history/${encodeURIComponent(id)}`, { signal: p.signal }), 'ComfyUI')
          const h = hist[id]
          if (!h) continue
          if (h.status?.status_str === 'error') {
            const msg = h.status.messages?.find((m) => m[0] === 'execution_error')?.[1] as { exception_message?: string; node_type?: string } | undefined
            throw new Error(`ComfyUI falhou${msg?.node_type ? ` no nó ${msg.node_type}` : ''}: ${msg?.exception_message?.trim() ?? 'erro de execução'}`)
          }
          if (h.status && h.status.completed === false) continue
          const imagens = Object.values(h.outputs ?? {}).flatMap((o) => o.images ?? [])
          const img = imagens.find((i) => (i.type ?? 'output') === 'output') ?? imagens[0]
          if (!img) {
            if (h.status?.completed) throw new Error('O workflow terminou sem imagem de saída')
            continue
          }
          const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
          const r = await pedir(`${base}/view?${q}`, { signal: p.signal, timeoutMs: 120_000 })
          if (!r.ok) throw new Error(`ComfyUI /view respondeu ${r.status}`)
          return { bytes: Buffer.from(await r.arrayBuffer()), modelo: s.comfyWorkflow.trim() ? 'workflow próprio' : s.comfyCheckpoint, usouSemente: true }
        }
      } finally {
        p.signal.removeEventListener('abort', cancelar)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI Images
// ---------------------------------------------------------------------------

export function openai(s: ArteSettings, chave: string): Provedor {
  if (!chave) throw new Error('Chave da OpenAI não configurada (Ajustes › Arte).')
  return {
    id: 'openai',
    async gerar(p) {
      const prompt = p.negativo.trim() ? `${p.prompt}\n\nAvoid: ${p.negativo}` : p.prompt
      const r = await json<{ data?: Array<{ b64_json?: string }> }>(
        await pedir('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
          body: JSON.stringify({
            model: s.openaiModel,
            prompt: prompt.slice(0, 32000),
            n: 1,
            size: `${p.largura}x${p.altura}`,
            quality: s.openaiQualidade,
            output_format: 'png'
          }),
          signal: p.signal,
          timeoutMs: 10 * 60_000
        }),
        'OpenAI'
      )
      const b64 = r.data?.[0]?.b64_json
      if (!b64) throw new Error('OpenAI não devolveu imagem')
      return { bytes: Buffer.from(b64, 'base64'), modelo: s.openaiModel, usouSemente: false }
    }
  }
}

// ---------------------------------------------------------------------------

export function criarProvedor(s: ArteSettings, chaveOpenai: string): Provedor {
  if (s.provedor === 'comfyui') return comfyui(s)
  if (s.provedor === 'openai') return openai(s, chaveOpenai)
  throw new Error('Gerador de imagens desligado. Escolha ComfyUI ou OpenAI em Ajustes › Arte.')
}

export async function testarProvedor(s: ArteSettings, chaveOpenai: string): Promise<TesteResultado> {
  try {
    if (s.provedor === 'off') return { ok: false, mensagem: 'Gerador desligado.' }
    if (s.provedor === 'comfyui') {
      const base = baseUrl(s.comfyUrl)
      const st = await json<{ system?: { comfyui_version?: string }; devices?: Array<{ name?: string; vram_total?: number }> }>(
        await pedir(`${base}/system_stats`, { timeoutMs: 8000 }),
        'ComfyUI'
      )
      const disp = st.devices?.[0]
      const versao = st.system?.comfyui_version ? ` ${st.system.comfyui_version}` : ''
      const gpu = disp?.name ? ` · ${disp.name}${disp.vram_total ? ` (${Math.round(disp.vram_total / 2 ** 30)} GB)` : ''}` : ''
      const checkpoints = await checkpointsComfy(base)
      if (s.comfyWorkflow.trim()) {
        const wf = preencherWorkflow(s.comfyWorkflow, { prompt: 'teste', negativo: '', semente: 1, largura: 512, altura: 512 })
        const nos = await nosInstalados(base)
        const faltam = [...new Set(Object.values(wf).map((n) => n.class_type))].filter((c) => !nos.has(c))
        if (faltam.length) return { ok: false, mensagem: `Conectado ao ComfyUI${versao}, mas faltam nós do seu workflow: ${faltam.join(', ')}`, checkpoints }
        return { ok: true, mensagem: `ComfyUI${versao} conectado${gpu}. Workflow próprio válido.`, checkpoints }
      }
      if (!checkpoints.includes(s.comfyCheckpoint)) {
        return {
          ok: false,
          mensagem: checkpoints.length
            ? `ComfyUI${versao} conectado${gpu}, mas o checkpoint "${s.comfyCheckpoint}" não está instalado. Escolha um da lista.`
            : `ComfyUI${versao} conectado${gpu}, mas não há checkpoints em models/checkpoints.`,
          checkpoints
        }
      }
      return { ok: true, mensagem: `ComfyUI${versao} conectado${gpu}. Checkpoint encontrado.`, checkpoints }
    }
    if (!chaveOpenai) return { ok: false, mensagem: 'Informe a chave da OpenAI.' }
    // GET /v1/models/{model}: confirma chave e acesso ao modelo, sem custo
    const r = await pedir(`https://api.openai.com/v1/models/${encodeURIComponent(s.openaiModel)}`, {
      headers: { authorization: `Bearer ${chaveOpenai}` },
      timeoutMs: 15_000
    })
    if (r.status === 401) return { ok: false, mensagem: 'A OpenAI recusou a chave (401).' }
    if (r.status === 404) return { ok: false, mensagem: `Chave aceita, mas o modelo "${s.openaiModel}" não existe ou sua conta não tem acesso.` }
    if (!r.ok) return { ok: false, mensagem: `OpenAI respondeu ${r.status}: ${resumirErro(await r.text())}` }
    return { ok: true, mensagem: `Chave válida e modelo ${s.openaiModel} disponível.` }
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message }
  }
}
