import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, Users, ChevronDown, ChevronUp } from 'lucide-react'

import { useCallStore, type IncomingCall } from '../../stores/callStore'
import { useChatHub } from '../../hooks/useChatHub'
import Avatar from '../ui/Avatar'

const INVITE_TTL_SECS = 60

/**
 * Global "someone is calling you" surface. Mounted once at AppLayout
 * level, listens to useCallStore which is populated by useChatHub.
 *
 * Multi-call semantics (new):
 *   • The primary (newest) ringer is rendered as a full modal so a
 *     single incoming call feels exactly like before — the upgrade
 *     is invisible until a second invite arrives.
 *   • When ≥2 calls are queued, the modal grows a collapsible list
 *     of the rest with a "+N more" badge, plus a "Reject all" button
 *     so the user can dismiss the whole pile in one tap. Picking any
 *     individual call auto-declines the others — talking to two people
 *     in parallel isn't a real workflow.
 *
 * Per-call countdown:
 *   Each invite has its own 60s TTL tied to receivedAt so older calls
 *   in the queue expire on their own schedule, not the whole queue.
 *
 * Side effects while ringing:
 *   • Web-audio ringtone — single voice no matter how many calls
 *     (a 10-call orchestra would be torture).
 *   • Browser title pulses so a backgrounded tab gets attention.
 */
