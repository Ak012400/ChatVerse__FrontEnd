import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react'
import { authApi } from '../../api/auth'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'
import GoogleSignInButton from '../../components/auth/GoogleSignInButton'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await authApi.register(form)
      navigate('/verify-otp', { state: { email: form.email } })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo showBeta />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-fg-faint)]">Already a member?</span>
            <Link
              to="/login"
              className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Create your account</h1>
            <p className="text-sm text-[var(--color-fg-faint)]">
              Chat, connect, and explore public rooms — free forever.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              type="text"
              autoComplete="username"
              required
              placeholder="Your unique handle"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              leftIcon={<User size={15} />}
            />
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
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              leftIcon={<Lock size={15} />}
              hint="Use 8+ characters with a mix of letters and numbers."
            />

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
                <AlertCircle size={14} />
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
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          {/* OR divider + Google sign-up. Backend's /api/auth/google
              upserts — so the same button works for both flows. */}
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="flex-1 h-px bg-[var(--color-line)]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)]">or</span>
            <span className="flex-1 h-px bg-[var(--color-line)]" />
          </div>
          <GoogleSignInButton redirectTo="/chat" />

          <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--color-fg-mute)]">
            By signing up, you agree to our{' '}
            <span className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)] cursor-pointer">
              Terms of Service
            </span>{' '}
            and{' '}
            <span className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)] cursor-pointer">
              Privacy Policy
            </span>
            .
          </p>
        </div>
      </main>

      <footer className="border-t border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs text-[var(--color-fg-mute)]">
          <span>© 2026 ChatVerse</span>
          <Link to="/" className="hover:text-[var(--color-fg-dim)] transition-colors">
            ← Back to home
          </Link>
        </div>
      </footer>
    </div>
  )
}
