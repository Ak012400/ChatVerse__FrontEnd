import { useEffect, useRef, useState } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { ParticipantTile } from '@livekit/components-react'

/**
 * Picture-in-picture self-camera tile that floats over the call area
 * and can be dragged with mouse / touch — but only WITHIN its parent
 * container's bounds (the call canvas).
 *
 * Behaviour:
 *   • Default position: bottom-right of the container (Google Meet style).
 *   • Drag from any non-button area of the tile.
 *   • Position clamped on each move so the tile never crosses outside
 *     the container — including when the user resizes the window.
 *   • Last position persisted to localStorage so refresh / reconnect
 *     restores it.
 *   • Touch + mouse supported — same handler resolves both event paths.
 *
 * Must be rendered as a CHILD of a `position: relative` parent so the
 * absolute positioning has a reliable anchor.
 */

const LS_KEY = 'chatverse:call:selfTilePos'

interface Pos { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Pos>
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null
    return { x: p.x, y: p.y }
  } catch { return null }
}

function savePos(p: Pos) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export default function DraggableSelfTile({
  track,
  className,
}: {
  track: TrackReferenceOrPlaceholder
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // null until first measured — keeps the tile invisible during layout
  // race so it doesn't flash at (0,0).
  const [pos, setPos] = useState<Pos | null>(null)
  const dragRef = useRef<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false })

  // Mobile-aware default size: smaller on phones so it doesn't eat the
  // call area when there's already two big tiles below.
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  const tileWidth = isMobile ? 110 : 180
  const tileHeight = isMobile ? 80 : 130

  // ── Initial position. Restore from LS or default to bottom-right.
  useEffect(() => {
    const parent = wrapRef.current?.parentElement
    if (!parent) return
    const pr = parent.getBoundingClientRect()
    const saved = loadPos()
    const initial: Pos = saved
      ? clamp(saved, pr.width, pr.height, tileWidth, tileHeight)
      : { x: pr.width - tileWidth - 12, y: pr.height - tileHeight - 12 }
    setPos(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reclamp on window resize so the tile never strays outside the
  //    new bounds when the user rotates a phone or resizes a window.
  useEffect(() => {
    const onResize = () => {
      const parent = wrapRef.current?.parentElement
      if (!parent || !pos) return
      const pr = parent.getBoundingClientRect()
      const next = clamp(pos, pr.width, pr.height, tileWidth, tileHeight)
      if (next.x !== pos.x || next.y !== pos.y) setPos(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos, tileWidth, tileHeight])

  // ── Drag handlers (mouse + touch). We bind to window during drag so
  //    fast cursor movements outside the tile don't break the drag.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!wrapRef.current || !pos) return
    // Ignore drags that start on a button — let the click pass through.
    if ((e.target as HTMLElement).closest('button')) return

    const parent = wrapRef.current.parentElement
    if (!parent) return
    const pr = parent.getBoundingClientRect()

    dragRef.current.dx = e.clientX - (pr.left + pos.x)
    dragRef.current.dy = e.clientY - (pr.top + pos.y)
    dragRef.current.active = true

    // Capture so we keep getting events even if the pointer leaves
    // the tile.
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || !wrapRef.current) return
    const parent = wrapRef.current.parentElement
    if (!parent) return
    const pr = parent.getBoundingClientRect()
    const nextX = e.clientX - pr.left - dragRef.current.dx
    const nextY = e.clientY - pr.top - dragRef.current.dy
    setPos(clamp({ x: nextX, y: nextY }, pr.width, pr.height, tileWidth, tileHeight))
  }

  const onPointerUp = () => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    if (pos) savePos(pos)
  }

  // Hide the tile until first position is computed — avoids a 1-frame
  // flash at (0, 0) on initial mount.
  if (!pos) {
    return <div ref={wrapRef} style={{ display: 'none' }} />
  }

  return (
    <div
      ref={wrapRef}
      className={[
        'absolute z-30 rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-white/30',
        'touch-none select-none cursor-grab active:cursor-grabbing',
        // The inner LiveKit tile sometimes pads — flatten + cover so
        // the face fills the PiP without letterbox in this small form.
        '[&_.lk-participant-tile]:bg-transparent',
        '[&_.lk-participant-tile]:w-full',
        '[&_.lk-participant-tile]:h-full',
        '[&_video]:!object-cover',
        // Tiny "You" badge — confirms the PiP is the local participant.
        className ?? '',
      ].join(' ')}
      style={{
        left: pos.x,
        top: pos.y,
        width: tileWidth,
        height: tileHeight,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="img"
      aria-label="Your video — drag to move"
    >
      <ParticipantTile trackRef={track} disableSpeakingIndicator />
      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white pointer-events-none">
        You
      </span>
      {/* Tiny drag-affordance dots so users know it can be moved. */}
      <span className="absolute top-1 right-1 px-1 text-white/60 text-[10px] pointer-events-none">
        ⋮⋮
      </span>
    </div>
  )
}

function clamp(p: Pos, parentW: number, parentH: number, tileW: number, tileH: number): Pos {
  return {
    x: Math.max(4, Math.min(p.x, parentW - tileW - 4)),
    y: Math.max(4, Math.min(p.y, parentH - tileH - 4)),
  }
}
