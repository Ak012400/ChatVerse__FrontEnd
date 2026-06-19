import { create } from 'zustand'
import type { PersonaCard, StreakRow, PersonaMessage } from '../types/persona'

// ============================================================
//  personaStore — local cache for today's persona, streaks list,
//  discover feed, and per-conversation message threads.
//
//  Threads are keyed by `otherPersonaId` — the persona id of the
//  party on the other end of the conversation TODAY. When the day
//  rolls over, the thread "moves" to the other party's new persona
//  id at next load — same underlying real-user pair, fresh key.
// ============================================================

interface PersonaState {
  myPersona:        PersonaCard | null
  streaks:          StreakRow[]
  discover:         PersonaCard[]
  threads:          Record<string, PersonaMessage[]>   // key = otherPersonaId

  myPersonaLoaded:  boolean
  streaksLoaded:    boolean
  discoverLoaded:   boolean
  loadingThread:    Record<string, boolean>

  setMyPersona:     (p: PersonaCard) => void
  setStreaks:       (s: StreakRow[]) => void
  setDiscover:      (p: PersonaCard[]) => void
  setThread:        (otherPersonaId: string, msgs: PersonaMessage[]) => void
  appendToThread:   (otherPersonaId: string, msg: PersonaMessage) => void
  setLoadingThread: (otherPersonaId: string, loading: boolean) => void
  /** A streak just unmasked — flip its flag in the local list. */
  applyStreakUnmasked: (streakId: string) => void
}

export const usePersonaStore = create<PersonaState>((set) => ({
  myPersona:       null,
  streaks:         [],
  discover:        [],
  threads:         {},

  myPersonaLoaded: false,
  streaksLoaded:   false,
  discoverLoaded:  false,
  loadingThread:   {},

  setMyPersona: (p) => set(() => ({ myPersona: p, myPersonaLoaded: true })),
  setStreaks:   (s) => set(() => ({ streaks: s, streaksLoaded: true })),
  setDiscover:  (p) => set(() => ({ discover: p, discoverLoaded: true })),

  setThread: (otherPersonaId, msgs) =>
    set((s) => ({ threads: { ...s.threads, [otherPersonaId]: msgs } })),

  appendToThread: (otherPersonaId, msg) =>
    set((s) => {
      const existing = s.threads[otherPersonaId] ?? []
      // Idempotent — server-push could race with optimistic local.
      if (existing.some((m) => m.id === msg.id)) return {}
      return { threads: { ...s.threads, [otherPersonaId]: [...existing, msg] } }
    }),

  setLoadingThread: (otherPersonaId, loading) =>
    set((s) => ({ loadingThread: { ...s.loadingThread, [otherPersonaId]: loading } })),

  applyStreakUnmasked: (streakId) =>
    set((s) => ({
      streaks: s.streaks.map((r) =>
        r.streakId === streakId ? { ...r, unmasked: true, canUnmask: false } : r,
      ),
    })),
}))
