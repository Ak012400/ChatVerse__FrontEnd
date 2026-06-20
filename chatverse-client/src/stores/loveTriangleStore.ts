import { create } from 'zustand'
import type {
  LoveTriangleRegistration,
  MyTriangle,
  PublicTriangle,
  PublicExcerpt,
  HistoryRow,
  PairKey,
  PairMessage,
} from '../types/loveTriangle'

interface LoveTriangleState {
  registration:    LoveTriangleRegistration | null
  myTriangle:      MyTriangle | null
  publicTriangles: PublicTriangle[]
  excerpts:        Record<string, PublicExcerpt[]>   // triangleId → excerpts
  history:         HistoryRow[]
  loaded:          boolean

  setRegistration:   (r: LoveTriangleRegistration | null) => void
  setMyTriangle:     (t: MyTriangle | null) => void
  setPublicTriangles:(t: PublicTriangle[]) => void
  setExcerpts:       (triangleId: string, e: PublicExcerpt[]) => void
  setHistory:        (h: HistoryRow[]) => void

  appendPairMessage: (pairKey: PairKey, m: PairMessage) => void
  applyExcerptToggle:(pairKey: PairKey, msgId: string, isShared: boolean, sharedByMe: boolean) => void
  appendExcerpt:     (triangleId: string, e: PublicExcerpt) => void
  applyVotingOpened: (triangleId: string) => void
  applyCompleted:    (triangleId: string, winningPair: string) => void
  markLoaded:        () => void
}

export const useLoveTriangleStore = create<LoveTriangleState>((set) => ({
  registration:     null,
  myTriangle:       null,
  publicTriangles:  [],
  excerpts:         {},
  history:          [],
  loaded:           false,

  setRegistration:    (r) => set(() => ({ registration: r })),
  setMyTriangle:      (t) => set(() => ({ myTriangle: t })),
  setPublicTriangles: (t) => set(() => ({ publicTriangles: t })),
  setExcerpts: (triangleId, e) =>
    set((s) => ({ excerpts: { ...s.excerpts, [triangleId]: e } })),
  setHistory:         (h) => set(() => ({ history: h })),

  appendPairMessage: (pairKey, m) =>
    set((s) => {
      if (!s.myTriangle) return {}
      const thread = s.myTriangle.threads[pairKey] ?? { count: 0, messages: [] }
      if (thread.messages.some((x) => x.id === m.id)) return {}
      const nextThread = {
        count:    thread.count + 1,
        messages: [...thread.messages, m],
      }
      return {
        myTriangle: {
          ...s.myTriangle,
          threads: { ...s.myTriangle.threads, [pairKey]: nextThread },
        },
      }
    }),

  applyExcerptToggle: (pairKey, msgId, isShared, sharedByMe) =>
    set((s) => {
      if (!s.myTriangle) return {}
      const thread = s.myTriangle.threads[pairKey]
      if (!thread) return {}
      const next = thread.messages.map((m) =>
        m.id === msgId ? { ...m, isShared, sharedByMe } : m,
      )
      return {
        myTriangle: {
          ...s.myTriangle,
          threads: { ...s.myTriangle.threads, [pairKey]: { ...thread, messages: next } },
        },
      }
    }),

  appendExcerpt: (triangleId, e) =>
    set((s) => {
      const existing = s.excerpts[triangleId] ?? []
      if (existing.some((x) => x.id === e.id)) return {}
      return { excerpts: { ...s.excerpts, [triangleId]: [e, ...existing] } }
    }),

  applyVotingOpened: (triangleId) =>
    set((s) => ({
      myTriangle: s.myTriangle && s.myTriangle.id === triangleId
        ? { ...s.myTriangle, status: 'voting' }
        : s.myTriangle,
      publicTriangles: s.publicTriangles.map((t) =>
        t.id === triangleId ? { ...t, status: 'voting' } : t,
      ),
    })),

  applyCompleted: (triangleId, winningPair) =>
    set((s) => ({
      myTriangle: s.myTriangle && s.myTriangle.id === triangleId
        ? { ...s.myTriangle, status: 'completed', winningPair }
        : s.myTriangle,
      publicTriangles: s.publicTriangles.map((t) =>
        t.id === triangleId ? { ...t, status: 'completed', winningPair } : t,
      ),
    })),

  markLoaded: () => set(() => ({ loaded: true })),
}))
