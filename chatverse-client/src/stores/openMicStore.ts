import { create } from 'zustand'
import type {
  OpenMicRoomState, OpenMicQueueEntryPrivate, OpenMicReactionEvent,
} from '../types/openMic'

// ============================================================
//  openMicStore — Mehfil-template open-mic state.
//
//  Standalone per the per-feature isolation policy. Stable EMPTY_*
//  references for selectors that fall back to [].
// ============================================================

const EMPTY_QUEUE: OpenMicQueueEntryPrivate[] = []
const EMPTY_REACTIONS: OpenMicReactionEvent[] = []

interface FloatingReaction {
  id: number
  emoji: string
  at: number
}

let reactionSeq = 0

interface State {
  roomState: OpenMicRoomState | null

  /** Privileged MC view of pending queue (bios). Audience empty. */
  mcQueue: OpenMicQueueEntryPrivate[]

  /** Active LiveKit credentials for the current slot (performer + audience). */
  slotLivekit: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null

  /** Short-lived floating reactions for the on-stage overlay. */
  floatingReactions: FloatingReaction[]

  setRoomState: (s: OpenMicRoomState | null) => void
  patchRoom: (patch: Partial<OpenMicRoomState>) => void

  setMcQueue: (q: OpenMicQueueEntryPrivate[]) => void
  upsertMcQueueEntry: (entry: OpenMicQueueEntryPrivate) => void
  removeMcQueueEntry: (userId: string) => void

  setSlotLivekit: (creds: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null) => void

  pushFloatingReaction: (emoji: string) => void
  pruneFloatingReactions: () => void

  clear: () => void
}

export const useOpenMicStore = create<State>((set) => ({
  roomState: null,
  mcQueue: EMPTY_QUEUE,
  slotLivekit: null,
  floatingReactions: EMPTY_REACTIONS as unknown as FloatingReaction[],

  setRoomState: (s) => set({ roomState: s }),
  patchRoom: (patch) =>
    set((s) => (s.roomState ? { roomState: { ...s.roomState, ...patch } } : {})),

  setMcQueue: (q) => set({ mcQueue: q }),
  upsertMcQueueEntry: (entry) =>
    set((s) => {
      const exists = s.mcQueue.some((e) => e.id === entry.id)
      const next = exists
        ? s.mcQueue.map((e) => (e.id === entry.id ? entry : e))
        : [...s.mcQueue, entry]
      return { mcQueue: next.sort((a, b) => a.position - b.position) }
    }),
  removeMcQueueEntry: (userId) =>
    set((s) => ({ mcQueue: s.mcQueue.filter((e) => e.userId !== userId) })),

  setSlotLivekit: (creds) => set({ slotLivekit: creds }),

  pushFloatingReaction: (emoji) =>
    set((s) => {
      const id = ++reactionSeq
      // Cap at 30 visible reactions so the overlay can't grow unbounded.
      const next = [...s.floatingReactions, { id, emoji, at: Date.now() }].slice(-30)
      return { floatingReactions: next }
    }),
  pruneFloatingReactions: () =>
    set((s) => {
      const cutoff = Date.now() - 2500
      const next = s.floatingReactions.filter((r) => r.at > cutoff)
      if (next.length === s.floatingReactions.length) return {}
      return { floatingReactions: next }
    }),

  clear: () =>
    set({
      roomState: null,
      mcQueue: EMPTY_QUEUE,
      slotLivekit: null,
      floatingReactions: [],
    }),
}))

export const EMPTY_OPENMIC_QUEUE = EMPTY_QUEUE
