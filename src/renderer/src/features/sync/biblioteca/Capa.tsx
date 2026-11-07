import type { ReactElement } from 'react'

/** Matiz estável derivado do título (mesmo título → mesma cor). */
export function hueOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

/** Quebra o título em até `max` linhas de ~`width` caracteres. */
export function wrapTitle(title: string, width = 13, max = 4): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > max) {
    const kept = lines.slice(0, max)
    kept[max - 1] = `${kept[max - 1] ?? ''}…`
    return kept
  }
  return lines.length ? lines : ['Sem título']
}

/**
 * Capa tipográfica gerada (quando o livro não tem assets/capa-frente.png):
 * cor chapada derivada do título, filete, ornamento e título em serifa.
 */
export function CapaTipografica({ title, author = '', className }: { title: string; author?: string; className?: string }): ReactElement {
  const h = hueOf(title)
  const bg = `hsl(${h} 30% 13%)`
  const ink = `hsl(${h} 48% 70%)`
  const paper = `hsl(${h} 30% 92%)`
  const lines = wrapTitle(title)
  const size = lines.length > 3 ? 20 : lines.some((l) => l.length > 10) ? 23 : 27
  const lh = size * 1.12
  const y0 = 200 - ((lines.length - 1) * lh) / 2
  return (
    <svg className={className} viewBox="0 0 200 290" role="img" aria-label={`Capa: ${title}`} preserveAspectRatio="xMidYMid meet">
      <rect width="200" height="290" fill={bg} />
      <rect x="9" y="9" width="182" height="272" fill="none" stroke={ink} strokeWidth=".8" opacity=".7" />
      <rect x="14" y="14" width="172" height="262" fill="none" stroke={ink} strokeWidth=".4" opacity=".4" />
      {author && (
        <text x="100" y="42" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="10.5" letterSpacing="3.5" fill={ink}>
          {author.toUpperCase().slice(0, 28)}
        </text>
      )}
      <g transform="translate(100 104)" fill="none" stroke={ink} strokeWidth="1">
        <circle r="30" opacity=".35" />
        <circle r="21" opacity=".6" strokeDasharray="1 2.4" />
        <path d="M0 -15 L9 0 L0 15 L-9 0Z" fill={ink} stroke="none" />
        <path d="M-46 0h22M24 0h22" opacity=".6" />
      </g>
      {lines.map((l, i) => (
        <text
          key={i}
          x="100"
          y={y0 + i * lh}
          textAnchor="middle"
          fontFamily="Cormorant Garamond, serif"
          fontSize={size}
          fontWeight={i === lines.length - 1 ? 600 : 500}
          fill={paper}
        >
          {l}
        </text>
      ))}
      <rect width="13" height="290" fill="#000" opacity=".3" />
    </svg>
  )
}
