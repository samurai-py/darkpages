import { bookDir, num, type Handlers } from '../api/context'
import type { CoverSettings } from '../../shared/types'
import { exportCover } from '../layout/cover-export'
import { exportEpub } from '../layout/epub'
import { listFonts } from '../layout/fonts'
import { preflight } from '../layout/preflight'
import { previewPages } from '../layout/preview'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Aceita só os campos conhecidos da capa, com tipos certos. */
function coverOpts(v: unknown): Partial<CoverSettings> & { paginas?: number } {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Opções de capa inválidas')
  const o = v as Record<string, unknown>
  const out: Partial<CoverSettings> & { paginas?: number } = {}
  if (typeof o['sinopse'] === 'string') out.sinopse = o['sinopse'].slice(0, 6000)
  for (const k of ['fundo', 'texto', 'destaque'] as const) {
    const c = o[k]
    if (typeof c === 'string' && HEX.test(c)) out[k] = c
  }
  if (typeof o['codigoBarras'] === 'boolean') out.codigoBarras = o['codigoBarras']
  if (typeof o['paginas'] === 'number' && Number.isFinite(o['paginas']) && o['paginas'] > 0 && o['paginas'] < 5000) {
    out.paginas = Math.round(o['paginas'])
  }
  return out
}

/** Métodos da feature "diagramacao". */
export const handlers: Handlers = {
  /** (dir, paginaInicial, quantidade, ppi?) → páginas em PNG (data URL), mapa de capítulos e geometria */
  'diagramacao.previa': async (ctx, dir, inicio, quantidade, ppi) =>
    previewPages(await bookDir(ctx, dir), ctx.resourcesDir, num(inicio), num(quantidade), ppi === undefined ? 96 : num(ppi)),

  /** (dir, opts?) → PDF da capa aberta em <livro>/export/<slug>-capa.pdf + prévia */
  'diagramacao.capa': async (ctx, dir, opts) => exportCover(await bookDir(ctx, dir), ctx.resourcesDir, coverOpts(opts)),

  /** (dir) → EPUB 3 em <livro>/export/<slug>.epub */
  'diagramacao.epub': async (ctx, dir) => exportEpub(await bookDir(ctx, dir)),

  /** (dir) → lista {nivel: ok|aviso|erro, texto} */
  'diagramacao.checar': async (ctx, dir) => preflight(await bookDir(ctx, dir), ctx.resourcesDir),

  /** () → fontes que o Typst enxerga */
  'diagramacao.fontes': async (ctx) => listFonts(ctx.resourcesDir)
}
