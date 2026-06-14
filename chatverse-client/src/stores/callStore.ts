import { create } from 'zustand'

/** One ringing invitation in the queue. */
export interface IncomingCall {
  inviteId: string
  callerId: string
  callerName: string
  roomName: string
  message?: string
  receivedAt: number // unix ms, used for the countdown
}

/** Notification-only event when a blocked user attempts to call. */
export interface BlockedCallAttempt {
  callerId: string
  callerName: string
  attemptedAt: number
  message?: string
}

interface CallState {
  /**
   * Queue of ringing invites. Up to MAX_CONCURRENT, newest at index 0.
   * A second invite from the same caller replaces their earlier one
   * instead of stacking — saves space and matches the "they're trying
   * again" intent.
   */
  incoming: IncomingCall[]
  /** Notifications for calls from users you've blocked — silent log. */
  blockedAttempts: BlockedCallAttempt[]

  setIncoming: (c: IncomingCall) => void
  /** Remove a single invite by id (after Accept / Decline / TTL). */
  removeIncoming: (inviteId: string) => void
  /** Mass-decline — used by "Reject all" button in the call list panel. */
  clearAllIncoming: () => void
  pushBlockedAttempt: (a: BlockedCallAttempt) => void
  clearBlockedAttempts: () => void
}

const MAX_CONCURRENT = 10
const MAX_BLOCKED_LOG = 25

/**
 * Global call store. Survives route changes (which would otherwise
 * unmount useChatHub) so a queue of ringing invites persists until the
 * user explicitly acts on them or the 60s TTL expires per invite.
 *
 * Multi-call semantics (new):
 *   • Up to 10 concurrent ringers stored as a stack, newest first.
 *   • Per-caller dedupe — a second invite from the same callerId
 *     replaces the earlier one (rather than stacking) because you
 *     don't need to see "Arun is calling" twice in the panel.
 *   • "Reject all" + "Pick one (auto-decline others)" supported via
 *     clearAllIncoming + removeIncoming primitives.
 */
export const useCallStore = create<CallState>((set) => ({
  incoming: [],
  blockedAttempts: [],

  setIncoming: (c) => set((s) => {
    // Dedupe by callerId. If they already had an invite ringing, drop
    // it and add the new one to the front.
    const filtered = s.incoming.filter((x) => x.callerId !== c.callerId && x.inviteId !== c.inviteId)
    const next = [c, ...filtered]
    return { incoming: next.slice(0, MAX_CONCURRENT) }
  }),

  removeIncoming: (inviteId) => set((s) => ({
    incoming: s.incoming.filter((x) => x.inviteId !== inviteId),
  })),

  clearAllIncoming: () => set({ incoming: [] }),

  pushBlockedAttempt: (a) => set((s) => ({
    blockedAttempts: [a, ...s.blockedAttempts].slice(0, MAX_BLOCKED_LOG),
  })),

  clearBlockedAttempts: () => set({ blockedAttempts: [] }),
}))
