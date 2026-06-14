import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n' // bootstrap react-i18next before anything renders
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// ── Splash teardown.
//   The inline #cv-splash in index.html paints before the React bundle
//   parses (otherwise users see a black flash for 200-1500ms on cold
//   load). We let it linger one paint cycle past mount so the first
//   real frame is ready underneath, then fade it out.
//
//   Min display = 450ms — anything shorter and the splash flashes too
//   briefly to read on a fast connection, which feels jarring.
{
  const splash = document.getElementById('cv-splash')
  if (splash) {
    const MIN_DISPLAY_MS = 450
    const start = performance.now()
    const hide = () => {
      const elapsed = performance.now() - start
      const wait = Math.max(0, MIN_DISPLAY_MS - elapsed)
      window.setTimeout(() => {
        splash.classList.add('cv-fade')
        // Remove from DOM after the 350ms CSS transition completes.
        window.setTimeout(() => splash.remove(), 400)
      }, wait)
    }
    // requestAnimationFrame ensures React has committed its first frame.
    requestAnimationFrame(() => requestAnimationFrame(hide))
  }
}
