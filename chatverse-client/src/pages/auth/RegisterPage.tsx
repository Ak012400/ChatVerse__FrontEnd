import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'

export default function RegisterPage() {
  const [form, setForm]       = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [focused, setFocused] = useState('')
  const navigate              = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      await authApi.register(form)
      navigate('/verify-otp', { state: { email: form.email } })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed')
    } finally { setLoading(false) }
  }

  const fields = [
    { key: 'username', label: 'Username',  type: 'text',     placeholder: 'CoolUser123',       icon: '◈' },
    { key: 'email',    label: 'Email',     type: 'email',    placeholder: 'you@example.com',    icon: '◎' },
    { key: 'password', label: 'Password',  type: 'password', placeholder: 'Min. 8 characters',  icon: '◉' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden', position: 'relative' }}>

      {/* Ambient background blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,57,255,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '45vw', height: '45vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', top: '40%', left: '30%', width: '30vw', height: '30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,60,120,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        {/* Grid overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      {/* ── HEADER ── */}
      <header style={{ position: 'relative', zIndex: 10, padding: '1.5rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
          {/* Logo mark */}
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6339ff, #00c8b4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 0 20px rgba(99,57,255,0.4)' }}>
            💬
          </div>
          <div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Chat</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(90deg, #6339ff, #00c8b4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>Verse</span>
          </div>
          {/* Beta pill */}
          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#00c8b4', border: '1px solid rgba(0,200,180,0.4)', borderRadius: 20, padding: '2px 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Beta</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>Already a member?</span>
          <Link to="/login" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6339ff', textDecoration: 'none', padding: '0.4rem 1rem', border: '1px solid rgba(99,57,255,0.4)', borderRadius: 8, transition: 'all 0.2s' }}>
            Sign in →
          </Link>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 1.5rem', position: 'relative', zIndex: 10 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Heading */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.35rem 0.9rem', background: 'rgba(99,57,255,0.12)', border: '1px solid rgba(99,57,255,0.25)', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6339ff', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>Join for free</span>
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Create your<br />
              <span style={{ background: 'linear-gradient(90deg, #6339ff 0%, #00c8b4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>account</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.95rem', margin: 0 }}>
              Chat, connect, and explore public rooms — free forever
            </p>
          </div>

          {/* Form card */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '2rem', backdropFilter: 'blur(20px)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

              {fields.map(({ key, label, type, placeholder, icon }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: focused === key ? '#6339ff' : 'rgba(255,255,255,0.5)', marginBottom: '0.4rem', letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'color 0.2s' }}>
                    {label}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: focused === key ? '#6339ff' : 'rgba(255,255,255,0.2)', fontSize: '1rem', transition: 'color 0.2s', pointerEvents: 'none' }}>
                      {icon}
                    </span>
                    <input
                      type={type}
                      value={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      onFocus={() => setFocused(key)}
                      onBlur={() => setFocused('')}
                      required
                      placeholder={placeholder}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        paddingLeft: '2.6rem', paddingRight: '1rem', paddingTop: '0.85rem', paddingBottom: '0.85rem',
                        background: focused === key ? 'rgba(99,57,255,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${focused === key ? 'rgba(99,57,255,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 12, color: '#fff', fontSize: '0.95rem',
                        outline: 'none', transition: 'all 0.2s',
                        fontFamily: 'inherit',
                        boxShadow: focused === key ? '0 0 0 3px rgba(99,57,255,0.1)' : 'none'
                      }}
                    />
                  </div>
                </div>
              ))}

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.25)', borderRadius: 10, color: '#ff6b6b', fontSize: '0.85rem' }}>
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: '0.5rem',
                  width: '100%', padding: '0.9rem',
                  background: loading ? 'rgba(99,57,255,0.5)' : 'linear-gradient(135deg, #6339ff 0%, #4f2de0 100%)',
                  border: 'none', borderRadius: 12,
                  color: '#fff', fontSize: '1rem', fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '-0.01em',
                  boxShadow: '0 4px 24px rgba(99,57,255,0.35)',
                  transition: 'all 0.2s', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}
              >
                {loading ? (
                  <>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    Creating account...
                  </>
                ) : 'Create account →'}
              </button>
            </form>
          </div>

          {/* Terms */}
          <p style={{ marginTop: '1.2rem', textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
            By signing up, you agree to our{' '}
            <span style={{ color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>Terms of Service</span>
            {' '}and{' '}
            <span style={{ color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>Privacy Policy</span>
          </p>

        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ position: 'relative', zIndex: 10, padding: '1.2rem 2.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.15)' }}>© 2026 ChatVerse</span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {['Public Rooms', 'Video Chat', 'Trust System'].map((f) => (
            <span key={f} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>{f}</span>
          ))}
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        input::placeholder { color: rgba(255,255,255,0.18); }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0d0d1a inset !important; -webkit-text-fill-color: #fff !important; }
      `}</style>
    </div>
  )
}