import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shuffle, Users, UserPlus, Video as VideoIcon, ShieldAlert, Sparkles, Lock, Monitor, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { theaterApi } from '../../api'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

type ModeDef = {
  path: string
  Icon: typeof Shuffle
  title: string
  desc: string
  tag: string | null
  tone: 'accent' | 'success' | 'neutral'
  requires: 'guest' | 'registered'
}

const MODES: ModeDef[] = [
  {
    path: '/video/random',
    Icon: Shuffle,
    title: 'Random 1-on-1',
    desc: 'Quick match with one stranger. Skip whenever.',
    tag: 'Open to all',
    tone: 'accent',
    requires: 'guest',
  },
  {
    path: '/video/random-group',
    Icon: Users,
    title: 'Random group',
    desc: 'Walk into a small group of strangers — up to 6 people. AI-monitored.',
    tag: 'New',
    tone: 'success',
    requires: 'guest',
  },
  {
    path: '/video/invite',
    Icon: UserPlus,
    title: 'Direct call',
    desc: 'Invite someone you know to a private 1-on-1.',
    tag: null,
    tone: 'neutral',
    requires: 'registered',
  },
  {
    path: '/video/hosted',
    Icon: VideoIcon,
    title: 'Hosted group',
    desc: 'Create or join a named room with up to 50 people.',
    tag: null,
    tone: 'neutral',
    requires: 'registered',
  },
  // Theater handled separately below — it needs a quick title prompt
  // before navigation, so it isn't routed through the generic grid.
]

export default function VideoLobbyPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()
  const isGuest = user?.isGuest ?? true

  const isLocked = (mode: ModeDef) => mode.requires === 'registered' && isGuest

  const handlePick = (mode: ModeDef) => {
    if (isLocked(mode)) {
      showToast({
        type: 'info',
        title: 'Create an account',
        message: 'Sign up to unlock direct calls and hosted rooms.',
        duration: 3500,
      })
      navigate('/register')
      return
    }
    navigate(mode.path)
  }

  // Theater (Watch Party) — needs a room title before navigation so
  // we keep it out of the generic MODES grid and use this dedicated
  // creator that wraps the title prompt + create call.
  const [creatingTheater, setCreatingTheater] = useState(false)
  const handleStartTheater = async () => {
    if (isGuest) {
      showToast({
        type: 'info',
        title: 'Create an account',
        message: 'Watch parties need a registered account.',
        duration: 3500,
      })
      navigate('/register')
      return
    }
    const title = (window.prompt('Name your watch party (3–60 chars)')?.trim()) ?? ''
    if (!title || title.length < 3) return
    setCreatingTheater(true)
    try {
      const res = await theaterApi.create(title)
      const roomName: string = res.data?.data?.roomName
      if (!roomName) throw new Error('No room returned')
      navigate(`/theater/${roomName}`)
    } catch (err: any) {
      showToast({
        type: 'danger',
        title: 'Could not create',
        message: err?.response?.data?.error ?? 'Try again',
        duration: 3000,
      })
    } finally {
      setCreatingTheater(false)
    }
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
            {isGuest
              ? "You're browsing as a guest. Random modes are open to everyone — verified ones unlock after sign-up."
              : 'Pick a mode. Every session is monitored — keep it real.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODES.map((mode) => {
            const locked = isLocked(mode)
            return (
              <button
                key={mode.path}
                onClick={() => handlePick(mode)}
                className="text-left relative"
              >
                <Card padding="lg" hover={!locked} className={`h-full ${locked ? 'opacity-55' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span
                      className={`w-10 h-10 shrink-0 rounded-md flex items-center justify-center
                        ${locked
                          ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
                          : 'bg-[var(--color-surface-2)] text-[var(--color-accent-fg)]'
                        }`}
                    >
                      {locked ? <Lock size={16} /> : <mode.Icon size={18} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-[var(--color-fg)]">
                          {mode.title}
                        </h3>
                        {locked ? (
                          <Badge tone="warning" size="sm">Sign up to unlock</Badge>
                        ) : mode.tag ? (
                          <Badge tone={mode.tone} size="sm">{mode.tag}</Badge>
                        ) : null}
                      </div>
                      <p className="text-[13px] text-[var(--color-fg-faint)] leading-relaxed">
                        {mode.desc}
                      </p>
                    </div>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>

        {/* Theater (Watch Party) — separate CTA because it needs a
            title prompt before navigation. Hidden behind the same
            sign-up gate as direct calls / hosted rooms. */}
        <div className="mt-4">
          <button
            onClick={handleStartTheater}
            disabled={creatingTheater}
            className="w-full text-left"
          >
            <Card
              padding="lg"
              hover={!isGuest && !creatingTheater}
              className={`${isGuest ? 'opacity-55' : ''} ${creatingTheater ? 'cursor-wait' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`w-10 h-10 shrink-0 rounded-md flex items-center justify-center ${
                    isGuest
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
                      : 'bg-[#1DB954]/15 text-[#1DB954]'
                  }`}
                >
                  {creatingTheater ? <Loader2 size={18} className="animate-spin" /> : isGuest ? <Lock size={16} /> : <Monitor size={18} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--color-fg)]">
                      Theater (Watch Party)
                    </h3>
                    {isGuest
                      ? <Badge tone="warning" size="sm">Sign up to unlock</Badge>
                      : <Badge tone="success" size="sm">New</Badge>}
                  </div>
                  <p className="text-xs text-[var(--color-fg-mute)]">
                    Share one screen with up to 10 friends in real time — live video reactions, mic/cam controls, copyright-friendly disclaimer baked in.
                  </p>
                </div>
              </div>
            </Card>
          </button>
        </div>

        {isGuest && (
          <div className="mt-6 px-4 py-3 rounded-md bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] flex items-start gap-2.5">
            <Sparkles size={14} className="text-[var(--color-accent-fg)] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-[var(--color-fg)] font-medium mb-0.5">Want more?</p>
              <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed">
                Create an account to direct-call specific users, host named rooms, and start
                earning trust toward 18+ access.{' '}
                <button
                  onClick={() => navigate('/register')}
                  className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] underline-offset-2 hover:underline transition-colors font-medium"
                >
                  Sign up free →
                </button>
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 px-4 py-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] flex items-start gap-2.5">
          <ShieldAlert size={14} className="text-[var(--color-fg-faint)] mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed">
            <span className="text-[var(--color-fg)] font-medium">Safety first.</span>{' '}
            Your camera feed is scanned for inappropriate content in your browser. Violations end
            the session and reduce your trust score. CSAM detection is always on.
          </p>
        </div>
      </div>
    </div>
  )
}
