import { useEffect, useRef, useState } from 'react'
import { Music2, X } from 'lucide-react'
import { useSoundboardHub, SOUNDS, type SoundboardScope, type SoundPlayedEvent } from '../../hooks/useSoundboardHub'

// ============================================================
//  SoundboardTray — collapsible 8-button tray for drama-flavoured
//  reaction sounds in shared-stage rooms (Theater / PYAAR LIVE
//  spectator / Mehfil / Hosted group video).
//
//  Two surface modes:
//    • Collapsed (default): single floating speaker button with badge.
//    • Expanded: grid of 8 emoji-labeled buttons + dismiss.
//
//  Floating "X tapped Applause" attribution chip surfaces briefly
//  when ANY remote user fires a sound (1.6s self-fade).
//
//  Positioning: parent sets `className` to drop it into the right
//  corner of its layout (bottom-right is the spec default).
// ============================================================

type Props = {
  scope: SoundboardScope
  scopeId: string | null | undefined
  /** Pages can pass false to hide while loading / unauth. */
  enabled?: boolean
  /** Position helper — defaults to bottom-right of parent. */
  className?: string
}

type FloatingAttribution = {
  id: number
  username: string
  emoji: string
  label: string
}

let attributionSeq = 0

export default function SoundboardTray({ scope, scopeId, enabled = true, className }: Props) {
  const [open, setOpen] = useState(false)
  const [attributions, setAttributions] = useState<FloatingAttribution[]>([])
  const attrTimerRef = useRef<number | null>(null)

  const handleRemoteSound = (evt: SoundPlayedEvent) => {
    const meta = SOUNDS.find((s) => s.id === evt.soundId)
    if (!meta) return
    const id = ++attributionSeq
    setAttributions((prev) => [
      ...prev.slice(-2), // cap at 3 visible to avoid stacking spam
      { id, username: evt.byUsername, emoji: meta.emoji, label: meta.label },
    ])
    // Self-clear after the animation finishes.
    window.setTimeout(() => {
      setAttributions((prev) => prev.filter((a) => a.id !== id))
    }, 1700)
  }

  const { playSound } = useSoundboardHub({
    scope,
    scopeId,
    enabled: enabled && !!scopeId,
    onSoundPlayed: handleRemoteSound,
  })

  useEffect(() => {
    return () => {
      if (attrTimerRef.current) window.clearTimeout(attrTimerRef.current)
    }
  }, [])

  if (!enabled || !scopeId) return null

  return (
    <div className={`fixed pointer-events-none z-30 ${className ?? 'bottom-24 right-4'}`}>
      {/* Floating attribution chips — never block clicks underneath. */}
      <div className="absolute bottom-full right-0 mb-2 flex flex-col items-end gap-1.5 pointer-events-none">
        {attributions.map((a) => (
          <div
            key={a.id}
            className="cv-fade-up inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-xs px-3 py-1.5 border border-white/10"
          >
            <span className="text-base leading-none">{a.emoji}</span>
            <span className="font-medium">{a.username}</span>
            <span className="text-white/60">· {a.label}</span>
          </div>
        ))}
      </div>

      {/* Tray itself — pointer events restored on the button + panel. */}
      <div className="pointer-events-auto">
        {open ? (
          <div className="rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl p-3 w-64">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[var(--color-fg)] inline-flex items-center gap-1.5">
                <Music2 size={13} />
                Soundboard
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
                aria-label="Close soundboard"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SOUNDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => playSound(s.id)}
                  className="aspect-square rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)] border border-[var(--color-line)] hover:border-[var(--color-accent-fg)] flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95"
                  title={s.label}
                >
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className="text-[9px] text-[var(--color-fg-faint)] font-medium uppercase tracking-wide">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-fg-mute)] mt-2 leading-snug">
              Everyone in the room hears the same sound at the same moment.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-12 h-12 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-xl text-[var(--color-fg)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-fg)] hover:border-[var(--color-accent-fg)] flex items-center justify-center transition-colors"
            aria-label="Open soundboard"
            title="Soundboard"
          >
            <Music2 size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
