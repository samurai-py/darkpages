import { memo, useEffect, useRef, useState, type ReactElement } from 'react'
import { fileToDataUrl, folio } from '../../api'
import { PREFIXO_IMAGEM_CARTAO, imagemCartaoValida, type EnredoBoard } from '../../../../shared/models'

// ---------------------------------------------------------------------------
// Imagens dos cartões do Enredo: arquivos em <livro>/assets/, mostrados como
// blob: URLs (mais leves que data URLs gigantes no DOM). Cache pequeno por
// livro + nome, com contagem de quem está mostrando: o LRU só despeja (e
// revoga) entradas que ninguém usa; trocar/remover a imagem despeja na hora.
// ---------------------------------------------------------------------------
interface Entrada {
  url: string | null
  refs: number
}

const MAX_CACHE = 120
const cache = new Map<string, Entrada>()
const pendentes = new Map<string, Promise<string | null>>()
const ouvintes = new Set<(chave: string) => void>()

function chave(dir: string, nome: string): string {
  return `${dir}\u0000${nome}`
}

function dataUrlParaBlobUrl(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.*)$/s)
  if (!m || !m[2]) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: m[1] }))
}

function revogar(e: Entrada | undefined): void {
  if (e?.url) URL.revokeObjectURL(e.url)
}

/** Mantém o cache no limite, despejando as entradas mais antigas sem ninguém mostrando. */
function aparar(): void {
  if (cache.size <= MAX_CACHE) return
  for (const [k, e] of cache) {
    if (cache.size <= MAX_CACHE) break
    if (e.refs > 0) continue
    revogar(e)
    cache.delete(k)
  }
}

function guardar(k: string, url: string | null): void {
  const antes = cache.get(k)
  if (antes?.url && antes.url !== url) revogar(antes)
  cache.delete(k)
  cache.set(k, { url, refs: antes?.refs ?? 0 })
  aparar()
}

function avisar(k: string): void {
  for (const f of ouvintes) f(k)
}

/** Lê do cache (marcando como recém-usada) ou do disco. */
function carregar(dir: string, nome: string): Promise<string | null> {
  const k = chave(dir, nome)
  const e = cache.get(k)
  if (e) {
    cache.delete(k)
    cache.set(k, e)
    return Promise.resolve(e.url)
  }
  const pendente = pendentes.get(k)
  if (pendente) return pendente
  const p = folio.assets
    .get(dir, nome)
    .catch(() => null)
    .then((dataUrl) => {
      pendentes.delete(k)
      // pode ter sido trocada enquanto lia: o que está no cache vale mais
      const ja = cache.get(k)
      if (ja) return ja.url
      const url = dataUrl ? dataUrlParaBlobUrl(dataUrl) : null
      guardar(k, url)
      return url
    })
  pendentes.set(k, p)
  return p
}

/** Grava no cache uma imagem recém-enviada (data URL) e avisa quem estiver mostrando. */
export function definirImagemCartao(dir: string, nome: string, dataUrl: string): void {
  const k = chave(dir, nome)
  guardar(k, dataUrlParaBlobUrl(dataUrl))
  avisar(k)
}

/** Tira uma imagem do cache (trocada, removida ou o cartão saiu do quadro). */
export function esquecerImagemCartao(dir: string, nome: string): void {
  const k = chave(dir, nome)
  const e = cache.get(k)
  if (!e) return
  revogar(e)
  cache.delete(k)
  avisar(k)
}

/**
 * Apaga de assets/ uma imagem que o Enredo enviou e que nenhum outro cartão
 * usa (o servidor também confere ao salvar; aqui cobre a que nem chegou a ser salva).
 */
