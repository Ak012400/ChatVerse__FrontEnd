import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'
import GoogleSignInButton from '../../components/auth/GoogleSignInButton'

/**
 * Login page — visual revamp.
 *
 * Layout: aurora-backed dark canvas with a glass-morphism sign-in card.
 * Entrance: card lifts in via `cv-pop`; inner sections stagger via `cv-stagger`.
 * Branding flourishes: animated sparkle accent above the title + an
 * accent-coloured glow ring behind the card. All animations honour
 * `prefers-reduced-motion` (handled by the global utility classes).
 */
export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(form)
      const data = res.data.data
      setAuth(
        {
          userId:          data.userId,
          username:        data.username,
          isGuest:         false,
          trustScore:      data.trustScore,
          isEmailVerified: data.isEmailVerified,
          ageVerified:     data.ageVerified,
        },
        data.token,
      )
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col overflow-hidden">
      {/* ── Aurora backdrop ─────────────────────────────────────────
          Two soft radial gradients drifting slowly behind the content.
          Pure decoration — pointer-events:none so it never blocks clicks. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 18% 22%, rgba(99,102,241,0.22), transparent 55%), ' +
              'radial-gradient(circle at 82% 78%, rgba(236,72,153,0.18), transparent 55%)',
            filter: 'blur(60px)',
            animation: 'cv-aurora-drift 28s ease-in-out infinite',
          }}
        />
        {/* Faint dotted grid for depth. */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--color-line)] backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-fg-faint)] hidden sm:inline">New here?</span>
            <Link
              to="/register"
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-line)] text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-fg)] hover:bg-[var(--color-accent-soft)] transition-all duration-200"
            >
              Create account
              <ArrowRight size={13} className="opacity-70" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm relative">
          {/* Soft accent glow behind the card. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 rounded-3xl opacity-60 blur-2xl"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(99,102,241,0.18), transparent 70%)',
            }}
          />

          {/* Glass card. */}
          <div className="relative cv-pop rounded-2xl border border-[var(--color-line-strong)] bg-[color-mix(in_srgb,var(--color-surface-1)_92%,transparent)] backdrop-blur-xl shadow-2xl p-7">
            {/* Title row with animated sparkle. */}
            <div className="mb-7 cv-stagger">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] border border-[var(--color-line)] text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] mb-3">
                <Sparkles size={11} className="animate-pulse" />
                Sign in
              </div>
              <h1 className="text-2xl font-semibold tracking-tight cv-text-gradient">
                Welcome back
              </h1>
              <p className="text-sm text-[var(--color-fg-dim)] mt-1.5 leading-relaxed">
                Pick up where you left off in your ChatVerse account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 cv-stagger">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                leftIcon={<Mail size={15} />}
              />
              <div>
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  leftIcon={<Lock size={15} />}
                />
                <div className="mt-1.5 text-right">
                  <Link
                    to="/forgot-password"
                    className="text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-accent-fg)] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && (
                <div className="cv-fade-up flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)] text-[var(--color-danger-fg)] text-xs">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                rightIcon={!loading ? <ArrowRight size={15} /> : undefined}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            {/* OR divider */}
            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-line)] to-transparent" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-[var(--color-fg-mute)]">
                or
              </span>
              <span className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-line)] to-transparent" />
            </div>

            {/* Themed Google button (custom dark, hidden Google iframe behind). */}
            <GoogleSignInButton redirectTo="/chat" />

            <p className="mt-6 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors group"
              >
                <span className="inline-block transition-transform group-hover:-translate-x-0.5">←</span>
                Back to home
              </Link>
            </p>
          </div>

          {/* Footer microcopy below the card. */}
          <p className="mt-6 text-center text-[10px] text-[var(--color-fg-mute)] leading-relaxed">
            By signing in you agree to our{' '}
            <Link to="/" className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)] underline underline-offset-2">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/" className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)] underline underline-offset-2">
              Privacy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
