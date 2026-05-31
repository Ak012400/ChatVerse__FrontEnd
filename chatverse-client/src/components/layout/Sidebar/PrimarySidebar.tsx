import { useNavigate } from 'react-router-dom'
import { MessagesSquare, Video, LogOut, Settings } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { authApi } from '../../../api/auth'
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
      {/* Logo mark */}
      <button
        onClick={() => navigate('/chat')}
        className="w-9 h-9 rounded-md flex items-center justify-center text-white mb-4 focus-ring"
        style={{
          background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)',
        }}
        aria-label="ChatVerse home"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      <nav className="flex flex-col items-center gap-1 flex-1">
        <IconButton
          variant="ghost"
          active={activeTab === 'chat'}
          onClick={() => navTo('chat')}
          aria-label="Chat"
        >
          <MessagesSquare size={18} />
        </IconButton>
        <IconButton
          variant="ghost"
          active={activeTab === 'video'}
          onClick={() => navTo('video')}
          aria-label="Video"
        >
          <Video size={18} />
        </IconButton>
      </nav>

      {/* Bottom: settings + avatar/logout */}
      <div className="flex flex-col items-center gap-2 pb-1">
        <IconButton variant="ghost" aria-label="Settings">
          <Settings size={18} />
        </IconButton>
        <button
          onClick={() => navigate('/profile')}
          className="focus-ring rounded-full"
          aria-label="Your profile"
        >
          <Avatar size="sm" name={user?.username ?? 'U'} />
        </button>
        <IconButton variant="ghost" onClick={handleLogout} aria-label="Sign out">
          <LogOut size={16} />
        </IconButton>
      </div>
    </aside>
  )
}
