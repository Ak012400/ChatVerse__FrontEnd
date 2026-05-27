import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

export default function LoginPage() {
  const [form, setForm]         = useState({ email: '', password: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [focused, setFocused]   = useState('')
  const { setAuth }             = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res  = await authApi.login(form)
      const data = res.data.data
      setAuth({ userId: data.userId, username: data.username, isGuest: false, trustScore: data.trustScore, isEmailVerified: data.isEmailVerified, ageVerified: data.ageVerified }, data.token)
      navigate('/chat')
    } catch (err: any) { setError(err.response?.data?.error ?? 'Invalid credentials') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,57,255,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '45vw', height: '45vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <header style={{ position: 'relative', zIndex: 10, padding: '1.5rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6339ff, #00c8b4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 0 20px rgba(99,57,255,0.4)' }}>💬</div>
          <div>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>Chat</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, background: 'linear-gradient(90deg, #6339ff, #00c8b4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.03em' }}>Verse</span>
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>New here?</span>
          <Link to="/register" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6339ff', textDecoration: 'none', padding: '0.4rem 1rem', border: '1px solid rgba(99,57,255,0.4)', borderRadius: 8 }}>Create account →</Link>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', position: 'relative', zIndex: 10 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem', letterSpacing: '-0.03em' }}>Welcome<br /><span style={{ background: 'linear-gradient(90deg, #6339ff, #00c8b4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>back</span></h1>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.95rem', margin: 0 }}>Sign in to your ChatVerse account</p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '2rem', backdropFilter: 'blur(20px)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {[
                { key: 'email',    label: 'Email',    type: 'email',    placeholder: 'you@example.com', icon: '◎' },
                { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••',        icon: '◉' },
              ].map(({ key, label, type, placeholder, icon }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: focused === key ? '#6339ff' : 'rgba(255,255,255,0.5)', marginBottom: '0.4rem', letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'color 0.2s' }}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: focused === key ? '#6339ff' : 'rgba(255,255,255,0.2)', transition: 'color 0.2s', pointerEvents: 'none' }}>{icon}</span>
                    <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} onFocus={() => setFocused(key)} onBlur={() => setFocused('')} required placeholder={placeholder}
                      style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '2.6rem', paddingRight: '1rem', paddingTop: '0.85rem', paddingBottom: '0.85rem', background: focused === key ? 'rgba(99,57,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${focused === key ? 'rgba(99,57,255,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit', boxShadow: focused === key ? '0 0 0 3px rgba(99,57,255,0.1)' : 'none' }} />
                  </div>
                </div>
              ))}

              {error && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.25)', borderRadius: 10, color: '#ff6b6b', fontSize: '0.85rem' }}>⚠ {error}</div>}

              <button type="submit" disabled={loading}
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.9rem', background: loading ? 'rgba(99,57,255,0.5)' : 'linear-gradient(135deg, #6339ff 0%, #4f2de0 100%)', border: 'none', borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 24px rgba(99,57,255,0.35)', transition: 'all 0.2s', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {loading ? <><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />Signing in...</> : 'Sign in →'}
              </button>
            </form>
          </div>

          <p style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>← Back to home</Link>
          </p>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to{transform:rotate(360deg)} }
        input::placeholder { color: rgba(255,255,255,0.18); }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0d0d1a inset !important; -webkit-text-fill-color: #fff !important; }
      `}</style>
    </div>
  )
}