import { useEffect, useRef, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { useUiStore } from '../stores/uiStore'

// ============================================================
//  usePushToTalk — walkie-talkie mic gating for group calls.
//
//  When the user flips on PTT in CallSettingsDrawer:
//   • Mic starts MUTED on hook activation.
//   • Holding `pttKey` (default 'Space') UN-mutes for as long as it's
//     held.
//   • Releasing the key re-mutes immediately.
//   • Releases also fire on `blur` / `visibilitychange` so a tab switch
//     doesn't leave the mic stuck open.
//
//  Quality-of-life rules:
//   • Ignored while focus is inside <input>, <textarea>, or any
//     contenteditable surface — chat composer, search box, etc. Without
//     this guard a user typing a space would be unmuting themselves.
//   • The hook owns the keyboard listeners only while `enabled` is true.
//     Pass `enabled=false` from the page when no call is active so the
//     listeners don't leak.
//   • The hook ONLY mutates mic state when PTT is engaged. If the user
//     turns PTT off, it bows out cleanly and the manual mute button
//     takes back control.
//
//  Returns { isHolding, isPttActive } for the indicator UI.
// ============================================================

export type UsePushToTalkOptions = {
  /** Pages should pass `false` when no call is connected so the hook
   *  doesn't fight for the mic before LiveKit has a localParticipant. */
  enabled: boolean
  /** Called whenever the hook flips the mic. Useful for the page's
   *  own `micOn` state so the Mic/MicOff icon stays in sync. */
  onMicChange?: (on: boolean) => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function usePushToTalk({ enabled, onMicChange }: UsePushToTalkOptions) {
  const pttEnabled = useUiStore((s) => s.pttEnabled)
  const pttKey = useUiStore((s) => s.pttKey)
  const { localParticipant } = useLocalParticipant()

  const [isHolding, setIsHolding] = useState(false)
  const holdingRef = useRef(false)
  const onMicChangeRef = useRef(onMicChange)
  onMicChangeRef.current = onMicChange

  // Helper: flip mic with the latest participant ref. Wrapped in a
  // try/catch because setMicrophoneEnabled can reject if the publisher
  // is mid-reconnect — we don't want a transient rejection to crash
  // the whole call page.
  const setMicSafe = async (on: boolean) => {
    if (!localParticipant) return
    try {
      await localParticipant.setMicrophoneEnabled(on)
      onMicChangeRef.current?.(on)
    } catch {
      /* ignore — LiveKit will retry on next call */
    }
  }

  // ── PTT lifecycle: when PTT is engaged, start muted; when it's
  //   disengaged (user flipped it off or hook is unmounting), make
  //   sure we don't leave the mic in a stuck-held state.
  useEffect(() => {
    if (!enabled || !pttEnabled || !localParticipant) return

    // Mute on engagement — this is the "walkie-talkie" baseline.
    setMicSafe(false)

    return () => {
      // On disengagement, defensively re-mute if we were holding so
      // toggling PTT off mid-hold doesn't leave the mic open.
      if (holdingRef.current) {
        holdingRef.current = false
        setIsHolding(false)
        setMicSafe(false)
      }
    }
    // setMicSafe is recreated each render but it only closes over the
    // latest localParticipant via React's normal closure — explicit
    // dep on the participant id is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pttEnabled, localParticipant?.identity])

  // ── Keyboard listeners. Bound to window so the user doesn't have to
  //   click the call surface first. Spec uses KeyboardEvent.code (not
  //   .key) so layout/locale doesn't matter — Space is Space.
  useEffect(() => {
    if (!enabled || !pttEnabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== pttKey) return
      if (e.repeat) return // auto-repeat would re-trigger toggles
      if (isTypingTarget(e.target)) return
      e.preventDefault() // Space would otherwise scroll the page
      if (holdingRef.current) return
      holdingRef.current = true
      setIsHolding(true)
      setMicSafe(true)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== pttKey) return
      if (!holdingRef.current) return
      holdingRef.current = false
      setIsHolding(false)
      setMicSafe(false)
    }

    const onBlurOrHide = () => {
      if (!holdingRef.current) return
      holdingRef.current = false
      setIsHolding(false)
      setMicSafe(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlurOrHide)
    document.addEventListener('visibilitychange', onBlurOrHide)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlurOrHide)
      document.removeEventListener('visibilitychange', onBlurOrHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pttEnabled, pttKey, localParticipant?.identity])

  // Touch handlers — mobile / tablet users can tap-and-hold a
  // dedicated PTT pad rendered by the page. Exposed as callbacks so
  // the page can wire them to its own pad element without coupling
  // this hook to any particular DOM shape.
  const beginHold = () => {
    if (!enabled || !pttEnabled) return
    if (holdingRef.current) return
    holdingRef.current = true
    setIsHolding(true)
    setMicSafe(true)
  }
  const endHold = () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    setIsHolding(false)
    setMicSafe(false)
  }

  return {
    /** PTT is currently engaged for this user (preference is on AND
     *  hook is active). When false, the page should use its normal
     *  mute button behaviour. */
    isPttActive: enabled && pttEnabled,
    /** User is currently holding the PTT key — mic is live. Use this
     *  to drive the visual pulse indicator. */
    isHolding,
    /** Touch / pointer handlers for an on-screen PTT pad. */
    beginHold,
    endHold,
  }
}
