import { create } from 'zustand'
import type {
  GhostRoomState,
  GhostNominationPrivate,
  GhostPairDto,
  GhostPairMessageDto,
  GhostOutcome,
} from '../types/ghostRoom'

// ============================================================
//  ghostRoomStore — Mehfil-template ghost-dating state.
//
//  Standalone per the per-feature isolation policy. NOT shared
//  with the legacy ghostDateStore (weekly Thursday feature).
//
//  Stable EMPTY_* references are used to keep selectors from
//  triggering React #185 infinite-render loops (see PROGRESS.md
//  2026-06-21 entry for that bug class).
// ============================================================

const EMPTY_VOYAGERS: GhostRoomState['voyagers'] = []
const EMPTY_PAIR_MSGS: GhostPairMessageDto[] = []
const EMPTY_NOMS: GhostNominationPrivate[] = []

interface GhostRoomStateLocal {
  roomState: GhostRoomState | null

  /** Privileged matchmaker view — bios. Empty for audience. */
  monitorNominations: GhostNominationPrivate[]

  /** Active pair's outcome (after round-end reveal vote resolves). */
  pairOutcome: GhostOutcome | null

  /** Active LiveKit creds (audio in pair room). */
  pairLivekit: { roomName: string; serverUrl: string; token: string } | null

  /** Last highlighted voyager tag — drives celebration animation. */
  lastHighlightedTag: string | null

  setRoomState: (s: GhostRoomState | null) => void
  patchRoom: (patch: Partial<GhostRoomState>) => void

  appendPairMessage: (m: GhostPairMessageDto) => void
  setPairOutcome: (outcome: GhostOutcome | null) => void
  setActivePair: (p: GhostPairDto | null) => void
  setPairLivekit: (creds: { roomName: string; serverUrl: string; token: string } | null) => void
  setLastHighlighted: (tag: string | null) => void

  setMonitorNominations: (rows: GhostNominationPrivate[]) => void
  upsertNomination: (row: GhostNominationPrivate) => void
  removeNomination: (userId: string) => void

  clear: () => void
}

export const useGhostRoomStore = create<GhostRoomStateLocal>((set) => ({
  roomState: null,
  monitorNominations: EMPTY_NOMS,
  pairOutcome: null,
  pairLivekit: null,
  lastHighlightedTag: null,

  setRoomState: (s) => set({ roomState: s }),
  patchRoom: (patch) =>
    set((s) => (s.roomState ? { roomState: { ...s.roomState, ...patch } } : {})),

  appendPairMessage: (m) =>
    set((s) => {
      if (!s.roomState) return {}
      const exists = s.roomState.pairMessages.some((x) => x.id === m.id)
      if (exists) return {}
      return {
        roomState: {
          ...s.roomState,
          pairMessages: [...s.roomState.pairMessages, m].slice(-200),
        },
      }
    }),

  setPairOutcome: (outcome) => set({ pairOutcome: outcome }),

  setActivePair: (p) =>
    set((s) => (s.roomState ? { roomState: { ...s.roomState, activePair: p, pairMessages: EMPTY_PAIR_MSGS } } : {})),

  setPairLivekit: (creds) => set({ pairLivekit: creds }),
  setLastHighlighted: (tag) => set({ lastHighlightedTag: tag }),

  setMonitorNominations: (rows) => set({ monitorNominations: rows }),
  upsertNomination: (row) =>
    set((s) => {
      const exists = s.monitorNominations.some((n) => n.id === row.id)
      const next = exists
        ? s.monitorNominations.map((n) => (n.id === row.id ? row : n))
        : [row, ...s.monitorNominations]
      return { monitorNominations: next }
    }),
  removeNomination: (userId) =>
    set((s) => ({
      monitorNominations: s.monitorNominations.filter((n) => n.userId !== userId),
    })),

  clear: () =>
    set({
      roomState: null,
      monitorNominations: EMPTY_NOMS,
      pairOutcome: null,
      pairLivekit: null,
      lastHighlightedTag: null,
    }),
}))

export const EMPTY_GHOST_VOYAGERS = EMPTY_VOYAGERS
export const EMPTY_GHOST_PAIR_MSGS = EMPTY_PAIR_MSGS
export const EMPTY_GHOST_NOMS = EMPTY_NOMS
