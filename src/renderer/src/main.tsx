import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { applyTheme, savedTheme } from './themes'

applyTheme(savedTheme())

const root = document.getElementById('root')
if (!root) throw new Error('#root não encontrado')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
