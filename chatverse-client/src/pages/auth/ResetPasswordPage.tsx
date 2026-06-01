import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail, AlertCircle, CheckCircle2 } from 'lucide-react'
import { authApi } from '../../api/auth'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const presetEmail = (location.state as any)?.email ?? ''

  const [email, setEmail] = useState(presetEmail)
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (presetEmail) inputs.current[0]?.focus()
  }, [presetEmail])

  const handleCodeChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...code]
    next[i] = val.slice(-1)
    setCode(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleCodeKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    const next = text.split('').concat(['', '', '', '', '', '']).slice(0, 6)
    setCode(next)
    inputs.current[Math.min(text.length, 5)]?.focus()
    e.preventDefault()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const codeStr = code.join('')
    if (!email) {
      setError('Enter your email.')
      return
    }
    if (codeStr.length < 6) {
      setError('Enter all 6 digits of the reset code.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await authApi.resetPassword({ email, code: codeStr, newPassword })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not reset your password.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
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
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Password updated</h1>
            <p className="text-sm text-[var(--color-fg-faint)] mb-6">
              Your password has been reset. Sign in with the new one.
            </p>
            <Button fullWidth size="lg" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
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
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Reset your password</h1>
            <p className="text-sm text-[var(--color-fg-faint)]">
              Paste the 6-digit code from your email, then pick a new password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!presetEmail && (
              <Input
                label="Email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail size={15} />}
              />
            )}

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-1.5">
                Reset code
              </p>
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputs.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-11 h-13 text-center text-lg font-semibold rounded-md
                      bg-[var(--color-surface-1)] border border-[var(--color-line)] text-[var(--color-fg)]
                      focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
                      transition-colors"
                    style={{ height: 52 }}
                  />
                ))}
              </div>
            </div>

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftIcon={<Lock size={15} />}
              hint="Use 8+ characters with a mix of letters and numbers."
            />

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? 'Updating…' : 'Set new password'}
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
