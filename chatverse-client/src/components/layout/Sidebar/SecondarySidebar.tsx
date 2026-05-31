import type { ReactNode } from 'react'

interface Props {
  title?: string
  action?: ReactNode
  children: ReactNode
}

export default function SecondarySidebar({ title, action, children }: Props) {
  return (
    <aside className="w-60 shrink-0 h-screen bg-[var(--color-surface-1)] border-r border-[var(--color-line)] flex flex-col">
      {title && (
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--color-line)]">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">{title}</h2>
          {action}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-2">{children}</div>
    </aside>
  )
}
