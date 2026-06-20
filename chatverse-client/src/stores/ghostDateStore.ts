import { create } from 'zustand'
import type {
  GhostDateRegistration,
  ActiveGhostDate,
  GhostDateMessage,
  GhostDateHistoryRow,
} from '../types/ghostDate'

interface GhostDateState {
  registration:    GhostDateRegistration | null
  activeDate:      ActiveGhostDate | null
  thread:          GhostDateMessage[]
  history:         GhostDateHistoryRow[]
  loaded:          boolean

  setRegistration: (r: GhostDateRegistration | null) => void
  setActiveDate:   (d: ActiveGhostDate | null) => void
  setThread:       (m: GhostDateMessage[]) => void
  appendMessage:   (m: GhostDateMessage) => void
  setHistory:      (h: GhostDateHistoryRow[]) => void
  applyOutcome:    (id: string, outcome: ActiveGhostDate['outcome'], theirDisplay?: string | null) => void
  markLoaded:      () => void
}

export const useGhostDateStore = create<GhostDateState>((set) => ({
  registration: null,
  activeDate:   null,
  thread:       [],
  history:      [],
  loaded:       false,

  setRegistration: (r) => set(() => ({ registration: r })),
  setActiveDate:   (d) => set(() => ({ activeDate: d })),
  setThread:       (m) => set(() => ({ thread: m })),

  appendMessage: (m) =>
    set((s) => {
      // Idempotent on id — local-echo + server-push race protection.
      if (s.thread.some((x) => x.id === m.id)) return {}
      return { thread: [...s.thread, m] }
    }),

  setHistory: (h) => set(() => ({ history: h })),

  applyOutcome: (id, outcome, theirDisplay) =>
    set((s) => {
      if (!s.activeDate || s.activeDate.id !== id) return {}
      return {
        activeDate: {
          ...s.activeDate,
          outcome,
          theirDisplay: theirDisplay ?? s.activeDate.theirDisplay,
        },
      }
    }),

  markLoaded: () => set(() => ({ loaded: true })),
}))
