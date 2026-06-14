import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Reusable mobile bottom-sheet drawer.
 *
 * Same UX pattern as the Music Lounge sheet: slides up from the bottom
 * with a backdrop, has a grab-handle pill, dismisses on backdrop tap
 * or ✕. Designed to wrap a piece of UI (chat rail, scoreboard, etc.)
 * that lives inline as a side panel on desktop but needs a tap-to-open
 * affordance on phones where horizontal space is scarce.
 *
 * Body scroll lock: while open we set `overflow:hidden` on document
 * so the page underneath doesn't scroll along with sheet content.
 * Restored on close / unmount.
 */
export function MobileBottomSheet({
  open,
  onClose,
  title,
  children,
  heightVh = 78,
}: {
  open: boolean
  onClose: () => void
  /** Header label rendered above the close button. */
  title?: string
  children: React.ReactNode
  /** Sheet height as percentage of viewport (default 78%). */
  heightVh?: number
}) {
  // Body-scroll lock — prevents the page behind from scrolling
  // when the user swipes inside the sheet.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ── Drag-to-resize / drag-to-dismiss ──────────────────────────
  //  Users can drag the grab handle pill to:
  //   • pull the sheet up (taller, up to 95vh)
  //   • drag it down to shrink it
  //   • flick down hard (>40px below default) → triggers onClose
  //  This mirrors how the iOS Music / WhatsApp app sheets behave.
  const [draggedVh, setDraggedVh] = useState<number | null>(null)
  const dragStartRef = useRef<{ y: number; vh: number } | null>(null)
  const effectiveVh = draggedVh ?? heightVh

  const onHandlePointerDown = (e: React.PointerEvent) => {
    dragStartRef.current = { y: e.clientY, vh: effectiveVh }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current
    if (!start) return
    const dy = e.clientY - start.y
    const vhDelta = (dy / window.innerHeight) * 100
    // Up drag = negative dy = grow the sheet.
    const next = Math.max(20, Math.min(95, start.vh - vhDelta))
    setDraggedVh(next)
  }
  const onHandlePointerUp = (e: React.PointerEvent) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    // If dragged below ~25vh, treat as dismiss (matches native gesture).
    if (start && (draggedVh ?? heightVh) < heightVh - 25) {
      setDraggedVh(null)
      onClose()
    }
  }

  // ESC closes — keyboard users on tablets / desktop testing.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className={[
        'lg:hidden fixed inset-0 z-40 transition-opacity duration-200',
        open
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
      ].join(' ')}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={[
          'absolute inset-x-0 bottom-0',
          'bg-[var(--color-surface-1)]',
          'rounded-t-2xl border-t border-[var(--color-line)]',
          'shadow-2xl flex flex-col',
          'transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ height: `${effectiveVh}vh`, maxHeight: `${effectiveVh}vh` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Grab handle — drag up/down to resize, flick down to dismiss.
            Larger hit area than the visible pill so finger taps don't
            need pixel-perfect aim. */}
        <div
          className="shrink-0 flex flex-col items-center py-3 cursor-row-resize touch-none"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize sheet"
        >
          <span className="w-10 h-1 rounded-full bg-[var(--color-line)]" />
        </div>

        {/* Header row */}
        <div className="shrink-0 flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-fg-mute)] font-semibold">
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content area — caller controls its own overflow. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
