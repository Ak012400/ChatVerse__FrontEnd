import { create } from 'zustand'
import type { PollDto } from '../types/polls'

// ============================================================
//  pollsStore — per-room in-flight polls.
//
//  Shape: `byRoom[roomSlug] = PollDto[]`. Each room holds at most
//  ~20 active polls (server cap), so this list stays small.
//
//  upsertPoll is idempotent — used both for PollCreated and
//  PollUpdated events. Closed polls drop OUT of the active list
//  but stick around in `recentlyClosedByRoom` for a short reveal
//  animation, then the page rotates them off.
// ============================================================

interface PollsState {
  byRoom: Record<string, PollDto[]>
  recentlyClosedByRoom: Record<string, PollDto[]>

  /** Replace the entire active list for a room (used when ChatPage
   *  first opens a lounge and pulls GetActivePollsForRoom). */
  hydrateRoom: (roomSlug: string, polls: PollDto[]) => void

  /** Idempotent upsert — works for both PollCreated and PollUpdated. */
  upsertPoll: (poll: PollDto) => void

  /** Move a poll from active → recently-closed. */
  closePoll: (poll: PollDto) => void

  /** Drop a closed poll from the reveal rail (after the animation). */
  dismissClosed: (roomSlug: string, pollId: string) => void

  /** Clear everything for a room (on leave). */
  clearRoom: (roomSlug: string) => void
}

export const usePollsStore = create<PollsState>((set) => ({
  byRoom: {},
  recentlyClosedByRoom: {},

  hydrateRoom: (roomSlug, polls) =>
    set((s) => ({
      byRoom: { ...s.byRoom, [roomSlug]: polls },
    })),

  upsertPoll: (poll) =>
    set((s) => {
      const list = s.byRoom[poll.roomSlug] ?? []
      const exists = list.some((p) => p.id === poll.id)
      const nextList = exists
        ? list.map((p) => (p.id === poll.id ? poll : p))
        : [poll, ...list]
      return {
        byRoom: { ...s.byRoom, [poll.roomSlug]: nextList },
      }
    }),

  closePoll: (poll) =>
    set((s) => {
      const active = (s.byRoom[poll.roomSlug] ?? []).filter((p) => p.id !== poll.id)
      const recently = [poll, ...(s.recentlyClosedByRoom[poll.roomSlug] ?? [])].slice(0, 3)
      return {
        byRoom: { ...s.byRoom, [poll.roomSlug]: active },
        recentlyClosedByRoom: { ...s.recentlyClosedByRoom, [poll.roomSlug]: recently },
      }
    }),

  dismissClosed: (roomSlug, pollId) =>
    set((s) => ({
      recentlyClosedByRoom: {
        ...s.recentlyClosedByRoom,
        [roomSlug]: (s.recentlyClosedByRoom[roomSlug] ?? []).filter((p) => p.id !== pollId),
      },
    })),

  clearRoom: (roomSlug) =>
    set((s) => {
      const { [roomSlug]: _a, ...rest } = s.byRoom
      const { [roomSlug]: _b, ...restClosed } = s.recentlyClosedByRoom
      return { byRoom: rest, recentlyClosedByRoom: restClosed }
    }),
}))
