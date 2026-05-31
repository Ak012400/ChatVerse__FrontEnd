import { useNavigate, useLocation } from 'react-router-dom'
import { Shuffle, Users, UserPlus, Video as VideoIcon, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useToastStore } from '../../../stores/toastStore'

type Mode = {
  id: string
  path: string
  Icon: typeof Shuffle
  title: string
  desc: string
}

const MODES: Mode[] = [
  { id: 'random',       path: '/video/random',       Icon: Shuffle,  title: 'Random 1-on-1',    desc: 'Match with one stranger' },
  { id: 'random-group', path: '/video/random-group', Icon: Users,    title: 'Random group',     desc: 'Drop into a group of strangers' },
  { id: 'invite',       path: '/video/invite',       Icon: UserPlus, title: 'Invite to call',   desc: 'Call a specific user' },
  { id: 'hosted',       path: '/video/hosted',       Icon: VideoIcon, title: 'Hosted group',    desc: 'Create or join a named room' },
]

export default function VideoSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()

  const handleMode = (m: Mode) => {
    const bypass = import.meta.env.VITE_BYPASS_RESTRICTIONS === 'true'
    if (!bypass && !user?.ageVerified) {
      showToast({
        type: 'warning',
        title: 'Age verification required',
        message: 'Verify your age in profile to unlock video.',
        duration: 4000,
      })
      return
    }
    navigate(m.path)
  }

  return (
    <div className="px-2 space-y-1.5">
      {MODES.map((m) => {
        const active = pathname.startsWith(m.path)
        return (
          <button
            key={m.id}
            onClick={() => handleMode(m)}
            className={`w-full p-3 rounded-md text-left border transition-colors group
              ${
                active
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-line-strong)]'
                  : 'bg-[var(--color-surface-1)] border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]'
              }`}
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
                <m.Icon size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-fg)]">{m.title}</p>
                <p className="text-[11px] text-[var(--color-fg-faint)]">{m.desc}</p>
              </div>
            </div>
          </button>
        )
      })}

      {!user?.ageVerified && (
        <div className="mt-3 mx-1 p-3 rounded-md bg-[var(--color-warning-soft)] border border-[rgba(245,158,11,0.3)]">
          <div className="flex items-center gap-2 text-[var(--color-warning)] mb-1">
            <ShieldCheck size={13} />
            <span className="text-xs font-medium">Verification required</span>
          </div>
          <p className="text-[11px] text-[var(--color-fg-dim)] leading-relaxed">
            Complete age verification in profile to unlock video chat.
          </p>
        </div>
      )}
    </div>
  )
}
