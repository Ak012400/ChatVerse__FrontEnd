import { create } from 'zustand'
import type {
  DebateRoomState,
  DebateChatMessageDto,
  DebateNominationPrivate,
  DebateUserHighlightedEvent,
} from '../types/debate'

// ============================================================
//  debateStore — per-template Mehfil specialisation state.
//
//  Lives standalone per the per-feature isolation policy. Nothing
//  here is shared with mehfilStore. Surface area:
//
//    • roomState   — full server snapshot (rooms + round + seats + chat)
//    • appendChat  — idempotent insert keyed on id
//    • applyHighlight — flip a chat message's isHighlighted flag
//                       AND surface the global UserHighlighted event
//    • monitorNominations — PRIVILEGED list for the monitor only
//    • upsertNomination / removeNomination — monitor-side push
//
//  Stable EMPTY_* refs are used for selectors that fall back to []
//  to avoid the React #185 "max update depth" trap (see PROGRESS.md
//  2026-06-21 entry for the cautionary tale).
// ============================================================

const EMPTY_MSGS: DebateChatMessageDto[] = []
const EMPTY_NOMS: DebateNominationPrivate[] = []

interface DebateState {
  roomState: DebateRoomState | null

  /** Monitor-only — pending nomination bios. Audience users have this
   *  empty at all times; the server never sends them the data. */
  monitorNominations: DebateNominationPrivate[]

  /** Most recent UserHighlighted event id+at for celebration animation. */
  lastHighlight: DebateUserHighlightedEvent | null

  setRoomState: (s: DebateRoomState | null) => void
  patchRoom: (patch: Partial<DebateRoomState>) => void

  appendChat: (m: DebateChatMessageDto) => void
  applyHighlight: (e: DebateUserHighlightedEvent) => void

  setMonitorNominations: (rows: DebateNominationPrivate[]) => void
  upsertNomination: (row: DebateNominationPrivate) => void
  removeNomination: (userId: string) => void

  clear: () => void
}

export const useDebateStore = create<DebateState>((set) => ({
  roomState: null,
  monitorNominations: EMPTY_NOMS,
  lastHighlight: null,

  setRoomState: (s) => set({ roomState: s }),
  patchRoom: (patch) =>
    set((s) => (s.roomState ? { roomState: { ...s.roomState, ...patch } } : {})),

  appendChat: (m) =>
    set((s) => {
      if (!s.roomState) return {}
      const exists = s.roomState.messages.some((x) => x.id === m.id)
      if (exists) return {}
      return {
        roomState: {
          ...s.roomState,
          messages: [...s.roomState.messages, m].slice(-200),
        },
      }
    }),

  applyHighlight: (e) =>
    set((s) => {
      if (!s.roomState) return { lastHighlight: e }
      // Flip the message's isHighlighted if we have its id.
      const messages = e.messageId
        ? s.roomState.messages.map((m) =>
            m.id === e.messageId ? { ...m, isHighlighted: true } : m,
          )
        : s.roomState.messages
      return {
        roomState: { ...s.roomState, messages },
        lastHighlight: e,
      }
    }),

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
    set({ roomState: null, monitorNominations: EMPTY_NOMS, lastHighlight: null }),
}))

// Re-export stable empty refs so consumer selectors can use them too.
export const EMPTY_DEBATE_MSGS = EMPTY_MSGS
export const EMPTY_DEBATE_NOMS = EMPTY_NOMS
