import type { EstiloArte, Paleta, Proporcao, TipoSaida } from './tipos'

/**
 * Os 6 estilos de fábrica. Prompts em inglês porque os checkpoints locais
 * (SD 1.5, SDXL, Flux) foram treinados com legendas em inglês; a OpenAI
 * entende qualquer idioma.
 */

const NEG_BASE = 'text, lettering, watermark, signature, logo, frame border, blurry, lowres, jpeg artifacts, deformed, extra fingers'

const P_PADRAO: Record<TipoSaida, Proporcao> = { abertura: [16, 10], retrato: [3, 4], capa: 'livro' }

export const PRESETS: EstiloArte[] = [
  {
    id: 'gravura-pena',
    nome: 'Gravura à pena',
    descricao: 'Bico de pena com hachuras finas, como livro antigo.',
    prompt: 'pen and ink engraving, fine crosshatching, steel etching, antique book illustration, detailed linework',
    negativo: `${NEG_BASE}, photo, 3d render, smooth shading`,
    paleta: 'sepia',
    proporcoes: P_PADRAO,
    preset: true
  },
  {
    id: 'xilogravura',
    nome: 'Xilogravura',
    descricao: 'Talho largo em madeira, preto chapado e um vermelho.',
    prompt: 'woodcut print, bold carved lines, linocut, high contrast black ink with a single deep red ink, cream paper texture',
    negativo: `${NEG_BASE}, photo, gradient, 3d render, soft focus`,
    paleta: 'cor',
    proporcoes: P_PADRAO,
    preset: true
  },
  {
    id: 'art-nouveau',
    nome: 'Art nouveau',
    descricao: 'Linhas fluidas, moldura floral, verde e ouro.',
    prompt: 'art nouveau illustration, flowing organic lines, ornate floral arch, muted green and gold palette, decorative poster style',
    negativo: `${NEG_BASE}, photo, 3d render, modern`,
    paleta: 'cor',
    proporcoes: { abertura: [16, 10], retrato: [2, 3], capa: 'livro' },
    preset: true
  },
  {
    id: 'aquarela',
    nome: 'Aquarela',
    descricao: 'Lavadas suaves, papel aparente, contorno leve.',
    prompt: 'watercolor painting, soft washes, wet on wet, visible paper grain, delicate ink outlines, gentle light',
    negativo: `${NEG_BASE}, photo, 3d render, harsh lines, oversaturated`,
    paleta: 'cor',
    proporcoes: P_PADRAO,
    preset: true
  },
  {
    id: 'nanquim',
    nome: 'Nanquim',
    descricao: 'Pincel de tinta, traço expressivo, muito branco.',
    prompt: 'ink brush painting, sumi-e, bold expressive brush strokes, ink wash, generous negative space, white paper',
    negativo: `${NEG_BASE}, photo, 3d render, color`,
    paleta: 'mono',
    proporcoes: P_PADRAO,
    preset: true
  },
  {
    id: 'ornamento',
    nome: 'Ornamento',
    descricao: 'Vinheta simétrica, filigrana, centrada.',
    prompt: 'symmetrical ornamental vignette, decorative flourish, filigree scrollwork, perfect bilateral symmetry, centered, isolated on plain background, engraved style',
    negativo: `${NEG_BASE}, photo, people, asymmetry, busy background`,
    paleta: 'mono',
    proporcoes: { abertura: [2, 1], retrato: [1, 1], capa: 'livro' },
    preset: true
  }
]

export const ESTILO_PADRAO = 'gravura-pena'

export const PALETAS: Paleta[] = ['mono', 'sepia', 'cor']

/** Modificadores de prompt por paleta (o pós-processo também converte a imagem). */
export const PALETA_PROMPT: Record<Paleta, { prompt: string; negativo: string }> = {
  mono: { prompt: 'monochrome, black and white', negativo: 'color, colorful' },
  sepia: { prompt: 'sepia tone, aged paper', negativo: 'saturated colors' },
  cor: { prompt: '', negativo: '' }
}

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/

function proporcaoValida(v: unknown): Proporcao | null {
  if (v === 'livro') return 'livro'
  if (Array.isArray(v) && v.length === 2) {
    const [w, h] = v as unknown[]
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && w <= 100 && h <= 100 && w / h <= 3 && h / w <= 3) return [w, h]
  }
  return null
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max).trim() : ''
}

/** Valida e normaliza um estilo personalizado vindo da interface. */
export function normalizarEstilo(raw: unknown): EstiloArte {
  if (!raw || typeof raw !== 'object') throw new Error('Estilo inválido')
  const r = raw as Record<string, unknown>
  const id = texto(r.id, 61)
  if (!ID.test(id)) throw new Error('Id de estilo inválido')
  if (PRESETS.some((p) => p.id === id)) throw new Error('Estilos de fábrica não podem ser alterados; crie um novo.')
  const nome = texto(r.nome, 60)
  if (!nome) throw new Error('Dê um nome ao estilo')
  const prompt = texto(r.prompt, 1500)
  if (!prompt) throw new Error('O estilo precisa de um prompt base')
  const paleta = PALETAS.includes(r.paleta as Paleta) ? (r.paleta as Paleta) : 'cor'
  const prop = (r.proporcoes ?? {}) as Record<string, unknown>
  const base = PRESETS.find((p) => p.id === r.base)
  return {
    id,
    nome,
    descricao: texto(r.descricao, 200),
    prompt,
    negativo: texto(r.negativo, 1500),
    paleta,
    proporcoes: {
      abertura: proporcaoValida(prop.abertura) ?? [16, 10],
      retrato: proporcaoValida(prop.retrato) ?? [3, 4],
      capa: proporcaoValida(prop.capa) ?? 'livro'
    },
    preset: false,
    ...(base ? { base: base.id } : {})
  }
}

/** Id de documento (coleção "arte") de um estilo personalizado. */
export function docIdEstilo(id: string): string {
  return `estilo-${id}`
}
