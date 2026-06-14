/**
 * Vertical splitter handle used between two horizontal panels.
 *
 * Pure presentation — drag logic lives in `useResizableWidth`. This
 * component just exposes a thin clickable bar with hover/active styles
 * and the standard accessibility attributes so callers don't have to
 * copy-paste the same JSX in five places.
 *
 * Usage:
 *   const r = useResizableWidth({...})
 *   <DragHandle
 *     isDragging={r.isDragging}
 *     onPointerDown={r.onPointerDown}
 *     onDoubleClick={r.resetToDefault}
 *     label="Resize sidebar"
 *   />
 */
export function DragHandle({
  isDragging,
  onPointerDown,
  onDoubleClick,
  label = 'Resize panel',
}: {
  isDragging: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onDoubleClick: () => void
  label?: string
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} (double-click to reset)`}
      title="Drag to resize · Double-click to reset"
      className={[
        'hidden lg:flex shrink-0 w-1.5 cursor-col-resize relative group transition-colors',
        isDragging
          ? 'bg-[var(--color-accent)]'
          : 'bg-[var(--color-line)] hover:bg-[var(--color-line-strong)]',
      ].join(' ')}
    >
      <span
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-0.5 h-0.5 rounded-full bg-[var(--color-fg-mute)]" />
        ))}
      </span>
    </div>
  )
}
