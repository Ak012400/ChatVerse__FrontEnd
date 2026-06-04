import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, Video } from 'lucide-react'

import { useCallStore } from '../../stores/callStore'
import { useChatHub } from '../../hooks/useChatHub'
import Avatar from '../ui/Avatar'

const INVITE_TTL_SECS = 60

/**
 * Global "someone is calling you" modal. Mounted once at AppLayout
 * level, listens to useCallStore which is populated by useChatHub
 * whenever a SignalR "IncomingCall" event arrives.
 *
 * Three exits:
 *   • Accept  → invokes AcceptCall on the hub and navigates the user
 *               to /video/invite with the roomName preset (DirectCallPage
 *               picks it up from window.history.state and auto-joins).
 *   • Decline → invokes DeclineCall and dismisses.
 *   • Timeout → 60s TTL matches backend invite expiry; we auto-dismiss.
 *
 * Side effects while ringing:
 *   • A short looping ringtone tone (Web Audio API, no asset bundle).
 *   • Browser title pulses ("📞 Incoming call…") so a backgrounded tab
 *     gets the user's attention.
 */
export default function IncomingCallModal() {
  const navigate = useNavigate()
  const incoming = useCallStore((s) => s.incoming)
  const clearIncoming = useCallStore((s) => s.clearIncoming)
  const { acceptCall, declineCall } = useChatHub()

  const [secondsLeft, setSecondsLeft] = useState(INVITE_TTL_SECS)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringIntervalRef = useRef<number | null>(null)
  const titleSwapRef = useRef<number | null>(null)
  const originalTitleRef = useRef<string>('')

  // ── Countdown + auto-dismiss
  useEffect(() => {
    if (!incoming) return
    setSecondsLeft(INVITE_TTL_SECS)
    const tick = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - incoming.receivedAt) / 1000)
      const remaining = INVITE_TTL_SECS - elapsed
      if (remaining <= 0) {
        clearIncoming()
        return
      }
      setSecondsLeft(remaining)
    }, 500)
    return () => window.clearInterval(tick)
  }, [incoming, clearIncoming])

  // ── Ringtone (Web Audio API — no asset file needed)
  useEffect(() => {
    if (!incoming) return
    try {
      // Some browsers require a user gesture before AudioContext can play.
      // If autoplay is blocked, this becomes a no-op gracefully.
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx

      const playTone = () => {
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, now)
        osc.frequency.setValueAtTime(660, now + 0.18)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.55)
      }

      playTone()
      ringIntervalRef.current = window.setInterval(playTone, 1400)
    } catch { /* autoplay blocked — silent fallback */ }

    return () => {
      if (ringIntervalRef.current) window.clearInterval(ringIntervalRef.current)
      ringIntervalRef.current = null
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [incoming])

  // ── Pulse the document title so backgrounded tabs catch the user's eye
  useEffect(() => {
    if (!incoming) return
    originalTitleRef.current = document.title
    let on = true
    titleSwapRef.current = window.setInterval(() => {
      document.title = on ? `📞 ${incoming.callerName} is calling…` : originalTitleRef.current
      on = !on
    }, 900)
    return () => {
      if (titleSwapRef.current) window.clearInterval(titleSwapRef.current)
      document.title = originalTitleRef.current
    }
  }, [incoming])

  if (!incoming) return null

  const handleAccept = async () => {
    const snapshot = incoming
    clearIncoming()
    await acceptCall(snapshot.inviteId)
    // Navigate to DirectCallPage with the roomName so it can fetch a
    // LiveKit token and auto-join without a manual search step.
    navigate('/video/invite', {
      state: {
        autoJoinRoomName: snapshot.roomName,
        peerName: snapshot.callerName,
      },
    })
  }

  const handleDecline = async () => {
    const id = incoming.inviteId
    clearIncoming()
    await declineCall(id)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        className="relative w-[92%] max-w-sm rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-line-strong)] shadow-2xl p-6"
      >
        {/* Pulse ring behind the avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-40 animate-ping" />
            <span className="absolute -inset-2 rounded-full bg-[var(--color-accent)] opacity-20 animate-ping [animation-delay:0.3s]" />
            <div className="relative">
              <Avatar name={incoming.callerName} size="xl" />
            </div>
          </div>

          <p className="mt-5 text-xs uppercase tracking-wider text-[var(--color-fg-faint)]">
            Incoming call
          </p>
          <h2
            id="incoming-call-title"
            className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-fg)]"
          >
            {incoming.callerName}
          </h2>

          {incoming.message ? (
            <p className="mt-2 max-w-xs text-center text-sm text-[var(--color-fg-dim)] italic">
              “{incoming.message}”
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-fg-dim)]">
              wants to start a video call
            </p>
          )}

          <p className="mt-3 text-[11px] text-[var(--color-fg-mute)]">
            Auto-declines in {secondsLeft}s
          </p>
        </div>

        {/* Action buttons */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleDecline}
            className="group inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[var(--color-danger)] hover:opacity-90 text-white font-medium transition-opacity focus-ring"
          >
            <PhoneOff size={18} />
            <span>Decline</span>
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="group inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[var(--color-success)] hover:opacity-90 text-white font-medium transition-opacity focus-ring"
          >
            <Video size={18} />
            <span>Accept</span>
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] text-[var(--color-fg-mute)] flex items-center justify-center gap-1">
          <Phone size={10} /> ChatVerse direct call
        </p>
      </div>
    </div>
  )
}
