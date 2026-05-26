import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

export default function LandingPage() {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const { setAuth }             = useAuthStore()
  const navigate                = useNavigate()

  const handleGuest = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await authApi.guest()
      const data = res.data.data
      setAuth({
        userId:          data.userId,
        username:        data.username,
        isGuest:         true,
        trustScore:      50,
        isEmailVerified: false,
        ageVerified:     false,
      }, data.token)
      navigate('/chat')
    } catch {
      setError('Failed to create guest session. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">

      {/* Logo */}
      <div className="mb-8 text-center">
        <span className="text-5xl">💬</span>
        <h1 className="mt-4 text-4xl font-bold text-white">ChatVerse</h1>
        <p className="mt-2 text-gray-400 text-lg">
          Real conversations. Real people.
        </p>
      </div>

      {/* CTA Cards */}
      <div className="w-full max-w-sm space-y-3">

        {/* Guest */}
        <button
          onClick={handleGuest}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500
                     text-white font-semibold text-lg transition disabled:opacity-50"
        >
          {loading ? 'Joining...' : '⚡ Join as Guest'}
        </button>

        {/* Register */}
        <Link
          to="/register"
          className="block w-full py-4 rounded-xl border border-gray-700
                     text-white font-semibold text-lg text-center
                     hover:border-indigo-500 hover:bg-gray-900 transition"
        >
          Create Account
        </Link>

        {/* Login */}
        <Link
          to="/login"
          className="block w-full py-4 rounded-xl text-gray-400
                     font-medium text-lg text-center hover:text-white transition"
        >
          Already have an account? Sign in
        </Link>

      </div>

      {error && (
        <p className="mt-4 text-red-400 text-sm">{error}</p>
      )}

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-6 text-center max-w-sm">
        {[
          { icon: '🌐', label: 'Public Rooms' },
          { icon: '📹', label: 'Video Chat' },
          { icon: '🛡️', label: 'Trust System' },
        ].map((f) => (
          <div key={f.label}>
            <div className="text-2xl">{f.icon}</div>
            <p className="mt-1 text-xs text-gray-500">{f.label}</p>
          </div>
        ))}
      </div>

    </div>
  )
}
