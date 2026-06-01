import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'

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
          userId: data.userId,
          username: data.username,
          isGuest: false,
          trustScore: data.trustScore,
          isEmailVerified: data.isEmailVerified,
          ageVerified: data.ageVerified,
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
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-fg-faint)]">New here?</span>
            <Link
              to="/register"
              className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] transition-colors"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Welcome back</h1>
            <p className="text-sm text-[var(--color-fg-faint)]">Sign in to your ChatVerse account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link
              to="/"
              className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
