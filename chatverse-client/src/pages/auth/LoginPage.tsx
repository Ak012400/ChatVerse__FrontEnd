import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

export default function LoginPage() {
  const [form, setForm]         = useState({ email: '', password: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const { setAuth }             = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res  = await authApi.login(form)
      const data = res.data.data
      setAuth({
        userId:          data.userId,
        username:        data.username,
        isGuest:         false,
        trustScore:      data.trustScore,
        isEmailVerified: data.isEmailVerified,
        ageVerified:     data.ageVerified,
      }, data.token)
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <span className="text-4xl">💬</span>
          <h1 className="mt-3 text-2xl font-bold text-white">Welcome back</h1>
          <p className="mt-1 text-gray-500 text-sm">Sign in to ChatVerse</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800
                         text-white placeholder-gray-600 focus:outline-none
                         focus:border-indigo-500 transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800
                         text-white placeholder-gray-600 focus:outline-none
                         focus:border-indigo-500 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-900/30 border border-red-800 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       text-white font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-gray-500 text-sm">
          No account?{' '}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300">
            Create one
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link to="/" className="text-gray-600 text-sm hover:text-gray-400">
            ← Back
          </Link>
        </p>

      </div>
    </div>
  )
}
