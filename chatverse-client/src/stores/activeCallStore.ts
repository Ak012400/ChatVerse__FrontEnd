import { create } from 'zustand'
import type { RoomOptions } from 'livekit-client'

/**
 * App-level singleton describing the LiveKit call the user is currently
 * in. AppLayout mounts a single <LiveKitRoom> when this is non-null,
 * so the connection survives route changes — the user can navigate to
 * /profile / /chat / anywhere without the call dropping.
 *
 * Before this store the LiveKitRoom lived INSIDE each call page. A
 * route change unmounted the page → unmounted LiveKitRoom → call hung
 * up. The classic "I clicked Profile and lost my call" bug.
 *
 * Lifecycle:
 *   1. Call page acquires token (from /api/direct-call/token etc.).
 *   2. Page calls `setCall({ ... })`. AppLayout reacts by mounting
 *      LiveKitRoom around the entire layout subtree.
 *   3. Page renders its UI INSIDE the LiveKit context (no own wrapper).
 *   4. User navigates away → call page unmounts but LiveKitRoom stays.
 *      FloatingCallWidget appears in the corner to let them jump back.
 *   5. User clicks "End" anywhere → `endCall()` → LiveKitRoom unmounts.
 */

export type CallKind = 'direct' | 'random-group' | 'hosted' | 'theater'

export interface ActiveCall {
  kind: CallKind
  /** LiveKit room name — used for caption/theater group keys too. */
  roomName: string
  /** Short-lived LiveKit JWT (~6h). */
  token: string
  serverUrl: string
  /**
   * Route to navigate back to from the floating widget. Should be the
   * full call page so the page-specific UI (URL bar for theater, etc.)
   * re-mounts cleanly.
   */
  returnPath: string
  startedAt: number
  /** Defaults to true. Some legacy flows want audio-only. */
  audio?: boolean
  video?: boolean
  /** Per-call-kind LiveKit tuning (see lib/livekitOptions.ts). */
  roomOptions?: RoomOptions
  /** Display label shown in the floating widget — "Direct call · alex" etc. */
  label?: string
}

interface State {
  call: ActiveCall | null
  setCall: (c: ActiveCall) => void
  /** Local-only end: just clears state. LiveKit disconnect is driven by
   *  the unmount of LiveKitRoom in AppLayout (or by Room.disconnect()
   *  called from the page). */
  endCall: () => void
  /** Update one or two fields without overwriting the rest. Useful for
   *  e.g. refreshing the label as participants join. */
  patchCall: (partial: Partial<ActiveCall>) => void
}

export const useActiveCallStore = create<State>((set, get) => ({
  call: null,
  setCall: (call) => set({ call }),
  endCall: () => set({ call: null }),
  patchCall: (partial) => {
    const current = get().call
    if (!current) return
    set({ call: { ...current, ...partial } })
  },
}))
