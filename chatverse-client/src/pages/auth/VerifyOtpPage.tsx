import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Mail, AlertCircle } from 'lucide-react'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'

export default function VerifyOtpPage() {
  const location = useLocation()
  const email = (location.state as any)?.email ?? ''
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = text.split('').concat(['', '', '', '', '', '']).slice(0, 6)
    setOtp(next)
    inputs.current[Math.min(text.length, 5)]?.focus()
    e.preventDefault()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) {
      setError('Enter all 6 digits')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.verifyOtp({ email, code })
      const data = res.data.data
      setAuth(
        {
          userId: data.userId,
          // Backend now returns the canonical username + flags from DB,
          // but fall back to email-prefix if an older API responds.
          username: data.username ?? email.split('@')[0],
          isGuest: false,
          trustScore: data.trustScore ?? 60,
          isEmailVerified: data.isEmailVerified ?? true,
          ageVerified: data.ageVerified ?? false,
        },
        data.token,
      )
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Invalid code')
      setOtp(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      await authApi.resendOtp(email)
      setResent(true)
      setTimeout(() => setResent(false), 30000)
    } catch {
      setError('Failed to resend OTP')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-5">
            <Mail size={20} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-[var(--color-fg-faint)]">
            We sent a 6-digit code to
            <br />
            <span className="text-[var(--color-fg-dim)]">{email || 'your email'}</span>
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-11 h-13 text-center text-lg font-semibold rounded-md
                    bg-[var(--color-surface-1)] border border-[var(--color-line)] text-[var(--color-fg)]
                    focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
                    transition-colors"
                  style={{ height: 52 }}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)] text-[var(--color-danger-fg)] text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? 'Verifying…' : 'Verify email'}
            </Button>
          </form>

          <div className="mt-5 text-xs text-[var(--color-fg-faint)]">
            Didn't receive it?{' '}
            <button
              onClick={handleResend}
              disabled={resent}
              className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] disabled:opacity-50 transition-colors"
            >
              {resent ? 'Code sent — check inbox' : 'Resend code'}
            </button>
          </div>

          <Link
            to="/"
            className="block mt-4 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}
