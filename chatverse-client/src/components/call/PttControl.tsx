import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { useUiStore } from '../../stores/uiStore'

// ============================================================
//  PttControl — single control-bar surface for Push-to-Talk.
//
//  Three states packed into one button:
//   1. PTT OFF    →  ghosted radio icon + "Always on" tooltip.
//                    Tap to open settings popover and turn PTT on.
//   2. PTT ON     →  bright accent icon + "PTT (Space)" caption.
//                    Tap to open settings popover.
//   3. HOLDING    →  full-accent pill with pulsing dot.
//                    Live mic. Driven from `holding` prop.
//
//  Popover lets the user toggle PTT and pick a key (Space / V / B).
//  The page controls when the popover is open via the trigger button
//  but the popover itself is rendered inline so it positions relative
//  to the button — no portal needed for this size.
// ============================================================

type Props = {
  /** Whether PTT pref is currently engaged (page can override with
   *  enabled=false to grey out the control before call connects). */
  enabled: boolean
  /** Live "user is holding the key right now" flag — drives the pulse. */
  holding: boolean
  /** Optional className to position the control in the parent's flex row. */
  className?: string
}

const KEY_PRESETS: { code: string; label: string }[] = [
  { code: 'Space', label: 'Space' },
  { code: 'KeyV', label: 'V' },
  { code: 'KeyB', label: 'B' },
  { code: 'KeyG', label: 'G' },
]

export default function PttControl({ enabled, holding, className }: Props) {
  const pttEnabled = useUiStore((s) => s.pttEnabled)
  const setPttEnabled = useUiStore((s) => s.setPttEnabled)
  const pttKey = useUiStore((s) => s.pttKey)
  const setPttKey = useUiStore((s) => s.setPttKey)

  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click — simple-enough for an in-call ephemeral popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const isActive = enabled && pttEnabled
  const isHoldingLive = isActive && holding
  const keyLabel = KEY_PRESETS.find((k) => k.code === pttKey)?.label ?? pttKey

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'h-11 px-3 rounded-md inline-flex items-center gap-1.5 text-xs font-medium',
          'border transition-all',
          isHoldingLive
            ? 'bg-[var(--color-success)] text-white border-[var(--color-success)] shadow-[0_0_16px_var(--color-success)]'
            : isActive
              ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border-[var(--color-accent-soft)] hover:bg-[var(--color-accent-soft)]/80'
              : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/15',
        ].join(' ')}
        aria-label="Push-to-talk settings"
        title={
          isHoldingLive
            ? `Live · holding ${keyLabel}`
            : isActive
              ? `Push-to-talk on · hold ${keyLabel}`
              : 'Push-to-talk off (always on)'
        }
      >
        <Radio
          size={14}
          className={isHoldingLive ? 'cv-ptt-pulse' : ''}
        />
        <span className="hidden sm:inline">
          {isHoldingLive ? 'Live' : isActive ? `PTT · ${keyLabel}` : 'PTT'}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full mb-2 right-0 w-64 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-xl p-3 text-left z-40"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-xs font-medium text-[var(--color-fg)]">Push-to-talk</div>
            <button
              type="button"
              onClick={() => setPttEnabled(!pttEnabled)}
              className={[
                'relative w-9 h-5 rounded-full transition-colors',
                pttEnabled ? 'bg-[var(--color-accent-fg)]' : 'bg-[var(--color-surface-3)]',
              ].join(' ')}
              aria-pressed={pttEnabled}
              aria-label={pttEnabled ? 'Disable push-to-talk' : 'Enable push-to-talk'}
            >
              <span
                className={[
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  pttEnabled ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug mb-2.5">
            {pttEnabled
              ? 'Mic is muted until you hold the key.'
              : 'Mic stays on — mute manually with the mic button.'}
          </p>
          {pttEnabled && (
            <>
              <div className="text-[11px] text-[var(--color-fg-faint)] mb-1.5">Key</div>
              <div className="grid grid-cols-4 gap-1">
                {KEY_PRESETS.map((k) => (
                  <button
                    key={k.code}
                    type="button"
                    onClick={() => setPttKey(k.code)}
                    className={[
                      'h-8 rounded-md text-xs font-mono border transition-colors',
                      pttKey === k.code
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border-[var(--color-accent-fg)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                    ].join(' ')}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
