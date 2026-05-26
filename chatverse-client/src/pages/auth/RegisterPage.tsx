import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'

export default function RegisterPage() {
  const [form, setForm]       = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const navigate              = useNavigate()

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
      // OTP sent — go to verify page with email state
      navigate('/verify-otp', { state: { email: form.email } })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <span className="text-4xl">💬</span>
          <h1 className="mt-3 text-2xl font-bold text-white">Create account</h1>
          <p className="mt-1 text-gray-500 text-sm">Join ChatVerse today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'username', label: 'Username', type: 'text',     placeholder: 'CoolUser123' },
            { key: 'email',    label: 'Email',    type: 'email',    placeholder: 'you@example.com' },
            { key: 'password', label: 'Password', type: 'password', placeholder: '8+ characters' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input
                type={type}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800
                           text-white placeholder-gray-600 focus:outline-none
                           focus:border-indigo-500 transition"
                placeholder={placeholder}
              />
            </div>
          ))}

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
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-gray-500 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}
