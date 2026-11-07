import type { ReactElement } from 'react'

/** Ícones de apoio de Universo/Enredo, no mesmo traço de icons.tsx (1.35, preenchimento suave, detalhe no acento). */

const D = { fill: 'currentColor', fillOpacity: 0.16 } as const
const A = { style: { fill: 'var(--acc)' }, stroke: 'none' } as const

export type MiniIcone =
  | 'busca' | 'mais' | 'fechar' | 'lixo' | 'enviar' | 'faisca' | 'abrir' | 'subir' | 'descer'
  | 'importar' | 'arrastar' | 'capitulo' | 'ligar'
  | 'personagem' | 'lugar' | 'objeto' | 'grupo' | 'divindade'
  | 'cena' | 'virada' | 'ideia' | 'local' | 'fato'
  | 'fio' | 'leitor' | 'impacto' | 'historico'
  | 'provisorio' | 'canonico' | 'descartar' | 'memoria' | 'travar'

const P: Record<MiniIcone, ReactElement> = {
  /** fato do livro: lacre com fechadura (revelado na hora certa) */
  fato: (
    <>
      <path d="M6 4.5h12v15H6z" {...D} />
      <path d="M6 4.5h12v15H6zM9 8h6" />
      <circle cx="12" cy="13" r="1.8" {...A} />
      <path d="M12 14.6v2.4" />
    </>
  ),
  /** fio solto: linha que sai de um ponto e fica em aberto */
  fio: (
    <>
      <circle cx="6" cy="17.5" r="2.2" {...D} />
      <circle cx="6" cy="17.5" r="2.2" />
      <path d="M7.8 16.2c2.5-1.6 1-5.2 3.8-6.4 2.6-1.1 4.4 1.6 6.6-.6" />
      <path d="M18.2 9.2l1.6-1.6" strokeDasharray="1.6 1.8" />
      <circle cx="20.4" cy="6.4" r="1" {...A} />
    </>
  ),
  /** o que o leitor sabe: olho com página */
  leitor: (
    <>
      <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z" {...D} />
      <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="12" r="1" {...A} />
    </>
  ),
  /** impacto: ondas que se espalham adiante */
  impacto: (
    <>
      <circle cx="6.5" cy="12" r="2.2" {...A} />
      <path d="M10.5 7.5a6.5 6.5 0 010 9" />
      <path d="M14 5a10 10 0 010 14" />
      <path d="M17.5 3a13 13 0 010 18" strokeDasharray="2 2.4" />
    </>
  ),
  /** valor que muda ao longo do livro */
  historico: (
    <>
      <path d="M4 17.5h16" />
      <path d="M4 17.5V9l5 3.5 5-6 6 4" {...D} />
      <path d="M4 9l5 3.5 5-6 6 4" />
      <circle cx="14" cy="6.5" r="1.4" {...A} />
    </>
  ),
  /** ideia da IA ainda não aceita: contorno tracejado + faísca */
  provisorio: (
    <>
      <rect x="4" y="5" width="13" height="14" rx="2.2" strokeDasharray="2.4 2.2" />
      <path d="M17.5 3.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" {...A} />
      <path d="M7.5 10h6M7.5 13.5h4" />
    </>
  ),
  /** carimbo: vira plano do livro */
  canonico: (
    <>
      <path d="M12 3.5l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 20.5l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1z" {...D} />
      <path d="M12 3.5l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 20.5l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.6" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  descartar: (
    <>
      <rect x="4.5" y="5" width="15" height="14" rx="2.2" {...D} />
      <rect x="4.5" y="5" width="15" height="14" rx="2.2" />
      <path d="M3.5 20.5l17-17" style={{ stroke: 'var(--alert)' }} />
    </>
  ),
  /** memória do livro: páginas empilhadas com fita marcadora */
  memoria: (
    <>
      <path d="M6.5 4.5h10a1.5 1.5 0 011.5 1.5v13.5H8a1.5 1.5 0 01-1.5-1.5z" {...D} />
      <path d="M6.5 18V4.5h10a1.5 1.5 0 011.5 1.5v13.5H8a1.5 1.5 0 01-1.5-1.5zM6.5 18a1.5 1.5 0 011.5-1.5h10" />
      <path d="M12.5 4.5v6l1.6-1.2 1.6 1.2v-6" {...A} />
    </>
  ),
  /** cadeado: resumo editado pelo autor */
  travar: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" {...D} />
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
      <circle cx="12" cy="15.2" r="1.2" {...A} />
    </>
  ),
  busca: (
    <>
      <circle cx="10.5" cy="10.5" r="6" {...D} />
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  lixo: (
    <>
      <path d="M6.5 7.5h11l-1 12h-9z" {...D} />
      <path d="M4.5 7.5h15M9.5 7.5V5h5v2.5M6.5 7.5l1 12h9l1-12M10.5 11v5M13.5 11v5" />
    </>
  ),
  enviar: (
    <>
      <path d="M4.5 15.5v4h15v-4" />
      <path d="M12 15V4.5M7.5 9L12 4.5 16.5 9" />
      <circle cx="12" cy="18" r=".9" {...A} />
    </>
  ),
  faisca: (
    <>
      <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" {...D} />
      <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" {...A} />
    </>
  ),
  abrir: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5L11 13" />
      <path d="M17.5 13.5v6h-13v-13h6" />
    </>
  ),
  subir: <path d="M6 14l6-6 6 6" />,
  descer: <path d="M6 10l6 6 6-6" />,
  importar: (
    <>
      <path d="M4 5.5h6.5l1.5 2h8v11H4z" {...D} />
      <path d="M4 5.5h6.5l1.5 2h8v11H4z" />
      <path d="M12 10v6M9.3 13.3L12 16l2.7-2.7" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  arrastar: (
    <>
      <circle cx="9" cy="6.5" r="1.1" />
      <circle cx="15" cy="6.5" r="1.1" />
      <circle cx="9" cy="12" r="1.1" />
      <circle cx="15" cy="12" r="1.1" />
      <circle cx="9" cy="17.5" r="1.1" />
      <circle cx="15" cy="17.5" r="1.1" />
    </>
  ),
  capitulo: (
    <>
      <path d="M5.5 3.5h9l4 4v13h-13z" {...D} />
      <path d="M5.5 3.5h9l4 4v13h-13zM14.5 3.5v4h4M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4" />
    </>
  ),
  ligar: (
    <>
      <circle cx="5.5" cy="18.5" r="2.2" {...D} />
      <circle cx="5.5" cy="18.5" r="2.2" />
      <circle cx="18.5" cy="5.5" r="2.2" />
      <path d="M7.4 17.2C12 16 9.5 8.6 16.4 6.6" />
      <path d="M14.6 5.3l1.9 1.3-1 2" style={{ stroke: 'var(--acc)' }} />
    </>
  ),
  personagem: (
    <>
      <ellipse cx="12" cy="12.5" rx="7" ry="8.4" {...D} />
      <ellipse cx="12" cy="12.5" rx="7" ry="8.4" />
      <circle cx="12" cy="10.6" r="2.4" />
      <path d="M8.2 17.6c.8-2.1 2.2-3.2 3.8-3.2s3 1.1 3.8 3.2" />
    </>
  ),
  lugar: (
    <>
      <path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 10-13 0c0 4.8 6.5 11 6.5 11z" {...D} />
      <path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 10-13 0c0 4.8 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.2" {...A} />
    </>
  ),
  local: (
    <>
      <path d="M3.5 19.5l5-8 3.5 4.5 3-3.5 5.5 7z" {...D} />
      <path d="M3.5 19.5l5-8 3.5 4.5 3-3.5 5.5 7zM3.5 19.5h17" />
      <circle cx="17" cy="6.5" r="1.8" {...A} />
    </>
  ),
  objeto: (
    <>
      <path d="M12 3.5l6 6.5-6 10.5L6 10z" {...D} />
      <path d="M12 3.5l6 6.5-6 10.5L6 10zM6 10h12M12 3.5l-2 6.5 2 10.5 2-10.5z" />
    </>
  ),
  grupo: (
    <>
      <path d="M6.5 3.5h11v13l-5.5-3-5.5 3z" {...D} />
      <path d="M6.5 3.5h11v13l-5.5-3-5.5 3zM6.5 3.5v17" />
      <circle cx="12" cy="8.5" r="1.4" {...A} />
    </>
  ),
  divindade: (
    <>
      <circle cx="12" cy="12" r="4.2" {...D} />
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
      <circle cx="12" cy="12" r="1.2" {...A} />
    </>
  ),
  cena: (
    <>
      <path d="M4.5 6.5h15v11h-15z" {...D} />
      <path d="M4.5 6.5h15v11h-15zM4.5 9.5h15M8 6.5l-1.5 3M12.5 6.5L11 9.5M17 6.5l-1.5 3" />
      <circle cx="12" cy="13.5" r="1.1" {...A} />
    </>
  ),
  virada: (
    <>
      <path d="M4 16.5c3.5 0 4.5-9 8-9s4.5 9 8 9" />
      <path d="M17.5 14l2.5 2.5-2.5 2.5" style={{ stroke: 'var(--acc)' }} />
      <circle cx="12" cy="7.5" r="1.6" {...D} />
      <circle cx="12" cy="7.5" r="1.6" />
    </>
  ),
  ideia: (
    <>
      <path d="M12 3.5a5.5 5.5 0 00-3.2 10c.6.5 1 1.2 1 2v.5h4.4v-.5c0-.8.4-1.5 1-2A5.5 5.5 0 0012 3.5z" {...D} />
      <path d="M12 3.5a5.5 5.5 0 00-3.2 10c.6.5 1 1.2 1 2v.5h4.4v-.5c0-.8.4-1.5 1-2A5.5 5.5 0 0012 3.5zM9.8 19h4.4M10.6 21.2h2.8" />
      <circle cx="12" cy="9" r="1" {...A} />
    </>
  )
}

export function Mini({ name, size = 16 }: { name: MiniIcone; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {P[name]}
    </svg>
  )
}
