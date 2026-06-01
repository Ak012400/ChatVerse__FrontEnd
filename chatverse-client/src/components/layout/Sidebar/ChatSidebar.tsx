import { useMemo } from 'react'
import { Hash, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Room } from '../../../types'
import { useChatStore } from '../../../stores/chatStore'
import { useAuthStore } from '../../../stores/authStore'

interface Props {
  slug?: string
}

export default function ChatSidebar({ slug }: Props) {
  const rooms = useChatStore((s) => s.rooms)
  const onlineCount = useChatStore((s) => s.onlineCount)
  const isGuest = useAuthStore((s) => s.user?.isGuest ?? true)
  const navigate = useNavigate()

  // Group rooms by category — fall back to "Rooms" if unknown.
  const grouped = useMemo(() => {
    const map = new Map<string, Room[]>()
    for (const r of rooms) {
      const key = (r.category ?? 'rooms').toString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries())
  }, [rooms])

  return (
    <div className="px-2 space-y-5">
      {!isGuest && (
        <button
          onClick={() => navigate('/rooms/new')}
          className="w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
        >
          <Plus size={14} className="text-[var(--color-accent-fg)] shrink-0" />
          <span>New room</span>
        </button>
      )}

      {grouped.length === 0 && (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-[var(--color-fg-mute)]">No rooms yet.</p>
        </div>
      )}

      {grouped.map(([section, items]) => (
        <div key={section}>
          <div className="px-2 mb-1 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-mute)]">
              {section}
            </h3>
          </div>
          <div className="space-y-0.5">
            {items.map((r) => {
              const active = slug === r.slug
              const count = onlineCount[r.slug] ?? r.activeNow ?? 0
              return (
                <button
                  key={r.slug}
                  onClick={() => navigate(`/chat/${r.slug}`)}
                  className={`group w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors
                    ${
                      active
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
                        : 'text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
                    }`}
                >
                  <Hash size={14} className="text-[var(--color-fg-mute)] shrink-0" />
                  <span className="flex-1 text-left truncate">{r.displayName}</span>
                  {count > 0 && (
                    <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
