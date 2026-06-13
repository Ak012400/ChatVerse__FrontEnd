import { useEffect, useRef, useState } from 'react'

/**
 * Visual progress indicator shown while the SignalR hub is mid-handshake.
 *
 * Why a fake percentage instead of a spinner:
 *   SignalR's connection lifecycle (negotiate → connect → handshake) is
 *   binary from React's point of view — we only know "not connected" /
 *   "connected", no intermediate signal. A pure spinner gives the user
 *   no sense that things are progressing, which feels frozen.
 *
 *   Instead we synthesise a percentage from elapsed time using a soft
 *   exponential decay:
 *     f(t) = 95 × (1 − e^(−t / 2000))
 *   …which fills aggressively in the first second (so users see motion
 *   immediately), then slows and asymptotes at ~95 %. Psychologically
 *   that's the "almost done" zone, not the "stuck" zone. Once the real
 *   connection lands, the parent unmounts this component and the input
 *   appears, replacing the 95 % visual cleanly.
 *
 * Phase labels: derived from the same elapsed time so the caption
 * changes feel earned ("Authenticating…" doesn't appear at t=0).
 */
export function ChatConnectingLoader() {
  const startRef = useRef<number>(Date.now())
  const [percent, setPercent] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      setElapsedMs(elapsed)
      // 95% asymptote so the bar never claims "done" prematurely.
      const pct = 95 * (1 - Math.exp(-elapsed / 2000))
      setPercent(pct)
    }, 100)
    return () => clearInterval(id)
  }, [])

  // Pick a caption that matches roughly how far along the bar is.
  const phase =
    elapsedMs < 700  ? 'Opening connection'
    : elapsedMs < 1800 ? 'Authenticating'
    : elapsedMs < 3500 ? 'Joining room'
    :                    'Almost there'

  return (
    <div
      className="relative h-9 px-3 rounded-md
                 bg-[var(--color-surface-1)] border border-[var(--color-line)]
                 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Progress fill — sits behind the text. Width is the synthesised
          percentage; the soft accent-tint makes it feel kinetic without
          shouting. */}
      <div
        className="absolute inset-y-0 left-0 bg-[var(--color-accent-soft)] transition-[width] duration-150 ease-out"
        style={{ width: `${percent}%` }}
        aria-hidden
      />

      {/* Foreground row — spinner, caption, percentage. */}
      <div className="relative flex items-center justify-center gap-2.5 h-full text-[12px] text-[var(--color-fg)]">
        <span
          className="w-3.5 h-3.5 rounded-full border-[1.5px] border-[var(--color-accent)] border-t-transparent shrink-0"
          style={{ animation: 'spin 0.7s linear infinite' }}
        />
        <span className="truncate">
          {phase}…{' '}
          <span className="text-[var(--color-fg-mute)]">
            you'll be able to type in a moment
          </span>
        </span>
        <span className="tabular-nums text-[11px] text-[var(--color-fg-mute)] font-semibold shrink-0">
          {Math.floor(percent)}%
        </span>
      </div>
    </div>
  )
}
