import type { ReactNode } from 'react'
import { PanelLeftClose } from 'lucide-react'
import { useUiStore } from '../../../stores/uiStore'

interface Props {
  title?: string
  action?: ReactNode
  children: ReactNode
}

/**
 * Secondary navigation panel. Honors the global "collapsed" preference
 * — when collapsed, the component renders nothing and AppLayout shows
 * an expand handle instead. Width stays consistent (240px) when open.
 */
export default function SecondarySidebar({ title, action, children }: Props) {
  const collapsed = useUiStore((s) => s.secondaryCollapsed)
  const toggle = useUiStore((s) => s.toggleSecondary)

  if (collapsed) return null

  return (
    <aside className="w-60 shrink-0 h-screen bg-[var(--color-surface-1)] border-r border-[var(--color-line)] flex flex-col">
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
  )
}
