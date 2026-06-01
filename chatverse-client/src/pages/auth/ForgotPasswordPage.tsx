import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { authApi } from '../../api/auth'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Enter your email.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
      // We don't auto-redirect because we want the user to see the
      // confirmation before they go enter the code — privacy-friendly:
      // the screen says the same thing whether or not the email exists.
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not send the email. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
        <header className="border-b border-[var(--color-line)]">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
            <Logo />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-success-soft)] border border-[rgba(34,197,94,0.3)] text-[#86efac] mb-5">
              <CheckCircle2 size={20} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Check your email</h1>
            <p className="text-sm text-[var(--color-fg-faint)] mb-6 leading-relaxed">
              If an account exists for <span className="text-[var(--color-fg-dim)]">{email}</span>,
              we've sent a 6-digit reset code. It's valid for 15 minutes.
            </p>
            <Button
              fullWidth
              size="lg"
              rightIcon={<ArrowRight size={15} />}
              onClick={() => navigate('/reset-password', { state: { email } })}
            >
              Enter the code
            </Button>
            <Link
              to="/login"
              className="block mt-4 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Forgot your password?</h1>
            <p className="text-sm text-[var(--color-fg-faint)]">
              Enter your email and we'll send you a reset code.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail size={15} />}
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
              {loading ? 'Sending…' : 'Send reset code'}
            </Button>
          </form>

          <p className="mt-6 text-center">
            <Link
              to="/login"
              className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              ← Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
