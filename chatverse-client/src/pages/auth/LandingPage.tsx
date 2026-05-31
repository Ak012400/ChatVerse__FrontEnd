import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Globe, Video, ShieldCheck, Sparkles } from 'lucide-react'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'

export default function LandingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleGuest = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.guest()
      const data = res.data.data
      setAuth(
        {
          userId: data.userId,
          username: data.username,
          isGuest: true,
          trustScore: 50,
          isEmailVerified: false,
          ageVerified: false,
        },
        data.token,
      )
      navigate('/chat')
    } catch {
      setError('Failed to create session. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { Icon: Globe,       title: 'Public rooms',     desc: 'Themed spaces — gaming, music, tech, and more.' },
    { Icon: Video,       title: 'Video chat',       desc: 'Random 1-on-1 video with trust-based matching.' },
    { Icon: ShieldCheck, title: 'Trust system',     desc: 'Earn your score. Better behaviour unlocks more.' },
    { Icon: Sparkles,    title: 'AI moderation',    desc: 'Layered safety on text, images, and video.' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] relative overflow-hidden">
      {/* subtle grid */}
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
      {/* one soft accent glow, low intensity */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(99,102,241,0.25), transparent 70%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo showBeta />
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-sm text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] px-3 py-1.5 rounded-md transition-colors"
            >
              Sign in
            </Link>
            <Link to="/register">
              <Button size="sm" variant="primary" rightIcon={<ArrowRight size={14} />}>
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-8">
            <span className="dot-live" />
            <span className="text-xs text-[var(--color-fg-dim)]">Open beta — live now</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
            Real conversations.
            <br />
            <span className="text-[var(--color-fg-faint)]">Real people.</span>
          </h1>
          <p className="text-base text-[var(--color-fg-dim)] max-w-lg mx-auto mb-10 leading-relaxed">
            Join open chat rooms, meet strangers on video, and build your trust score.
            Moderated by design — no pretense.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-3">
            <Button size="lg" onClick={handleGuest} loading={loading}>
              Jump in as guest
            </Button>
            <Link to="/register">
              <Button size="lg" variant="secondary">
                Create account
              </Button>
            </Link>
          </div>
          {error && (
            <p className="text-xs text-[var(--color-danger)] mt-2">{error}</p>
          )}
          <p className="text-xs text-[var(--color-fg-mute)] mt-3">
            No sign-up needed to try · Free forever
          </p>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {features.map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-lg p-5 hover:border-[var(--color-line-strong)] transition-colors"
              >
                <div className="w-9 h-9 rounded-md bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-accent-fg)] mb-4">
                  <Icon size={16} />
                </div>
                <p className="text-sm font-medium mb-1">{title}</p>
                <p className="text-[13px] text-[var(--color-fg-faint)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-xs text-[var(--color-fg-mute)]">© 2026 ChatVerse</span>
          <div className="flex gap-5 text-xs text-[var(--color-fg-faint)]">
            <span>Public rooms</span>
            <span>Video chat</span>
            <span>Trust system</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
