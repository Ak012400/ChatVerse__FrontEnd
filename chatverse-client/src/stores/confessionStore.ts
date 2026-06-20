import { create } from 'zustand'
import type { ConfessionCard, TopOfferResponse } from '../types/confession'

interface ConfessionState {
  feed:           ConfessionCard[]
  allowedEmojis:  string[]
  loreWall:       Record<string, ConfessionCard[]>   // weekStart → top-5
  pendingOffer:   TopOfferResponse | null

  feedLoaded:     boolean
  loreLoaded:     Record<string, boolean>

  setFeed:        (items: ConfessionCard[], allowedEmojis: string[]) => void
  prependFeed:    (item: ConfessionCard) => void
  upsertCard:     (item: ConfessionCard) => void
  applyRevealed:  (id: string, authorUsername: string) => void
  setLoreWall:    (weekStart: string, items: ConfessionCard[]) => void
  setPendingOffer: (offer: TopOfferResponse | null) => void
}

export const useConfessionStore = create<ConfessionState>((set) => ({
  feed:           [],
  allowedEmojis:  [],
  loreWall:       {},
  pendingOffer:   null,
  feedLoaded:     false,
  loreLoaded:     {},

  setFeed: (items, allowedEmojis) =>
    set(() => ({ feed: items, allowedEmojis, feedLoaded: true })),

  prependFeed: (item) =>
    set((s) => {
      // Idempotent — local-echo from Post races with the ConfessionPosted
      // server-push. Match by id.
      if (s.feed.some((c) => c.id === item.id)) return {}
      return { feed: [item, ...s.feed] }
    }),

  upsertCard: (item) =>
    set((s) => {
      const idx = s.feed.findIndex((c) => c.id === item.id)
      if (idx < 0) return { feed: [item, ...s.feed] }
      const next = [...s.feed]
      next[idx] = item
      return { feed: next }
    }),

  applyRevealed: (id, authorUsername) =>
    set((s) => ({
      feed: s.feed.map((c) =>
        c.id === id ? { ...c, revealedUsername: authorUsername } : c,
      ),
    })),

  setLoreWall: (weekStart, items) =>
    set((s) => ({
      loreWall: { ...s.loreWall, [weekStart]: items },
      loreLoaded: { ...s.loreLoaded, [weekStart]: true },
    })),

  setPendingOffer: (offer) => set(() => ({ pendingOffer: offer })),
}))
