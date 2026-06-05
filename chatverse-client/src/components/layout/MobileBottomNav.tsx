import { useNavigate, useLocation } from 'react-router-dom'
import { MessagesSquare, Video, Mail, User } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

/**
 * Mobile-only bottom navigation. Mirrors the desktop PrimarySidebar's
 * core destinations (chat / video / DMs / profile) but in the standard
 * iOS-/Android-style horizontal strip. Hidden on sm and above — desktop
 * users get the vertical PrimarySidebar instead.
 *
 * The active tab gets a prominent accent treatment (filled icon +
 * accent color + small dot below) so the user always knows where they
 * are — matches the same active-state language as the desktop sidebar.
 */
export default function MobileBottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)

  const isGuest = !!user?.isGuest

  const items: { key: string; icon: typeof MessagesSquare; label: string; to: string; match: (p: string) => boolean; hide?: boolean }[] = [
    { key: 'chat',    icon: MessagesSquare, label: 'Chat',    to: '/chat',    match: (p) => p.startsWith('/chat') },
    { key: 'video',   icon: Video,          label: 'Video',   to: '/video',   match: (p) => p.startsWith('/video') },
    { key: 'dms',     icon: Mail,           label: 'DMs',     to: '/dms',     match: (p) => p.startsWith('/dms'),     hide: isGuest },
    { key: 'profile', icon: User,           label: 'Profile', to: '/profile', match: (p) => p.startsWith('/profile') },
  ]

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30
        bg-[var(--color-surface-1)]/95 backdrop-blur-md
        border-t border-[var(--color-line)]
        pb-[env(safe-area-inset-bottom,0)]"
      aria-label="Primary navigation"
    >
      <ul className="grid grid-cols-4">
        {items.filter((i) => !i.hide).map((it) => {
          const Icon = it.icon
          const active = it.match(pathname)
          return (
            <li key={it.key}>
              <button
                onClick={() => navigate(it.to)}
                className={`group w-full h-14 flex flex-col items-center justify-center gap-0.5
                  transition-[color,transform] duration-150 ease-out
                  active:scale-[0.94]
                  ${active ? 'text-[var(--color-accent-fg)]' : 'text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]'}`}
                aria-label={it.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  size={20}
                  className={`transition-transform duration-150 ${active ? 'scale-110' : 'group-hover:scale-105'}`}
                />
                <span className={`text-[10px] font-medium ${active ? '' : 'opacity-80'}`}>
                  {it.label}
                </span>
                {/* Active dot — small accent indicator under the icon */}
                <span
                  className={`absolute -bottom-0.5 w-1 h-1 rounded-full bg-[var(--color-accent)]
                    transition-opacity duration-150 ${active ? 'opacity-100' : 'opacity-0'}`}
                  aria-hidden="true"
                />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
