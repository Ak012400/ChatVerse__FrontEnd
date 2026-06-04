import { create } from 'zustand'

/**
 * Shape of an incoming call invitation — populated by useChatHub when
 * the SignalR "IncomingCall" event arrives, cleared on accept/decline
 * or after the 60-second TTL expires.
 */
export interface IncomingCall {
  inviteId: string
  callerId: string
  callerName: string
  roomName: string
  message?: string
  receivedAt: number // unix ms, used for the countdown
}

interface CallState {
  /** The current ringing invite, if any. */
  incoming: IncomingCall | null
  setIncoming: (c: IncomingCall) => void
  clearIncoming: () => void
}

/**
 * Global call store. Lives outside useChatHub on purpose: the hub may
 * unmount/remount with route changes, but a ringing invite must stay
 * on screen until the user explicitly answers it.
 *
 * Used by:
 *   • useChatHub        → writes here when "IncomingCall" arrives
 *   • IncomingCallModal → reads here to render the ringing UI
 *   • DirectCallPage    → may read on mount when navigated to with an
 *                         auto-accept intent
 */
export const useCallStore = create<CallState>((set) => ({
  incoming: null,
  setIncoming: (c) => set({ incoming: c }),
  clearIncoming: () => set({ incoming: null }),
}))
