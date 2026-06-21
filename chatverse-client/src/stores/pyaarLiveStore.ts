import { create } from 'zustand'
import type {
  PyaarRegistration, ShowDto, MyCoupleDto, SpectatorCoupleRow,
  PyaarMessage, HistoryRow, DrilledCoupleView, EliminatedThreadRow,
} from '../types/pyaarLive'

/** A short-lived floating-emoji record, used by the reaction overlay
 *  on the spectator grid. We keep at most ~30 and prune by age. */
export interface FloatingReaction {
  id:        string
  emoji:     string
  coupleId:  string | null
  createdAt: number  // local ms timestamp
}

interface PyaarLiveState {
  registration:  PyaarRegistration | null
  show:          ShowDto | null
  myCouple:      MyCoupleDto | null
  spectator:     SpectatorCoupleRow[]
  myVote:        string | null
  history:       HistoryRow[]
  loaded:        boolean

  // Ecosystem additions
  drilled:           DrilledCoupleView | null
  eliminatedThreads: EliminatedThreadRow[]
  reactions:         FloatingReaction[]

  setRegistration: (r: PyaarRegistration | null) => void
  setShow:         (s: ShowDto | null) => void
  setMyCouple:     (c: MyCoupleDto | null) => void
  setSpectator:    (c: SpectatorCoupleRow[], myVote: string | null) => void
  setHistory:      (h: HistoryRow[]) => void
  appendCoupleMessage: (m: PyaarMessage) => void
  appendSpectatorMessage: (m: PyaarMessage) => void
  applyRoundAdvanced: (round: number, label: string, endsAt: string) => void
  applyElimination: (ids: string[]) => void
  applyShowEnded:   (winners: Array<{ coupleId: string; rank: number }>) => void
  applyVoteChange:  (coupleId: string) => void

  // Ecosystem
  setDrilled:       (d: DrilledCoupleView | null) => void
  appendDrilledMessage: (m: PyaarMessage) => void
  setEliminatedThreads: (rows: EliminatedThreadRow[]) => void
  applyCoupleSpectatorCount: (coupleId: string, n: number) => void
  applyCoupleVideoState:    (coupleId: string, active: boolean) => void
  pushReaction:    (r: FloatingReaction) => void
  pruneReactions:  () => void

  markLoaded:      () => void
}

export const usePyaarLiveStore = create<PyaarLiveState>((set) => ({
  registration: null,
  show:         null,
  myCouple:     null,
  spectator:    [],
  myVote:       null,
  history:      [],
  loaded:       false,

  drilled:           null,
  eliminatedThreads: [],
  reactions:         [],

  setRegistration: (r) => set(() => ({ registration: r })),
  setShow:         (s) => set(() => ({ show: s })),
  setMyCouple:     (c) => set(() => ({ myCouple: c })),
  setSpectator:    (c, mv) => set(() => ({ spectator: c, myVote: mv })),
  setHistory:      (h) => set(() => ({ history: h })),

  appendCoupleMessage: (m) =>
    set((s) => {
      if (!s.myCouple) return {}
      if (s.myCouple.messages.some((x) => x.id === m.id)) return {}
      return { myCouple: { ...s.myCouple, messages: [...s.myCouple.messages, m] } }
    }),

  appendSpectatorMessage: (m) =>
    set((s) => {
      const next = s.spectator.map((c) => {
        if (c.id !== m.coupleId) return c
        if (c.recent.some((x) => x.id === m.id)) return c
        return { ...c, recent: [...c.recent.slice(-5), m] }
      })
      return { spectator: next }
    }),

  applyRoundAdvanced: (round, label, endsAt) =>
    set((s) => ({
      show: s.show ? { ...s.show, currentRound: round, currentRoundLabel: label, currentRoundEndsAt: endsAt } : s.show,
      myCouple: s.myCouple ? { ...s.myCouple, currentRound: round, currentRoundLabel: label, currentRoundEndsAt: endsAt } : s.myCouple,
    })),

  applyElimination: (ids) =>
    set((s) => ({
      show: s.show
        ? { ...s.show, couples: s.show.couples.map((c) => ids.includes(c.id) ? { ...c, eliminated: true } : c) }
        : s.show,
      spectator: s.spectator.map((c) => ids.includes(c.id) ? { ...c, eliminated: true } : c),
    })),

  applyShowEnded: (winners) =>
    set((s) => {
      const map = new Map(winners.map((w) => [w.coupleId, w.rank]))
      return {
        show: s.show
          ? {
              ...s.show,
              status: 'completed',
              winningCoupleIds: winners.map((w) => w.coupleId),
              couples: s.show.couples.map((c) => ({ ...c, finalRank: map.get(c.id) ?? c.finalRank })),
            }
          : s.show,
        spectator: s.spectator.map((c) => ({ ...c, finalRank: map.get(c.id) ?? c.finalRank })),
      }
    }),

  applyVoteChange: (coupleId) => set(() => ({ myVote: coupleId })),

  // ─── Ecosystem actions ───────────────────────────────────────

  setDrilled: (d) => set(() => ({ drilled: d })),

  appendDrilledMessage: (m) =>
    set((s) => {
      if (!s.drilled) return {}
      if (s.drilled.messages.some((x) => x.id === m.id)) return {}
      return { drilled: { ...s.drilled, messages: [...s.drilled.messages, m] } }
    }),

  setEliminatedThreads: (rows) => set(() => ({ eliminatedThreads: rows })),

  applyCoupleSpectatorCount: (coupleId, n) =>
    set((s) => ({
      show: s.show
        ? { ...s.show, couples: s.show.couples.map((c) => c.id === coupleId ? { ...c, spectatorCount: n } : c) }
        : s.show,
      spectator: s.spectator.map((c) => c.id === coupleId ? { ...c, spectatorCount: n } : c),
    })),

  applyCoupleVideoState: (coupleId, active) =>
    set((s) => ({
      show: s.show
        ? { ...s.show, couples: s.show.couples.map((c) => c.id === coupleId ? { ...c, videoActive: active } : c) }
        : s.show,
      spectator: s.spectator.map((c) => c.id === coupleId ? { ...c, videoActive: active } : c),
      drilled: s.drilled && s.drilled.couple.id === coupleId
        ? { ...s.drilled, couple: { ...s.drilled.couple, videoActive: active } }
        : s.drilled,
    })),

  pushReaction: (r) =>
    set((s) => {
      // Cap at 60 to keep the overlay performant.
      const next = [...s.reactions, r].slice(-60)
      return { reactions: next }
    }),

  pruneReactions: () =>
    set((s) => {
      const now = Date.now()
      return { reactions: s.reactions.filter((r) => now - r.createdAt < 3200) }
    }),

  markLoaded: () => set(() => ({ loaded: true })),
}))
