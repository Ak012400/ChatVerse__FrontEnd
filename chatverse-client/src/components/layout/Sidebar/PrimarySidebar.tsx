import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare, Video, LogOut, Settings, ShieldCheck, CreditCard, Mail, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useUiStore } from '../../../stores/uiStore'
import { authApi } from '../../../api/auth'
import { adminApi } from '../../../api'
import IconButton from '../../ui/IconButton'
import Avatar from '../../ui/Avatar'

type Tab = 'chat' | 'video'

interface Props {
  activeTab: Tab
  setActiveTab: (t: Tab) => void
}

export default function PrimarySidebar({ activeTab, setActiveTab }: Props) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const [isAdmin, setIsAdmin] = useState(false)

  /* Probe admin status once on mount. Skip for guests — admin allow-list
   * is server-side and only enforces for registered users. */
  useEffect(() => {
    if (!user || user.isGuest) return
    let cancelled = false
    adminApi
      .whoami()
      .then((r) => { if (!cancelled) setIsAdmin(!!r.data.data?.isAdmin) })
      .catch(() => { /* not admin */ })
    return () => { cancelled = true }
  }, [user])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    clearAuth()
    navigate('/')
  }

  const navTo = (tab: Tab) => {
    setActiveTab(tab)
    navigate(tab === 'chat' ? '/chat' : '/video')
  }

  return (
    <aside className="w-14 shrink-0 h-screen bg-[var(--color-bg)] border-r border-[var(--color-line)] flex flex-col items-center py-3">
      <button
        onClick={() => navigate('/chat')}
        className="w-9 h-9 rounded-md flex items-center justify-center text-white mb-4 focus-ring"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        aria-label="ChatVerse home"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      <nav className="flex flex-col items-center gap-1 flex-1">
        <IconButton variant="ghost" active={activeTab === 'chat'} onClick={() => navTo('chat')} aria-label="Chat">
          <MessagesSquare size={18} />
        </IconButton>
        <IconButton variant="ghost" active={activeTab === 'video'} onClick={() => navTo('video')} aria-label="Video">
          <Video size={18} />
        </IconButton>
        {!user?.isGuest && (
          <IconButton variant="ghost" onClick={() => navigate('/dms')} aria-label="Direct messages">
            <Mail size={18} />
          </IconButton>
        )}
      </nav>

      <div className="flex flex-col items-center gap-2 pb-1">
        {!user?.isGuest && (
          <IconButton variant="ghost" onClick={() => navigate('/pricing')} aria-label="Upgrade">
            <CreditCard size={18} />
          </IconButton>
        )}
        {isAdmin && (
          <IconButton variant="ghost" onClick={() => navigate('/admin')} aria-label="Admin dashboard">
            <ShieldCheck size={18} />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <IconButton variant="ghost" aria-label="Settings" onClick={() => navigate('/profile')}>
          <Settings size={18} />
        </IconButton>
        <button onClick={() => navigate('/profile')} className="focus-ring rounded-full" aria-label="Your profile">
          <Avatar size="sm" name={user?.username ?? 'U'} />
        </button>
        <IconButton variant="ghost" onClick={handleLogout} aria-label="Sign out">
          <LogOut size={16} />
        </IconButton>
      </div>
    </aside>
  )
}
