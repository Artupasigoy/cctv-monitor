import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Kunci mode kiosk: tanpa menu konteks, tanpa navigasi browser, tanpa tab baru.
function lockKiosk() {
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase()
      if (['t', 'n', 'w', 'o', 'r', 's', 'p', 'u', 'j', 'h', 'l', 'd', 'f', 'g', 'e', 'i'].includes(k)) {
        e.preventDefault()
        return
      }
    }
    if (e.altKey && ['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) {
      e.preventDefault()
      return
    }
    if (['F5', 'F11', 'F3'].includes(e.key)) {
      e.preventDefault()
    }
  })
}

lockKiosk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
