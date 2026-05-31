import { useNavigate } from 'react-router-dom'
import { Shuffle, Users, UserSquare2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useToastStore } from '../../../stores/toastStore'

const MODES = [
  {
    id: 'random',
    Icon: Shuffle,
    title: 'Random match',
    desc: '1-on-1 with a stranger',
  },
  {
    id: '1-on-1',
    Icon: UserSquare2,
    title: 'Direct call',
    desc: 'Invite a specific user',
  },
  {
    id: 'group',
    Icon: Users,
    title: 'Group video',
    desc: 'Small-group rooms',
  },
] as const

export default function VideoSidebar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()

  const handleMode = (mode: string) => {
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
    navigate(`/video/${mode}`)
  }

  return (
    <div className="px-2 space-y-1.5">
      {MODES.map(({ id, Icon, title, desc }) => (
        <button
          key={id}
          onClick={() => handleMode(id)}
          className="w-full p-3 rounded-md text-left border border-[var(--color-line)] bg-[var(--color-surface-1)]
            hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]
            transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-md bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-fg-dim)] group-hover:text-[var(--color-accent-fg)] transition-colors">
              <Icon size={15} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-fg)]">{title}</p>
              <p className="text-[11px] text-[var(--color-fg-faint)]">{desc}</p>
            </div>
          </div>
        </button>
      ))}

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
