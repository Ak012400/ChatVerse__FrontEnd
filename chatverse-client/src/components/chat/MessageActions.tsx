import { useEffect, useRef, useState } from 'react'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import { SmilePlus } from 'lucide-react'

/**
 * Quick reactions presented in the floating hover toolbar. Six is the
 * sweet spot — small enough to fit on mobile, broad enough that most
 * vibes are covered without forcing users into the full picker.
 */
const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👍', '🎉', '🙏']

/**
 * Floating toolbar that appears when a user hovers a message bubble.
 *
 * Design notes:
 * - On desktop it's purely hover-driven (`group-hover` on the parent
 *   row). On touch devices browsers fire `hover` once after a tap, so
 *   tapping a message bubble also reveals the toolbar — close enough
 *   to the Telegram/iMessage long-press behaviour for v1.
 * - Picker opens on demand only — `emoji-picker-react` ships ~280 KB
 *   of emoji data, so we lazily render it on first click instead of
 *   mounting it inside every message row.
 * - Outside-click closes the picker via a document listener installed
 *   only while it's open (avoids global listener churn).
 */
export function MessageActions({
  onReact,
  alignRight = false,
}: {
  onReact: (emoji: string) => void
  /** Mirror the alignment of the parent message bubble (right for own). */
  alignRight?: boolean
}) {
  const [showPicker, setShowPicker] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click — only installed while open so the
  // common "no picker" case stays event-listener-free.
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const handlePick = (emoji: string) => {
    onReact(emoji)
    setShowPicker(false)
  }

  return (
    <div
      className={[
        // Hidden until the parent .group hovers — keeps the chat row
        // visually quiet by default and only reveals on intent.
        'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        'transition-opacity',
        'absolute -top-3 z-10',
        alignRight ? 'right-2' : 'left-12',
      ].join(' ')}
      // Tapping inside shouldn't bubble up and dismiss any parent UI
      // (e.g. an emoji panel attached to the chat input).
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-0.5 px-1 py-0.5 rounded-full
                   bg-[var(--color-surface-1)] border border-[var(--color-line)]
                   shadow-md"
      >
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => handlePick(e)}
            className="text-base px-1.5 py-0.5 rounded-full
                       hover:bg-[var(--color-surface-2)]
                       transition-colors leading-none"
            aria-label={`React with ${e}`}
            title={`React with ${e}`}
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="px-1.5 py-0.5 rounded-full text-[var(--color-fg-mute)]
                     hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]
                     transition-colors"
          aria-label="More emojis"
          title="More emojis"
        >
          <SmilePlus size={13} />
        </button>
      </div>

      {showPicker && (
        <div
          ref={popoverRef}
          className={[
            'absolute z-30 top-9',
            alignRight ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          <EmojiPicker
            theme={Theme.AUTO}
            // Small height — the picker's default 450px is excessive
            // inside a chat row and pushes the toolbar off-screen.
            height={350}
            width={300}
            lazyLoadEmojis
            onEmojiClick={(e) => handlePick(e.emoji)}
          />
        </div>
      )}
    </div>
  )
}
