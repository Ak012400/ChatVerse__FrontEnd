import { useNavigate } from 'react-router-dom'
import {
  Shuffle, Users, UserPlus, Video as VideoIcon, ShieldAlert, Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

const MODES = [
  {
    path: '/video/random',
    Icon: Shuffle,
    title: 'Random 1-on-1',
    desc: 'Quick match with one stranger. Skip whenever.',
    tag: 'Classic',
    tone: 'accent' as const,
  },
  {
    path: '/video/random-group',
    Icon: Users,
    title: 'Random group',
    desc: 'Walk into a small group of strangers — up to 6 people.',
    tag: 'New',
    tone: 'success' as const,
  },
  {
    path: '/video/invite',
    Icon: UserPlus,
    title: 'Direct call',
    desc: 'Invite someone you know to a private 1-on-1.',
    tag: null,
    tone: 'neutral' as const,
  },
  {
    path: '/video/hosted',
    Icon: VideoIcon,
    title: 'Hosted group',
    desc: 'Create or join a named room with up to 10 people.',
    tag: null,
    tone: 'neutral' as const,
  },
] as const

export default function VideoLobbyPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()

  const handlePick = (path: string) => {
    const bypass = import.meta.env.VITE_BYPASS_RESTRICTIONS === 'true'
    if (!bypass && !user?.ageVerified) {
      showToast({
        type: 'warning',
        title: 'Age verification required',
        message: 'Verify your age to unlock video chat.',
        duration: 4000,
      })
      return
    }
    navigate(path)
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] text-[var(--color-accent-fg)] mb-4">
            <Sparkles size={12} />
            <span className="text-xs font-medium">AI-moderated video</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">How do you want to chat?</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">
            Pick a mode. Every session is monitored — keep it real.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODES.map(({ path, Icon, title, desc, tag, tone }) => (
            <button
              key={path}
              onClick={() => handlePick(path)}
              className="text-left"
            >
              <Card padding="lg" hover className="h-full">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 shrink-0 rounded-md bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-accent-fg)]">
                    <Icon size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-[var(--color-fg)]">{title}</h3>
                      {tag && <Badge tone={tone} size="sm">{tag}</Badge>}
                    </div>
                    <p className="text-[13px] text-[var(--color-fg-faint)] leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>

        <div className="mt-8 px-4 py-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] flex items-start gap-2.5">
          <ShieldAlert size={14} className="text-[var(--color-fg-faint)] mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed">
              <span className="text-[var(--color-fg)] font-medium">Safety first.</span>{' '}
              Your camera feed is scanned for inappropriate content in your browser. Violations
              automatically end the session and reduce your trust score. CSAM detection is always on
              and can't be disabled.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
