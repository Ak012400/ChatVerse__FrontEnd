import { useEffect, useRef, useState } from 'react'

/**
 * Drag-to-resize horizontal splitter between two panels.
 *
 * Usage:
 *   <ResizableSplit
 *     storageKey="chat-music"
 *     defaultRightPx={320}
 *     minRightPx={240}
 *     maxRightPx={520}
 *     left={<ChatColumn />}
 *     right={<MusicPanel />}
 *   />
 *
 * The right panel's width in pixels is persisted to localStorage per
 * `storageKey` so each layout keeps its own remembered size. Clamping
 * to `min/maxRightPx` happens both during drag AND on hydration in
 * case the saved value is stale.
 *
 * Disabled below `lg:` — phones use single-column layouts and a
 * draggable splitter there would only steal vertical real estate.
 * On small screens we collapse to a stacked `flex-col` layout so the
 * children flow naturally; no resize affordance is rendered.
 *
 * The handle itself is a 6px hit area with a 1px visible center line.
 * The wider hit area means the user doesn't need pixel-perfect aim,
 * but the visible line keeps the chrome quiet.
 */
export function ResizableSplit({
  storageKey,
  defaultRightPx,
  minRightPx = 240,
  maxRightPx = 600,
  left,
  right,
  className,
}: {
  /** localStorage key for the remembered width. */
  storageKey: string
  /** Default right-panel width in px when no stored value exists. */
  defaultRightPx: number
  minRightPx?: number
  maxRightPx?: number
  left: React.ReactNode
  right: React.ReactNode
  className?: string
}) {
  const lsKey = `chatverse:layout:${storageKey}`

  const containerRef = useRef<HTMLDivElement | null>(null)
  // Hydrate from localStorage on mount; clamp because the user might
  // have shrunk the viewport since their last visit.
  const [rightPx, setRightPx] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      const n = raw ? Number(raw) : defaultRightPx
      if (!Number.isFinite(n)) return defaultRightPx
      return Math.max(minRightPx, Math.min(maxRightPx, n))
    } catch {
      return defaultRightPx
    }
  })
  const [dragging, setDragging] = useState(false)

  // Drag loop — installed only while a drag is active so we don't pay
  // for global listeners on every render. We pin the cursor to
  // `col-resize` so the user gets visual feedback that the page is
  // tracking their drag even outside the handle hit area.
  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      // Right-panel width = distance from cursor to the right edge.
      const next = rect.right - e.clientX
      const clamped = Math.max(minRightPx, Math.min(maxRightPx, next))
      setRightPx(clamped)
    }

    const onUp = () => {
      setDragging(false)
      try { localStorage.setItem(lsKey, String(rightPx)) } catch { /* ignore */ }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, rightPx, minRightPx, maxRightPx, lsKey])

  // Double-click resets to the default — handy for users who shrink
  // the panel to nothing and want a quick way back.
  const handleDoubleClick = () => {
    setRightPx(defaultRightPx)
    try { localStorage.setItem(lsKey, String(defaultRightPx)) } catch { /* ignore */ }
  }

  return (
    <div
      ref={containerRef}
      className={[
        // Mobile = stacked single column; desktop = horizontal split.
        'flex-1 min-h-0 flex flex-col lg:flex-row',
        className ?? '',
      ].join(' ')}
    >
      {/* Left panel — flex-1 so it fills whatever's left after the
          right panel's chosen width. */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {left}
      </div>

      {/* Drag handle — desktop only. The 6px hit area is wider than
          the 1px visible center line so users don't need pixel-perfect
          aim. Hover/active states reinforce that this is interactive. */}
      <div
        className={[
          'hidden lg:flex shrink-0 w-1.5 cursor-col-resize relative group',
          'bg-[var(--color-line)]',
          dragging ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-line-strong)]',
          'transition-colors',
        ].join(' ')}
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDoubleClick={handleDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel (double-click to reset)"
        title="Drag to resize · Double-click to reset"
      >
        {/* Subtle grip dots — only visible on hover so the rail isn't
            visually noisy at rest. */}
        <span
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-0.5 h-0.5 rounded-full bg-[var(--color-fg-mute)]" />
          ))}
        </span>
      </div>

      {/* Right panel — width on lg+, full-width below (mobile stack). */}
      <div
        className="shrink-0 min-h-0 min-w-0 flex flex-col w-full"
        style={{
          // Tailwind's arbitrary [w-Npx] doesn't work for dynamic values,
          // so we set width inline only on lg via a media-query CSS hack.
          // Simpler: rely on a CSS variable + tailwind responsive class.
          ['--rs-width' as never]: `${rightPx}px`,
        }}
      >
        <style>{`
          @media (min-width: 1024px) {
            [data-rs-right] { width: var(--rs-width) !important; }
          }
        `}</style>
        <div data-rs-right className="h-full min-h-0">
          {right}
        </div>
      </div>
    </div>
  )
}
