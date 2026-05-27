import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

export default function LandingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const { setAuth }           = useAuthStore()
  const navigate              = useNavigate()

  const handleGuest = async () => {
    setLoading(true); setError('')
    try {
      const res  = await authApi.guest()
      const data = res.data.data
      setAuth({ userId: data.userId, username: data.username, isGuest: true, trustScore: 50, isEmailVerified: false, ageVerified: false }, data.token)
      navigate('/chat')
    } catch { setError('Failed to create session. Try again.') }
    finally { setLoading(false) }
  }

  const features = [
    { icon: '🌐', title: 'Public Rooms',   desc: 'Join themed rooms — gaming, music, tech & more' },
    { icon: '📹', title: 'Video Chat',     desc: 'Random 1:1 video with trust-based matching' },
    { icon: '🛡️', title: 'Trust System',   desc: 'Earn your score. Better score = more access' },
    { icon: '🤖', title: 'AI Moderation', desc: 'OpenAI-powered. Safe by design' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080810', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#fff', overflow: 'hidden', position: 'relative' }}>

      {/* Ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-15%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,57,255,0.2) 0%, transparent 65%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-15%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,200,180,0.15) 0%, transparent 65%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '70px 70px' }} />
      </div>

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, padding: '1.5rem 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #6339ff, #00c8b4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 0 20px rgba(99,57,255,0.4)' }}>💬</div>
          <div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Chat</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, background: 'linear-gradient(90deg, #6339ff, #00c8b4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.03em' }}>Verse</span>
          </div>
          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#00c8b4', border: '1px solid rgba(0,200,180,0.4)', borderRadius: 20, padding: '2px 8px', letterSpacing: '0.08em' }}>BETA</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/login" style={{ padding: '0.5rem 1.2rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>Sign in</Link>
          <Link to="/register" style={{ padding: '0.5rem 1.2rem', borderRadius: 10, background: 'linear-gradient(135deg,#6339ff,#4f2de0)', color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(99,57,255,0.3)' }}>Get started</Link>
        </div>
      </header>

      {/* Hero */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: 700, margin: '0 auto', padding: '6rem 2rem 4rem', textAlign: 'center' }}>

        {/* Status pill */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', padding: '0.4rem 1rem', background: 'rgba(99,57,255,0.1)', border: '1px solid rgba(99,57,255,0.3)', borderRadius: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00c8b4', display: 'inline-block', boxShadow: '0 0 8px #00c8b4' }} />
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Now live — open beta</span>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(2.8rem, 7vw, 4.5rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 1.5rem' }}>
          Real conversations.<br />
          <span style={{ background: 'linear-gradient(90deg, #6339ff 0%, #00c8b4 60%, #ff3c78 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Real people.</span>
        </h1>
        <p style={{ fontSize: '1.15rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 3rem' }}>
          Join thousands in open chat rooms, meet strangers in video, and build your trust score — no pretense.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button onClick={handleGuest} disabled={loading}
            style={{ padding: '0.9rem 2rem', borderRadius: 14, background: 'linear-gradient(135deg,#6339ff,#4f2de0)', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 28px rgba(99,57,255,0.4)', letterSpacing: '-0.01em', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {loading ? '...' : '⚡ Jump in as Guest'}
          </button>
          <Link to="/register"
            style={{ padding: '0.9rem 2rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', textDecoration: 'none', fontSize: '1rem', fontWeight: 600, backdropFilter: 'blur(10px)', letterSpacing: '-0.01em' }}>
            Create account
          </Link>
        </div>
        {error && <p style={{ color: '#ff6b6b', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.75rem' }}>No sign-up needed to try • Free forever</p>

        {/* Features grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '5rem', textAlign: 'left' }}>
          {features.map((f) => (
            <div key={f.title} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, backdropFilter: 'blur(10px)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem' }}>{f.icon}</div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0 0 0.35rem', color: '#fff' }}>{f.title}</p>
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
      `}</style>
    </div>
  )
}
