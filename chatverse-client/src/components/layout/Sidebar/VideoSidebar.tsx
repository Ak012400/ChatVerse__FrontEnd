import { useNavigate, useLocation } from 'react-router-dom'
import {
  Shuffle, Users, UserPlus, Video as VideoIcon, ShieldCheck, Lock,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useToastStore } from '../../../stores/toastStore'

type Mode = {
  id: string
  path: string
  Icon: typeof Shuffle
  title: string
  desc: string
  requires: 'guest' | 'registered'
}

const MODES: Mode[] = [
  { id: 'random',       path: '/video/random',       Icon: Shuffle,   title: 'Random 1-on-1',  desc: 'Match with one stranger',           requires: 'guest' },
  { id: 'random-group', path: '/video/random-group', Icon: Users,     title: 'Random group',   desc: 'Drop into a group of strangers',     requires: 'guest' },
  { id: 'invite',       path: '/video/invite',       Icon: UserPlus,  title: 'Invite to call', desc: 'Call a specific user',               requires: 'registered' },
  { id: 'hosted',       path: '/video/hosted',       Icon: VideoIcon, title: 'Hosted group',   desc: 'Create or join a named room',         requires: 'registered' },
]

export default function VideoSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()
  const isGuest = user?.isGuest ?? true

  const handleMode = (m: Mode) => {
    if (m.requires === 'registered' && isGuest) {
      showToast({
        type: 'info',
        title: 'Create an account',
        message: 'Sign up to unlock this mode.',
        duration: 3000,
      })
      navigate('/register')
      return
    }
    navigate(m.path)
  }

  return (
    <div className="px-2 space-y-1.5">
      <button
        onClick={() => navigate('/video')}
        className={`w-full px-3 py-2 rounded-md text-left text-xs font-medium transition-colors
          ${
            pathname === '/video'
              ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
              : 'text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
          }`}
      >
        All modes
      </button>

      {MODES.map((m) => {
        const active = pathname.startsWith(m.path)
        const locked = m.requires === 'registered' && isGuest
        return (
          <button
            key={m.id}
            onClick={() => handleMode(m)}
            className={`w-full p-3 rounded-md text-left border transition-colors group
              ${
                active
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-line-strong)]'
                  : 'bg-[var(--color-surface-1)] border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]'
              }
              ${locked ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors
                  ${
                    active
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] group-hover:text-[var(--color-accent-fg)]'
                  }`}
              >
                {locked ? <Lock size={14} /> : <m.Icon size={15} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-fg)]">{m.title}</p>
                <p className="text-[11px] text-[var(--color-fg-faint)]">{m.desc}</p>
              </div>
            </div>
          </button>
        )
      })}

      {isGuest && (
        <div className="mt-3 mx-1 p-3 rounded-md bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)]">
          <div className="flex items-center gap-2 text-[var(--color-accent-fg)] mb-1">
            <ShieldCheck size={13} />
            <span className="text-xs font-medium">Guest mode</span>
          </div>
          <p className="text-[11px] text-[var(--color-fg-dim)] leading-relaxed">
            Create an account to unlock direct invites and hosted rooms.
          </p>
        </div>
      )}
    </div>
  )
}
