import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import '@fontsource/inter-tight/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './index.css'
import { AppRoot } from './app/AppRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is a nice-to-have, not a hard requirement */ })
  })
}
