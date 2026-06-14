import { create } from 'zustand'
import type { SpeechLang } from '../hooks/useSpeechRecognition'

/**
 * User's caption preferences. Persisted to localStorage so the choice
 * survives reloads but doesn't need a server round-trip.
 *
 * Two separate settings on purpose:
 *   • spokenLang  — used by the speaker's Web Speech recogniser
 *                   (BCP-47, e.g. 'hi-IN' — region matters for accuracy)
 *   • preferredLang — used by the listener's translation target
 *                     (ISO short, e.g. 'hi' — region not needed for MT)
 */
interface CaptionsState {
  spokenLang: SpeechLang
  preferredLang: string
  enabled: boolean
  setSpokenLang: (l: SpeechLang) => void
  setPreferredLang: (l: string) => void
  setEnabled: (e: boolean) => void
}

const LS_KEY = 'chatverse:captions'

interface Persisted {
  spokenLang: SpeechLang
  preferredLang: string
  enabled: boolean
}
const defaults: Persisted = { spokenLang: 'en-IN', preferredLang: 'en', enabled: false }

function loadInitial(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      spokenLang: parsed.spokenLang ?? defaults.spokenLang,
      preferredLang: parsed.preferredLang ?? defaults.preferredLang,
      enabled: parsed.enabled ?? defaults.enabled,
    }
  } catch { return defaults }
}

function persist(s: Persisted) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export const useCaptionsStore = create<CaptionsState>((set, get) => {
  const init = loadInitial()
  return {
    ...init,
    setSpokenLang: (l) => { set({ spokenLang: l }); persist({ ...get(), spokenLang: l }) },
    setPreferredLang: (l) => { set({ preferredLang: l }); persist({ ...get(), preferredLang: l }) },
    setEnabled: (e) => { set({ enabled: e }); persist({ ...get(), enabled: e }) },
  }
})
