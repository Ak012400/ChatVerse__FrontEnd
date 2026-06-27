import { create } from 'zustand'
import type {
  StageBracketRoomState, StageBracketNominationPrivate,
  StageBracketChatMessageDto,
} from '../types/stageBracket'

// ============================================================
//  stageBracketStore — shared state for Debate v2 + Roast.
//
//  Stable EMPTY_* references (React #185 guard).
// ============================================================

const EMPTY_NOMS: StageBracketNominationPrivate[] = []

interface State {
  roomState: StageBracketRoomState | null

  /** Privileged host view — seat nomination bios. Audience empty. */
  seatNominations: StageBracketNominationPrivate[]
  /** Privileged host view — pending challenge requests. */
  challengeNominations: StageBracketNominationPrivate[]

  /** Active LiveKit credentials for the current speaker's audio room. */
  micLivekit: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null

  setRoomState: (s: StageBracketRoomState | null) => void
  patchRoom: (patch: Partial<StageBracketRoomState>) => void

  appendChat: (m: StageBracketChatMessageDto) => void

  setSeatNominations: (rows: StageBracketNominationPrivate[]) => void
  upsertSeatNomination: (row: StageBracketNominationPrivate) => void
  removeSeatNomination: (userId: string) => void

  upsertChallengeNomination: (row: StageBracketNominationPrivate) => void
  removeChallengeNomination: (id: string) => void

  setMicLivekit: (creds: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null) => void

  clear: () => void
}

export const useStageBracketStore = create<State>((set) => ({
  roomState: null,
  seatNominations: EMPTY_NOMS,
  challengeNominations: EMPTY_NOMS,
  micLivekit: null,

  setRoomState: (s) => set({ roomState: s }),
  patchRoom: (patch) =>
    set((s) => (s.roomState ? { roomState: { ...s.roomState, ...patch } } : {})),

  appendChat: (m) =>
    set((s) => {
      if (!s.roomState) return {}
      if (s.roomState.messages.some((x) => x.id === m.id)) return {}
      return {
        roomState: { ...s.roomState, messages: [...s.roomState.messages, m].slice(-200) },
      }
    }),

  setSeatNominations: (rows) => set({ seatNominations: rows }),
  upsertSeatNomination: (row) =>
    set((s) => {
      const exists = s.seatNominations.some((n) => n.id === row.id)
      const next = exists
        ? s.seatNominations.map((n) => (n.id === row.id ? row : n))
        : [...s.seatNominations, row]
      return { seatNominations: next }
    }),
  removeSeatNomination: (userId) =>
    set((s) => ({ seatNominations: s.seatNominations.filter((n) => n.userId !== userId) })),

  upsertChallengeNomination: (row) =>
    set((s) => {
      const exists = s.challengeNominations.some((n) => n.id === row.id)
      const next = exists
        ? s.challengeNominations.map((n) => (n.id === row.id ? row : n))
        : [...s.challengeNominations, row]
      return { challengeNominations: next }
    }),
  removeChallengeNomination: (id) =>
    set((s) => ({ challengeNominations: s.challengeNominations.filter((n) => n.id !== id) })),

  setMicLivekit: (creds) => set({ micLivekit: creds }),

  clear: () =>
    set({
      roomState: null,
      seatNominations: EMPTY_NOMS,
      challengeNominations: EMPTY_NOMS,
      micLivekit: null,
    }),
}))

export const EMPTY_SB_NOMS = EMPTY_NOMS
