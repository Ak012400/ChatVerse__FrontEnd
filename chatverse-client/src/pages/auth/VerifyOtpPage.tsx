import { useState, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

export default function VerifyOtpPage() {
  const location            = useLocation()
  const email               = (location.state as any)?.email ?? ''
  const [otp, setOtp]       = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [resent, setResent] = useState(false)
  const inputs              = useRef<(HTMLInputElement | null)[]>([])
  const { setAuth }         = useAuthStore()
  const navigate            = useNavigate()

  const handleChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0)
      inputs.current[i - 1]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    setLoading(true)
    setError('')
    try {
      const res  = await authApi.verifyOtp({ email, code })
      const data = res.data.data
      setAuth({
        userId:          data.userId,
        username:        email.split('@')[0],
        isGuest:         false,
        trustScore:      60,
        isEmailVerified: true,
        ageVerified:     false,
      }, data.token)
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Invalid OTP')
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">

        <span className="text-4xl">📧</span>
        <h1 className="mt-3 text-2xl font-bold text-white">Check your email</h1>
        <p className="mt-2 text-gray-500 text-sm">
          We sent a 6-digit code to<br />
          <span className="text-indigo-400">{email}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          {/* OTP inputs */}
          <div className="flex gap-2 justify-center">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl
                           bg-gray-900 border border-gray-800 text-white
                           focus:outline-none focus:border-indigo-500 transition"
              />
            ))}
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-800 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       text-white font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-500">
          Didn't get it?{' '}
          <button
            onClick={handleResend}
            disabled={resent}
            className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {resent ? 'Sent! Check inbox' : 'Resend code'}
          </button>
        </div>

        <Link to="/" className="block mt-4 text-gray-600 text-sm hover:text-gray-400">
          ← Back to home
        </Link>

      </div>
    </div>
  )
}
