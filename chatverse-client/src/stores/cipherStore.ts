import { create } from 'zustand'
import type {
  CurrentRoundState, MyFragmentState, ArchiveRound, LeaderboardRow,
} from '../types/cipher'

interface CipherState {
  current:       CurrentRoundState | null
  fragment:      MyFragmentState | null
  archive:       ArchiveRound[]
  leaderboard:   LeaderboardRow[]
  loaded:        boolean

  setCurrent:     (s: CurrentRoundState) => void
  setFragment:    (f: MyFragmentState) => void
  setArchive:     (a: ArchiveRound[]) => void
  setLeaderboard: (l: LeaderboardRow[]) => void
  applyRoundStarted: (roundId: string, weekLabel: string, endsAt: string, phraseLength: number) => void
  applyRoundClosed:  (roundId: string) => void
  markLoaded:     () => void
}

export const useCipherStore = create<CipherState>((set) => ({
  current:     null,
  fragment:    null,
  archive:     [],
  leaderboard: [],
  loaded:      false,

  setCurrent:     (s) => set(() => ({ current: s })),
  setFragment:    (f) => set(() => ({ fragment: f })),
  setArchive:     (a) => set(() => ({ archive: a })),
  setLeaderboard: (l) => set(() => ({ leaderboard: l })),

  applyRoundStarted: (roundId, weekLabel, endsAt, phraseLength) =>
    set(() => ({
      current: {
        hasActive:    true,
        roundId, weekLabel,
        endsAt, phraseLength,
        iAmMember:    false,
        iHaveSubmitted: false,
      },
    })),

  applyRoundClosed: (roundId) =>
    set((s) => ({
      current: s.current?.roundId === roundId
        ? { hasActive: false }
        : s.current,
    })),

  markLoaded: () => set(() => ({ loaded: true })),
}))
