/**
 * Os 6 temas do Darkpages. Cada um define paleta, tipografia e forma dos controles
 * como CSS custom properties aplicadas em <html>. Padrão: Sangue & Cromo.
 * Sem degradês nos controles: acentos são cores chapadas.
 */

export type ThemeKey = 'gotico' | 'vigilia' | 'scriptorium' | 'grimorio' | 'atelier' | 'mare'

interface ThemeDef {
  name: string
  light: boolean
  bg: string
  bar: string
  panel: string
  line: string
  text: string
  muted: string
  acc: string
  /** acento do botão principal (chapado) */
  accs: string
  acch: string
  acc2: string
  accink: string
  alert: string
  paper: string
  paperink: string
  pacc: string
  hl: string
  fd: string
  fb: string
  fu: string
  dt: string
  dls: string
  rad: string
  bfill?: string
  bline?: string
  sel?: string
  selink?: string
  desk?: string
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  gotico: {
    name: 'Sangue & Cromo', light: false,
    bg: '#070707', bar: 'rgba(14,14,14,.86)', panel: '#111111', line: '#262626', text: '#EDEDED', muted: '#9A9A9A',
    acc: '#E0303C', accs: '#C1121F', acch: '#E0303C', acc2: '#CFCFCF', accink: '#FFFFFF', alert: '#FF4D5A',
    paper: '#0F0F0F', paperink: '#E6E6E6', pacc: '#E0303C', hl: 'rgba(193,18,31,.22)',
    fd: "'Grenze Gotisch', serif", fb: "'Cormorant Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'none', dls: '.01em', rad: '14px', bfill: '#121212', bline: '#2E2E2E', sel: '#E6E6E6', selink: '#070707', desk: '#141414'
  },
  vigilia: {
    name: 'Vigília', light: false,
    bg: '#0B0C11', bar: 'rgba(14,15,21,.82)', panel: '#161922', line: 'rgba(216,178,110,.18)', text: '#ECE4D3', muted: '#A59E8E',
    acc: '#D8B26E', accs: '#D8B26E', acch: '#E6C17E', acc2: '#8FB3C9', accink: '#1A1408', alert: '#E9876B',
    paper: '#F1E8D6', paperink: '#221D16', pacc: '#7A5A22', hl: 'rgba(216,178,110,.22)',
    fd: "'Cormorant Garamond', serif", fb: "'EB Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'uppercase', dls: '.12em', rad: '10px'
  },
  scriptorium: {
    name: 'Scriptorium', light: true,
    bg: '#EFE6D2', bar: 'rgba(229,217,191,.85)', panel: '#F7F0E1', line: '#D2C19C', text: '#2B2118', muted: '#6E5F4C',
    acc: '#A3301F', accs: '#A3301F', acch: '#B83A27', acc2: '#2E4A8C', accink: '#F6E9C8', alert: '#A3301F',
    paper: '#FBF6EA', paperink: '#2B2118', pacc: '#A3301F', hl: 'rgba(184,138,46,.22)',
    fd: "'Cormorant Garamond', serif", fb: "'EB Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'none', dls: '.02em', rad: '6px'
  },
  grimorio: {
    name: 'Grimório', light: false,
    bg: '#120E1A', bar: 'rgba(25,19,31,.82)', panel: '#1D1628', line: 'rgba(169,139,224,.2)', text: '#E9E3F2', muted: '#A99FBA',
    acc: '#6CC4A8', accs: '#6CC4A8', acch: '#86D6BC', acc2: '#A98BE0', accink: '#120E1A', alert: '#F08A7E',
    paper: '#1B1524', paperink: '#E2DBEC', pacc: '#8FE0C5', hl: 'rgba(108,196,168,.18)',
    fd: "'Cormorant Garamond', serif", fb: "'EB Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'uppercase', dls: '.08em', rad: '14px'
  },
  atelier: {
    name: 'Atelier', light: true,
    bg: '#F6F5F1', bar: 'rgba(255,255,255,.88)', panel: '#FFFFFF', line: '#E4E2DC', text: '#161616', muted: '#5F5E5A',
    acc: '#E2501C', accs: '#E2501C', acch: '#C9431A', acc2: '#2F5BD3', accink: '#FFFFFF', alert: '#D63E12',
    paper: '#FFFFFF', paperink: '#161616', pacc: '#E2501C', hl: 'rgba(226,80,28,.12)',
    fd: "'EB Garamond', serif", fb: "'EB Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'none', dls: '0', rad: '10px'
  },
  mare: {
    name: 'Maré', light: false,
    bg: '#0B1A26', bar: 'rgba(15,34,50,.82)', panel: '#10263A', line: 'rgba(201,214,223,.16)', text: '#E3ECF2', muted: '#93A9B9',
    acc: '#F2876B', accs: '#F2876B', acch: '#F59C84', acc2: '#6FC2C0', accink: '#1A0E0A', alert: '#F7A08A',
    paper: '#EEF1EE', paperink: '#13222D', pacc: '#C85A3E', hl: 'rgba(242,135,107,.2)',
    fd: "'Cormorant Garamond', serif", fb: "'EB Garamond', serif", fu: "'Bricolage Grotesque Variable', sans-serif",
    dt: 'none', dls: '0', rad: '14px'
  }
}

export const THEME_ORDER: ThemeKey[] = ['gotico', 'vigilia', 'scriptorium', 'grimorio', 'atelier', 'mare']
const STORAGE_KEY = 'folio.theme'

export function applyTheme(key: ThemeKey): void {
  const t = THEMES[key]
  const vars: Record<string, string> = {
    bg: t.bg, bar: t.bar, panel: t.panel, line: t.line, text: t.text, muted: t.muted,
    acc: t.acc, accs: t.accs, acch: t.acch, acc2: t.acc2, accink: t.accink, alert: t.alert,
    paper: t.paper, paperink: t.paperink, pacc: t.pacc, hl: t.hl,
    fd: t.fd, fb: t.fb, fu: t.fu, dt: t.dt, dls: t.dls, rad: t.rad,
    bfill: t.bfill ?? t.panel,
    bline: t.bline ?? t.line,
    ring: t.light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)',
    pring: 'rgba(255,255,255,.4)',
    shadow: t.light ? 'rgba(40,30,10,.22)' : 'rgba(0,0,0,.6)',
    sel: t.sel ?? t.text,
    selink: t.selink ?? t.bg,
    chipbg: t.light ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.055)',
    desk: t.desk ?? (t.light ? '#D9D5CC' : '#1C1D22')
  }
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v)
  root.style.colorScheme = t.light ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* armazenamento indisponível: segue sem lembrar */
  }
}

export function savedTheme(): ThemeKey {
  try {
    const k = localStorage.getItem(STORAGE_KEY)
    if (k && k in THEMES) return k as ThemeKey
  } catch {
    /* ignora */
  }
  return 'gotico'
}
