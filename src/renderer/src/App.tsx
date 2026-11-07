import { useState, type ReactElement } from 'react'
import type { Project } from '../../shared/types'
import { Icon, type IconName } from './icons'
import { THEMES, THEME_ORDER, applyTheme, savedTheme, type ThemeKey } from './themes'
import type { NavParams, Screen, ScreenProps } from './screen'
import { Biblioteca } from './screens/Biblioteca'
import { Manuscrito } from './screens/Manuscrito'
import { Diagramacao } from './screens/Diagramacao'
import { Universo } from './screens/Universo'
import { Enredo } from './screens/Enredo'
import { Mapas } from './screens/Mapas'
import { Idioma } from './screens/Idioma'
import { Revisor } from './screens/Revisor'
import { Arte } from './screens/Arte'
import { Ajustes } from './screens/Ajustes'

interface RailItem {
  icon: IconName
  label: string
  screen: Screen
}

const RAIL: RailItem[] = [
  { icon: 'biblioteca', label: 'Biblioteca', screen: 'biblioteca' },
  { icon: 'manuscrito', label: 'Manuscrito', screen: 'manuscrito' },
  { icon: 'universo', label: 'Universo', screen: 'universo' },
  { icon: 'enredo', label: 'Enredo', screen: 'enredo' },
  { icon: 'mapas', label: 'Mapas', screen: 'mapas' },
  { icon: 'idioma', label: 'Idioma', screen: 'idioma' }
]
const RAIL2: RailItem[] = [
  { icon: 'revisor', label: 'Revisor', screen: 'revisor' },
  { icon: 'arte', label: 'Arte', screen: 'arte' },
  { icon: 'diagramar', label: 'Diagramar', screen: 'diagramar' }
]

const CRUMB: Record<Screen, string> = {
  biblioteca: 'Biblioteca',
  manuscrito: 'Manuscrito',
  universo: 'Universo',
  enredo: 'Enredo',
  mapas: 'Mapas',
  idioma: 'Idioma',
  revisor: 'Revisor',
  arte: 'Estilos de arte',
  diagramar: 'Diagramação',
  ajustes: 'Ajustes'
}

const NO_BOOK: Screen[] = ['biblioteca', 'ajustes']

const SCREENS: Partial<Record<Screen, (p: ScreenProps) => ReactElement>> = {
  manuscrito: Manuscrito,
  universo: Universo,
  enredo: Enredo,
  mapas: Mapas,
  idioma: Idioma,
  revisor: Revisor,
  arte: Arte,
  diagramar: Diagramacao
}

function Emblem(): ReactElement {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="13.5" fill="none" style={{ stroke: 'var(--acc)' }} strokeWidth="1" />
      <circle cx="15" cy="15" r="10" fill="none" style={{ stroke: 'var(--acc)' }} strokeWidth=".5" strokeDasharray="1 2" />
      <path d="M15 6l5 9-5 9-5-9z" style={{ fill: 'var(--acc)' }} />
      <path d="M15 12v8" style={{ stroke: 'var(--bg)' }} strokeWidth="1.2" />
      <circle cx="15" cy="12" r="1.4" style={{ fill: 'var(--bg)' }} />
    </svg>
  )
}

export function App(): ReactElement {
  const [screen, setScreen] = useState<Screen>('biblioteca')
  const [params, setParams] = useState<NavParams>({})
  const [project, setProject] = useState<Project | null>(null)
  const [theme, setTheme] = useState<ThemeKey>(savedTheme())

  const go = (s: Screen, p: NavParams = {}): void => {
    setParams(p)
    setScreen(s)
  }

  const pickTheme = (k: ThemeKey): void => {
    applyTheme(k)
    setTheme(k)
  }

  const railButton = (it: RailItem): ReactElement => {
    const needsBook = !NO_BOOK.includes(it.screen)
    const disabled = needsBook && !project
    return (
      <button
        key={it.screen}
        type="button"
        className="railb"
        disabled={disabled}
        title={disabled ? 'Abra um livro primeiro' : it.label}
        aria-current={screen === it.screen ? 'page' : undefined}
        onClick={() => go(it.screen)}
      >
        <Icon name={it.icon} />
        {it.label}
      </button>
    )
  }

  const Current = SCREENS[screen]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Emblem />
          <span className="name">Folio</span>
          <span className="crumb">
            {project ? <>{project.meta.title} / </> : null}
            <b>{CRUMB[screen]}</b>
          </span>
        </div>
        <div className="themes" role="group" aria-label="Tema">
          <span className="label">{THEMES[theme].name}</span>
          {THEME_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className="tdot"
              aria-label={THEMES[k].name}
              aria-pressed={k === theme}
              title={THEMES[k].name}
              onClick={() => pickTheme(k)}
              style={{
                background: `linear-gradient(135deg, ${THEMES[k].bg} 0 50%, ${THEMES[k].acc} 50% 100%)`,
                boxShadow: k === theme ? '0 0 0 2px var(--bg), 0 0 0 3.5px var(--acc)' : '0 0 0 1px var(--line)'
              }}
            />
          ))}
        </div>
      </header>
      <div className="body">
        <nav className="rail" aria-label="Seções">
          {RAIL.map(railButton)}
          <span className="sep" />
          {RAIL2.map(railButton)}
          <span style={{ marginTop: 'auto' }} />
          {railButton({ icon: 'ajustes', label: 'Ajustes', screen: 'ajustes' })}
        </nav>
        {screen === 'biblioteca' && (
          <Biblioteca
            onOpen={(p) => {
              setProject(p)
              go('manuscrito')
            }}
            go={go}
          />
        )}
        {screen === 'ajustes' && <Ajustes />}
        {Current && project && <Current key={`${screen}-${project.dir}`} project={project} onProject={setProject} go={go} params={params} />}
      </div>
    </div>
  )
}
