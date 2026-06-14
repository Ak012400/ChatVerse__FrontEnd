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
//   load). It stays up until App fires `cv:app-ready` — that happens
//   AFTER the auth bootstrap (authApi.me) resolves, because until then
//   every route guard returns `null` and the real UI is blank.
//
//   Floors:
//     • MIN_DISPLAY_MS = 450  — looks bad if the splash flashes too brief
//   Ceilings (safety):
//     • MAX_DISPLAY_MS = 8000 — never hold the splash hostage if app-ready
//                               somehow never fires (e.g. JS crash before
//                               App.tsx mounts). Better to show a broken
//                               UI than an infinite splash.
{
  const splash = document.getElementById('cv-splash')
  if (splash) {
    const MIN_DISPLAY_MS = 450
    const MAX_DISPLAY_MS = 8000
    const start = performance.now()
    let teardownStarted = false

    const teardown = () => {
      if (teardownStarted) return
      teardownStarted = true
      const elapsed = performance.now() - start
      const wait = Math.max(0, MIN_DISPLAY_MS - elapsed)
      window.setTimeout(() => {
        splash.classList.add('cv-fade')
        // Remove from DOM after the 350ms CSS transition completes.
        window.setTimeout(() => splash.remove(), 400)
      }, wait)
    }

    const onAppReady = () => {
      // One extra paint cycle so the route's first frame commits
      // BEFORE we start the fade — eliminates the post-fade black flash.
      requestAnimationFrame(() => requestAnimationFrame(teardown))
    }
    window.addEventListener('cv:app-ready', onAppReady, { once: true })

    // Safety net — if app-ready never fires (catastrophic load failure),
    // give up after 8s rather than holding the splash forever.
    window.setTimeout(teardown, MAX_DISPLAY_MS)
  }
}
