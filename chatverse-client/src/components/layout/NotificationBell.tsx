import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, X, Gamepad2, AlertCircle } from 'lucide-react'
import { useNotificationStore, type AppNotification } from '../../stores/notificationStore'
import IconButton from '../ui/IconButton'

// ============================================================
//  NotificationBell — sidebar bell icon + dropdown panel.
//
//  Click → toggles a small popover anchored to the bell. Reads
//  from useNotificationStore (which persists to localStorage).
//
//  Item types render with type-specific actions:
//   - game-invite → "Join" navigates to /play/{slug}
//   - room-closed → informational, no action
//   - system     → informational
//
//  The "Mark all read" button at the top is fire-and-forget; we
//  never block the UI on store writes.
// ============================================================

export default function NotificationBell() {
  const navigate = useNavigate()
  const items = useNotificationStore((s) => s.items)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const remove = useNotificationStore((s) => s.remove)
  const unread = items.filter((it) => !it.read).length

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click — standard popover pattern.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleItemClick = (n: AppNotification) => {
    markRead(n.id)
    if (n.type === 'game-invite') {
      const slug = (n.payload as { slug?: string })?.slug
      if (slug) {
        setOpen(false)
        navigate(`/play/${slug}`)
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <IconButton
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--color-danger)] text-white text-[9px] font-semibold flex items-center justify-center tabular-nums"
            aria-label={`${unread} unread`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div className="fixed sm:absolute bottom-14 sm:bottom-auto sm:left-14 sm:top-0 left-4 right-4 sm:right-auto z-40 w-auto sm:w-80 max-h-[60vh] sm:max-h-[480px] bg-[var(--color-bg)] border border-[var(--color-line)] rounded-md shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-[var(--color-line)]">
            <Bell size={12} className="text-[var(--color-accent-fg)]" />
            <span className="text-xs font-medium">Notifications</span>
            <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
              {items.length}
            </span>
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="ml-auto text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <Check size={10} /> Mark all read
            </button>
          </div>

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-[11px] text-[var(--color-fg-mute)] italic text-center">
                You're all caught up. Game invites and room updates land here.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={[
                      'group px-3 py-2 hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors',
                      !n.read ? 'bg-[var(--color-accent-soft)]/40' : '',
                    ].join(' ')}
                    onClick={() => handleItemClick(n)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">
                        {n.type === 'game-invite' && (
                          <Gamepad2 size={12} className="text-[var(--color-accent-fg)]" />
                        )}
                        {n.type === 'room-closed' && (
                          <X size={12} className="text-[var(--color-warning-fg)]" />
                        )}
                        {n.type === 'system' && (
                          <AlertCircle size={12} className="text-[var(--color-fg-mute)]" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{n.title}</p>
                        <p className="text-[10px] text-[var(--color-fg-mute)] leading-snug">
                          {n.body}
                        </p>
                        <p className="text-[9px] text-[var(--color-fg-mute)] mt-0.5">
                          {relativeTime(n.receivedAtUtc)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(n.id) }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-opacity shrink-0"
                        aria-label="Dismiss"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = (Date.now() - then) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
