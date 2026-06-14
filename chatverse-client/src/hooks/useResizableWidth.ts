import { useEffect, useRef, useState } from 'react'

/**
 * Tiny hook for "drag this edge to resize a panel" UX.
 *
 * Returns:
 *   width            current panel width in px (clamped, hydrated from localStorage)
 *   onPointerDown    handler to attach to the drag handle
 *   resetToDefault   double-click handler to snap back to default
 *   isDragging       flag so callers can highlight the handle while active
 *
 * `direction` controls which way the cursor movement interprets:
 *   "left"  — handle is on the LEFT edge of the panel, dragging left
 *             grows the panel (cursor moves left → more width).
 *   "right" — handle is on the RIGHT edge of the panel, dragging right
 *             grows the panel.
 *
 * Width is persisted per `storageKey` so each panel remembers its own
 * size across sessions, and clamped on hydration in case the saved
 * value is now larger than the viewport.
 */
export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth = 240,
  maxWidth = 600,
  direction = 'left',
}: {
  storageKey: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  direction?: 'left' | 'right'
}) {
  const lsKey = `chatverse:layout:${storageKey}`

  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      const n = raw ? Number(raw) : defaultWidth
      if (!Number.isFinite(n)) return defaultWidth
      return Math.max(minWidth, Math.min(maxWidth, n))
    } catch {
      return defaultWidth
    }
  })

  const [isDragging, setIsDragging] = useState(false)

  // Snapshot at drag-start so the drag math is relative — eliminates
  // cumulative drift if the panel's measured rect moves mid-drag.
  const startRef = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: PointerEvent) => {
      const start = startRef.current
      if (!start) return
      const dx = e.clientX - start.x
      // For a left-handle, moving LEFT (negative dx) GROWS the panel.
      const delta = direction === 'left' ? -dx : dx
      const next = Math.max(minWidth, Math.min(maxWidth, start.width + delta))
      setWidth(next)
    }

    const onUp = () => {
      setIsDragging(false)
      startRef.current = null
      try { localStorage.setItem(lsKey, String(width)) } catch { /* ignore */ }
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
  }, [isDragging, width, minWidth, maxWidth, lsKey, direction])

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    startRef.current = { x: e.clientX, width }
    setIsDragging(true)
  }

  const resetToDefault = () => {
    setWidth(defaultWidth)
    try { localStorage.setItem(lsKey, String(defaultWidth)) } catch { /* ignore */ }
  }

  return { width, onPointerDown, resetToDefault, isDragging }
}
