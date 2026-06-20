import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessagesSquare, Video, LogOut, Settings, ShieldCheck, CreditCard, Mail, Sun, Moon, Gamepad2, Hourglass, HelpCircle, Sparkles, Feather, MessageSquare, Heart, Users } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useUiStore } from '../../../stores/uiStore'
import { useTimeCapsuleStore } from '../../../stores/timeCapsuleStore'
import { authApi } from '../../../api/auth'
import { adminApi } from '../../../api'
import IconButton from '../../ui/IconButton'
import Avatar from '../../ui/Avatar'
import NotificationBell from '../NotificationBell'

type Tab = 'chat' | 'video'

interface Props {
  activeTab: Tab
  setActiveTab: (t: Tab) => void
}

export default function PrimarySidebar({ activeTab, setActiveTab }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, clearAuth } = useAuthStore()
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const [isAdmin, setIsAdmin] = useState(false)

  // Each nav icon's "selected" state is computed from the current route,
  // not just the parent's activeTab — so the DMs / pricing / admin /
  // profile icons also get the prominent accent when the user is on
  // those routes (was previously dim regardless).
  const onChat    = pathname.startsWith('/chat')
  const onVideo   = pathname.startsWith('/video')
  const onGames   = pathname.startsWith('/games')
  const onDms     = pathname.startsWith('/dms')
  const onCapsule = pathname.startsWith('/time-capsule')
  const onPersona = pathname.startsWith('/persona')
  const onStory   = pathname.startsWith('/story-chain')
  const onConfess = pathname.startsWith('/confessions')
  const onGhostD  = pathname.startsWith('/ghost-date')
  const onLoveT   = pathname.startsWith('/love-triangle')
  const onAbout   = pathname.startsWith('/about')
  const onPricing = pathname.startsWith('/pricing')
  const onAdmin   = pathname.startsWith('/admin')
  const onProfile = pathname.startsWith('/profile')

  // Unread time-capsule badge — bumped by the hub when a new capsule
  // lands, cleared the moment the user opens /time-capsule.
  const capsuleUnread = useTimeCapsuleStore((s) => s.unread)

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
    <aside className="hidden sm:flex w-14 shrink-0 h-screen bg-[var(--color-bg)] border-r border-[var(--color-line)] flex-col items-center py-3">
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
        <IconButton variant="ghost" active={onChat || activeTab === 'chat'} onClick={() => navTo('chat')} aria-label="Chat" title="Chat">
          <MessagesSquare size={18} />
        </IconButton>
        <IconButton variant="ghost" active={onVideo || activeTab === 'video'} onClick={() => navTo('video')} aria-label="Video" title="Video">
          <Video size={18} />
        </IconButton>
        {/* Standalone Gaming Hall icon intentionally hidden.
            Games are now launched from inside themed chat rooms
            (Gaming Lounge / Mini Game) via the "Start a game" header
            button. The /games route still works for direct-link
            invites — we just don't surface it in the navigation.
            Re-enable this block if a top-level entry is ever wanted. */}
        {false && !user?.isGuest && (
          <IconButton variant="ghost" active={onGames} onClick={() => navigate('/games')} aria-label="Gaming Hall" title="Gaming Hall">
            <Gamepad2 size={18} />
          </IconButton>
        )}
        {!user?.isGuest && (
          <IconButton variant="ghost" active={onDms} onClick={() => navigate('/dms')} aria-label="Direct messages" title="Direct messages">
            <Mail size={18} />
          </IconButton>
        )}
        {/* Persona Roulette — registered users only. Same recipient-
            pool argument as Time Capsule. */}
        {!user?.isGuest && (
          <IconButton
            variant="ghost"
            active={onPersona}
            onClick={() => navigate('/persona')}
            aria-label="Persona Roulette"
            title="Persona Roulette"
          >
            <Sparkles size={18} />
          </IconButton>
        )}
        {/* Story Chain — daily collaborative writing. Registered only
            so the one-sentence-per-user guard isn't trivial to bypass. */}
        {!user?.isGuest && (
          <IconButton
            variant="ghost"
            active={onStory}
            onClick={() => navigate('/story-chain')}
            aria-label="Story Chain"
            title="Story Chain"
          >
            <Feather size={18} />
          </IconButton>
        )}
        {/* Confession Box — anonymous daily confessions + reveal mechanic. */}
        {!user?.isGuest && (
          <IconButton
            variant="ghost"
            active={onConfess}
            onClick={() => navigate('/confessions')}
            aria-label="Confession Box"
            title="Confession Box"
          >
            <MessageSquare size={18} />
          </IconButton>
        )}
        {/* Ghost Date — Thursday 9pm IST anonymous text date. */}
        {!user?.isGuest && (
          <IconButton
            variant="ghost"
            active={onGhostD}
            onClick={() => navigate('/ghost-date')}
            aria-label="Ghost Date"
            title="Ghost Date"
          >
            <Heart size={18} />
          </IconButton>
        )}
        {/* Love Triangle — Sunday 10pm IST 3-person weekly drama. */}
        {!user?.isGuest && (
          <IconButton
            variant="ghost"
            active={onLoveT}
            onClick={() => navigate('/love-triangle')}
            aria-label="Love Triangle"
            title="Love Triangle"
          >
            <Users size={18} />
          </IconButton>
        )}
        {/* Time Capsule — registered users only. Guests can't be
            a stable recipient pool so the feature would orphan
            their incoming capsules at 24h expiry. */}
        {!user?.isGuest && (
          <div className="relative">
            <IconButton
              variant="ghost"
              active={onCapsule}
              onClick={() => navigate('/time-capsule')}
              aria-label="Time Capsule"
              title="Time Capsule"
            >
              <Hourglass size={18} />
            </IconButton>
            {capsuleUnread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
                  bg-[var(--color-accent)] text-[10px] font-semibold text-white
                  inline-flex items-center justify-center pointer-events-none"
                aria-label={`${capsuleUnread} new time capsules`}
              >
                {capsuleUnread > 9 ? '9+' : capsuleUnread}
              </span>
            )}
          </div>
        )}
      </nav>

      <div className="flex flex-col items-center gap-2 pb-1">
        {/* Notifications inbox — sits at the top of the lower group so
            the unread badge is one of the first things users see. The
            bell renders its own dropdown anchored to its position. */}
        {!user?.isGuest && <NotificationBell />}
        {/* "How it works" — full feature rules page. Available to
            everyone logged in, including guests, so they can learn
            what they\'d unlock by registering. */}
        <IconButton
          variant="ghost"
          active={onAbout}
          onClick={() => navigate('/about')}
          aria-label="How it works"
          title="How it works"
        >
          <HelpCircle size={18} />
        </IconButton>
        {!user?.isGuest && (
          <IconButton variant="ghost" active={onPricing} onClick={() => navigate('/pricing')} aria-label="Upgrade" title="Upgrade">
            <CreditCard size={18} />
          </IconButton>
        )}
        {isAdmin && (
          <IconButton variant="ghost" active={onAdmin} onClick={() => navigate('/admin')} aria-label="Admin dashboard" title="Admin">
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
        <IconButton variant="ghost" active={onProfile} aria-label="Settings" title="Settings" onClick={() => navigate('/profile')}>
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