export async function apagarImagemOrfa(dir: string, board: EnredoBoard, nome: string | undefined, exceto: string): Promise<void> {
  if (!nome || !nome.startsWith(PREFIXO_IMAGEM_CARTAO)) return
  if (board.cartoes.some((c) => c.id !== exceto && c.imagem === nome)) return
  esquecerImagemCartao(dir, nome)
  await folio.assets.delete(dir, nome).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
/** maior lado guardado; acima disso a imagem é reduzida antes de ir para assets/ */
const MAX_LADO = 1600
const MAX_BYTES_SEM_REDUZIR = 1_500_000

export function ehImagemAceita(file: File): boolean {
  return file.type in TIPOS
}

/** Primeiro arquivo de imagem aceito numa lista (soltar, colar). */
export function imagemDe(files: FileList | File[] | null | undefined): File | null {
  for (const f of files ? Array.from(files) : []) if (ehImagemAceita(f)) return f
  return null
}

/** Reduz imagens grandes (mantém o formato); pequenas vão como estão. */
async function prepararImagem(file: File): Promise<{ dataUrl: string; ext: string }> {
  const ext = TIPOS[file.type]
  if (!ext) throw new Error('Use PNG, JPEG ou WebP.')
  const original = await fileToDataUrl(file)
  const img = new Image()
  img.src = original
  await img.decode().catch(() => {
    throw new Error('Não foi possível ler a imagem.')
  })
  const lado = Math.max(img.naturalWidth, img.naturalHeight)
  if (lado <= MAX_LADO && file.size <= MAX_BYTES_SEM_REDUZIR) return { dataUrl: original, ext }
  const escala = Math.min(1, MAX_LADO / lado)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala))
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Não foi possível processar a imagem.')
  g.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { dataUrl: canvas.toDataURL(file.type, 0.9), ext }
}

/** Envia a imagem para <livro>/assets/ como "cartao-<id>-<ts>.<ext>" e devolve o nome. */
export async function enviarImagemCartao(dir: string, cartaoId: string, file: File): Promise<string> {
  const { dataUrl, ext } = await prepararImagem(file)
  const nome = `${PREFIXO_IMAGEM_CARTAO}${cartaoId.slice(0, 60)}-${Date.now().toString(36)}.${ext}`
  if (!imagemCartaoValida(nome)) throw new Error('Nome de imagem inválido.')
  await folio.assets.put(dir, nome, dataUrl)
  definirImagemCartao(dir, nome, dataUrl)
  return nome
}

// ---------------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------------

/**
 * URL da imagem do cartão (undefined = ainda carregando; null = não existe).
 * Com `ativo` falso não lê nada (carga preguiçosa: só quando aparece na tela).
 */
export function useImagemCartao(dir: string, nome: string | undefined, ativo = true): string | null | undefined {
  const k = nome ? chave(dir, nome) : ''
  const [url, setUrl] = useState<string | null | undefined>(() => (k ? cache.get(k)?.url : null))
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!k) return
    const f = (alvo: string): void => {
      if (alvo === k) setVersao((v) => v + 1)
    }
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [k])

  useEffect(() => {
    if (!nome) {
      setUrl(null)
      return
    }
    const ja = cache.get(k)
    if (ja) setUrl(ja.url)
    else setUrl(undefined)
    if (!ativo && !ja) return
    let vivo = true
    // quem está mostrando segura a entrada (o LRU não revoga)
    let preso = false
    const prender = (): void => {
      const e = cache.get(k)
      if (e && !preso) {
        e.refs++
        preso = true
      }
    }
    if (ja) prender()
    void carregar(dir, nome).then((u) => {
      if (!vivo) return
      prender()
      setUrl(u)
    })
    return () => {
      vivo = false
      const e = cache.get(k)
      if (preso && e && e.refs > 0) e.refs--
    }
  }, [dir, nome, k, ativo, versao])

  return url
}

/** Miniatura da imagem do cartão: só lê o arquivo quando chega perto da tela. */
function CartaoImagemBase({ dir, nome, className }: { dir: string; nome: string; className: string }): ReactElement | null {
  const ref = useRef<HTMLSpanElement>(null)
  const [visivel, setVisivel] = useState(() => cache.has(chave(dir, nome)))

  useEffect(() => {
    if (visivel) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisivel(true)
          io.disconnect()
        }
      },
      { rootMargin: '240px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visivel])

  const url = useImagemCartao(dir, nome, visivel)
  if (url === null) return null
  return (
    <span ref={ref} className={`${className}${url ? '' : ' carregando'}`} aria-hidden="true">
      {url && <img src={url} alt="" draggable={false} decoding="async" />}
    </span>
  )
}

export const CartaoImagem = memo(CartaoImagemBase)
