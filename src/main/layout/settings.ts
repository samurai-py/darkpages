import {
  DEFAULT_LAYOUT,
  type ChapterLayout,
  type CoverSettings,
  type DropCapStyle,
  type FrontMatter,
  type LayoutSettings,
  type OpeningStyle
} from '../../shared/types'

/** LayoutSettings com todos os campos opcionais preenchidos. */
export type FullLayout = Required<LayoutSettings> & {
  front: FrontMatter
  cover: CoverSettings
  chapters: Record<string, ChapterLayout>
}

const HEX = /^#[0-9a-fA-F]{6}$/

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v : fallback
}

/** Completa um LayoutSettings (vindo do projeto.yaml, talvez antigo) com os padrões. */
export function resolveLayout(l: LayoutSettings): FullLayout {
  const d = DEFAULT_LAYOUT as Required<LayoutSettings> & { front: FrontMatter; cover: CoverSettings }
  const front = { ...d.front, ...(l.front ?? {}) }
  const cover = { ...d.cover, ...(l.cover ?? {}) }
  return {
    ...d,
    ...l,
    trim: { ...d.trim, ...l.trim },
    margins: { ...d.margins, ...l.margins },
    paper: { ...d.paper, ...l.paper },
    opening: l.opening ?? d.opening,
    openingArtPage: l.openingArtPage ?? d.openingArtPage,
    dropCap: l.dropCap ?? d.dropCap,
    dropCapLines: Math.min(5, Math.max(2, Math.round(l.dropCapLines ?? d.dropCapLines))),
    dropCapColor: color(l.dropCapColor, d.dropCapColor),
    sceneOrnament: l.sceneOrnament ?? d.sceneOrnament,
    chapterLabel: l.chapterLabel ?? d.chapterLabel,
    runningHead: l.runningHead ?? d.runningHead,
    folio: l.folio ?? d.folio,
    avoidWidows: l.avoidWidows ?? d.avoidWidows,
    chapters: l.chapters ?? {},
    front,
    cover: {
      ...cover,
      fundo: color(cover.fundo, d.cover.fundo),
      texto: color(cover.texto, d.cover.texto),
      destaque: color(cover.destaque, d.cover.destaque)
    }
  }
}

export function chapterOpening(l: FullLayout, file: string): OpeningStyle {
  return l.chapters[file]?.opening ?? l.opening
}

export function chapterDropCap(l: FullLayout, file: string): DropCapStyle {
  return l.chapters[file]?.dropCap ?? l.dropCap
}