export default function IncomingCallModal() {
  const navigate = useNavigate()
  const incoming = useCallStore((s) => s.incoming)
  const removeIncoming = useCallStore((s) => s.removeIncoming)
  const clearAllIncoming = useCallStore((s) => s.clearAllIncoming)
  const { acceptCall, declineCall } = useChatHub()

  const primary = incoming[0] // newest ringer
  const others = incoming.slice(1)

  // Per-invite-id countdown so the right card auto-expires.
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    if (incoming.length === 0) return
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [incoming.length])

  // Auto-expire any individual call that has crossed the 60s mark.
  useEffect(() => {
    for (const c of incoming) {
      const secondsLeft = INVITE_TTL_SECS - Math.floor((nowMs - c.receivedAt) / 1000)
      if (secondsLeft <= 0) removeIncoming(c.inviteId)
    }
  }, [nowMs, incoming, removeIncoming])

  // ── Ringtone (Web Audio API — no asset file needed)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const ringIntervalRef = useRef<number | null>(null)
  useEffect(() => {
    if (incoming.length === 0) return
    try {
      const ctx = audioCtxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx
      const playBeep = () => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 440
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
        osc.start()
        osc.stop(ctx.currentTime + 0.55)
      }
      playBeep()
      ringIntervalRef.current = window.setInterval(playBeep, 1800)
    } catch { /* audio blocked — silent ring is fine */ }
    return () => {
      if (ringIntervalRef.current) window.clearInterval(ringIntervalRef.current)
      ringIntervalRef.current = null
    }
  }, [incoming.length > 0])

  // ── Title pulse for backgrounded tabs
  const originalTitleRef = useRef<string>('')
  const titleSwapRef = useRef<number | null>(null)
  useEffect(() => {
    if (incoming.length === 0) return
    originalTitleRef.current = document.title
    let on = false
    titleSwapRef.current = window.setInterval(() => {
      on = !on
      const tag = incoming.length > 1 ? `(${incoming.length}) ` : ''
      document.title = on ? `📞 ${tag}Incoming call…` : originalTitleRef.current
    }, 1000)
    return () => {
      if (titleSwapRef.current) window.clearInterval(titleSwapRef.current)
      document.title = originalTitleRef.current
    }
  }, [incoming.length])

  // ── Expanded "Others" list toggle (collapsed by default)
  const [othersExpanded, setOthersExpanded] = useState(false)
  useEffect(() => { if (others.length === 0) setOthersExpanded(false) }, [others.length])

  if (incoming.length === 0) return null
  if (!primary) return null

  const secondsLeftFor = (c: IncomingCall) =>
    Math.max(0, INVITE_TTL_SECS - Math.floor((nowMs - c.receivedAt) / 1000))

  const handleAccept = async (c: IncomingCall) => {
    // Auto-decline all other ringers so the queue is clear when the
    // user lands in the live call. acceptCall fires on the hub; we
    // also need to decline the rest so they don't keep ringing.
    for (const other of incoming) {
      if (other.inviteId === c.inviteId) continue
      declineCall(other.inviteId).catch(() => { /* silent */ })
    }
    clearAllIncoming()
    acceptCall(c.inviteId)
    navigate(`/video/invite`, { state: { roomName: c.roomName, inviteId: c.inviteId } })
  }

  const handleDecline = (c: IncomingCall) => {
    declineCall(c.inviteId).catch(() => { /* silent */ })
    removeIncoming(c.inviteId)
  }

  const handleRejectAll = () => {
    for (const c of incoming) declineCall(c.inviteId).catch(() => { /* silent */ })
    clearAllIncoming()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-sm bg-[var(--color-surface-1)] border border-[var(--color-line)]
                   rounded-t-2xl sm:rounded-md shadow-2xl flex flex-col max-h-[80vh]"
      >
        {/* Primary call card */}
        <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center">
          <div className="relative">
            <Avatar name={primary.callerName} size="lg" />
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center animate-pulse">
              <Phone size={12} />
            </span>
          </div>
          <p className="mt-3 text-base font-semibold text-[var(--color-fg)]">{primary.callerName}</p>
          <p className="text-xs text-[var(--color-fg-mute)] mt-0.5">
            Incoming call · {secondsLeftFor(primary)}s
          </p>
          {primary.message && (
            <p className="mt-3 text-sm text-[var(--color-fg-dim)] italic">
              "{primary.message}"
            </p>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              onClick={() => handleDecline(primary)}
              className="w-12 h-12 rounded-full bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Decline"
              title="Decline"
            >
              <PhoneOff size={18} />
            </button>
            <button
              onClick={() => handleAccept(primary)}
              className="w-12 h-12 rounded-full bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] text-white inline-flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Accept"
              title="Accept"
            >
              <Phone size={18} />
            </button>
          </div>
        </div>

        {/* Additional callers — collapsible list */}
        {others.length > 0 && (
          <div className="border-t border-[var(--color-line)] flex flex-col min-h-0">
            <button
              onClick={() => setOthersExpanded((v) => !v)}
              className="shrink-0 px-4 py-2.5 flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Users size={11} /> +{others.length} more calling
              </span>
              {othersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {othersExpanded && (
              <ul className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
                {others.map((c) => (
                  <li
                    key={c.inviteId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--color-surface-2)]"
                  >
                    <Avatar name={c.callerName} size="xs" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-medium text-[var(--color-fg)] truncate">
                        {c.callerName}
                      </span>
                      <span className="block text-[10px] text-[var(--color-fg-mute)]">
                        {secondsLeftFor(c)}s left
                      </span>
                    </span>
                    <button
                      onClick={() => handleAccept(c)}
                      className="w-7 h-7 rounded-full bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] text-white inline-flex items-center justify-center"
                      aria-label={`Accept ${c.callerName}`}
                      title="Accept (auto-declines others)"
                    >
                      <Phone size={11} />
                    </button>
                    <button
                      onClick={() => handleDecline(c)}
                      className="w-7 h-7 rounded-full bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center justify-center"
                      aria-label={`Decline ${c.callerName}`}
                      title="Decline"
                    >
                      <PhoneOff size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={handleRejectAll}
              className="shrink-0 mx-3 my-2 px-3 py-2 rounded-md
                         bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger)]
                         text-[var(--color-danger-fg)] hover:text-white
                         text-xs font-semibold transition-colors"
            >
              Reject all ({incoming.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
