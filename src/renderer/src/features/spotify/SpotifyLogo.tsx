import type { ReactElement } from 'react'

/** Marca do Spotify: círculo verde com três arcos. */
export function SpotifyLogo({ size = 18, label = 'Spotify' }: { size?: number; label?: string | null }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label ?? undefined} aria-hidden={label ? undefined : true}>
      <circle cx="12" cy="12" r="11" fill="#1DB954" />
      <path
        d="M6.5 9.2c3.8-1.1 8-.8 11.2 1M7.2 12.3c3.1-.9 6.4-.6 9.1.9M7.8 15.2c2.5-.7 5-.5 7.1.7"
        stroke="#0B0C11"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
