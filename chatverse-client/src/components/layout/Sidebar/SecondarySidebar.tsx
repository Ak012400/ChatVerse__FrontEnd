import type { ReactNode } from 'react'
import { PanelLeftClose } from 'lucide-react'
import { useUiStore } from '../../../stores/uiStore'
import { useResizableWidth } from '../../../hooks/useResizableWidth'
import { DragHandle } from '../../ui/DragHandle'

interface Props {
  title?: string
  action?: ReactNode
  children: ReactNode
}

/**
 * Secondary navigation panel. Honors the global "collapsed" preference
 * — when collapsed, the component renders nothing and AppLayout shows
 * an expand handle instead. Width is user-resizable on desktop via the
 * DragHandle rendered on the rail's right edge; the chosen width is
 * persisted across sessions.
 */
export default function SecondarySidebar({ title, action, children }: Props) {
  const collapsed = useUiStore((s) => s.secondaryCollapsed)
  const toggle = useUiStore((s) => s.toggleSecondary)

  // Drag-to-resize. Width persists in localStorage so the user's chosen
  // sidebar width is the same on next visit.
  const resize = useResizableWidth({
    storageKey: 'secondary-sidebar',
    defaultWidth: 240,  // matches the original w-60
    minWidth: 200,
    maxWidth: 420,
    direction: 'right',
  })

  if (collapsed) return null

  return (
    <>
    <aside
      className="shrink-0 h-screen bg-[var(--color-surface-1)] flex flex-col"
      style={{ width: `${resize.width}px` }}
    >
      {(title || action) && (
        <div className="h-14 px-3 flex items-center justify-between border-b border-[var(--color-line)]">
          {title && (
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-fg)] pl-1">
              {title}
            </h2>
          )}
          <div className="flex items-center gap-1">
            {action}
            <button
              onClick={toggle}
              className="w-7 h-7 rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] inline-flex items-center justify-center transition-colors"
              aria-label="Collapse sidebar"
              title="Collapse sidebar (saves space)"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2">{children}</div>
    </aside>
    {/* Drag handle on the right edge — pulls the sidebar wider/narrower. */}
    <DragHandle
      isDragging={resize.isDragging}
      onPointerDown={resize.onPointerDown}
      onDoubleClick={resize.resetToDefault}
      label="Resize sidebar"
    />
    </>
  )
}
