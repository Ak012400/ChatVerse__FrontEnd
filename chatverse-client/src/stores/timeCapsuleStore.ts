import { create } from 'zustand'
import type { InboxCapsule, SentCapsule } from '../types/timeCapsule'

// ============================================================
//  timeCapsuleStore — local cache for inbox + sent feeds plus a
//  small unread counter so the sidebar icon can show a badge.
//
//  Why a store and not just useState in the page?
//    1. The "TimeCapsuleDelivered" toast lives at AppLayout level
//       — it needs to push the freshly-arrived capsule into the
//       same list the /time-capsule page reads, so when the user
//       opens the page after the toast their new capsule is right
//       there at the top without a fresh fetch.
//    2. Unread badge on the sidebar needs to survive route changes.
// ============================================================

interface TimeCapsuleState {
  inbox:       InboxCapsule[]
  sent:        SentCapsule[]
  /** Inbox capsules that have arrived since the user last opened
   *  the /time-capsule page. Drives the sidebar dot. */
  unread:      number
  /** Track whether we've done the initial inbox/sent fetch this
   *  session, so the page can show a spinner only on first open. */
  inboxLoaded: boolean
  sentLoaded:  boolean

  setInbox:        (items: InboxCapsule[]) => void
  setSent:         (items: SentCapsule[]) => void
  prependInbox:    (item: InboxCapsule) => void
  markReplied:     (capsuleId: string) => void
  /** Push the reply onto the matching sent capsule (used when the
   *  server fires TimeCapsuleReplyDelivered). */
  applyReplyDelivered: (
    capsuleId: string,
    replyContent: string,
    replyDeliveredAt: string,
  ) => void
  bumpUnread:      () => void
  clearUnread:     () => void
}

export const useTimeCapsuleStore = create<TimeCapsuleState>((set) => ({
  inbox:       [],
  sent:        [],
  unread:      0,
  inboxLoaded: false,
  sentLoaded:  false,

  setInbox: (items) =>
    set(() => ({ inbox: items, inboxLoaded: true })),

  setSent: (items) =>
    set(() => ({ sent: items, sentLoaded: true })),

  prependInbox: (item) =>
    set((s) => {
      // Idempotent on capsule id — a refresh-after-delivery race
      // could otherwise double-insert the same card.
      if (s.inbox.some((c) => c.id === item.id)) return {}
      return { inbox: [item, ...s.inbox] }
    }),

  markReplied: (capsuleId) =>
    set((s) => ({
      inbox: s.inbox.map((c) =>
        c.id === capsuleId
          ? { ...c, canReply: false, repliedAt: new Date().toISOString() }
          : c,
      ),
    })),

  applyReplyDelivered: (capsuleId, replyContent, replyDeliveredAt) =>
    set((s) => ({
      sent: s.sent.map((c) =>
        c.id === capsuleId
          ? { ...c, gotReply: true, replyContent, replyDeliveredAt }
          : c,
      ),
    })),

  bumpUnread:  () => set((s) => ({ unread: s.unread + 1 })),
  clearUnread: ()  => set(() => ({ unread: 0 })),
}))
