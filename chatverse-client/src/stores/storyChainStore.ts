import { create } from 'zustand'
import type { ChainState, ArchivedChain, StoryContribution } from '../types/storyChain'

// ============================================================
//  storyChainStore — today's chain state + archive cache.
//
//  Server-push events update this store directly via the hook;
//  the page just reads. The TurnAssigned countdown ticks against
//  `myTurnExpiresAt` (set when the server pushes the event).
// ============================================================

interface StoryChainState {
  current:              ChainState | null
  archive:              ArchivedChain[]
  /** When my current turn expires (only set if myTurn === true). */
  myTurnExpiresAt:      string | null

  currentLoaded:        boolean
  archiveLoaded:        boolean

  setCurrent:           (c: ChainState) => void
  setArchive:           (a: ArchivedChain[]) => void
  setMyTurnExpiresAt:   (iso: string | null) => void

  /** Apply a freshly-pushed ContributionAdded to the local chain. */
  applyContribution:    (s: StoryContribution, total: number) => void
  /** QueueUpdated arrived — refresh the small counters. */
  applyQueueUpdate:     (queueLength: number, hasActiveTurn: boolean) => void
  /** ChainLocked arrived — flip status; archive promotion happens
   *  via the server's published-pass and is fetched lazily. */
  applyChainLocked:     () => void
}

export const useStoryChainStore = create<StoryChainState>((set) => ({
  current:         null,
  archive:         [],
  myTurnExpiresAt: null,
  currentLoaded:   false,
  archiveLoaded:   false,

  setCurrent: (c) => set(() => ({
    current: c,
    currentLoaded: true,
    // If the server says I no longer have the turn, clear the local
    // countdown — otherwise leave it (the hook sets it from TurnAssigned).
    myTurnExpiresAt: c.myTurn ? (undefined as unknown as string) : null,
  })),

  setArchive: (a) => set(() => ({ archive: a, archiveLoaded: true })),

  setMyTurnExpiresAt: (iso) => set(() => ({ myTurnExpiresAt: iso })),

  applyContribution: (s, total) =>
    set((st) => {
      if (!st.current) return {}
      // Idempotent — match on (sentence + author + addedAt) just in
      // case the local-echo from AddSentence races the server-push.
      const exists = st.current.sentences.some(
        (x) => x.addedAt === s.addedAt &&
               x.authorUsername === s.authorUsername &&
               x.sentence === s.sentence,
      )
      if (exists) return {}
      return {
        current: {
          ...st.current,
          sentences: [...st.current.sentences, s],
          totalSentences: total,
          hasActiveTurn: false,
        },
      }
    }),

  applyQueueUpdate: (queueLength, hasActiveTurn) =>
    set((st) => st.current
      ? { current: { ...st.current, queueLength, hasActiveTurn } }
      : {}),

  applyChainLocked: () =>
    set((st) => st.current
      ? { current: { ...st.current, status: 'locked' } }
      : {}),
}))
