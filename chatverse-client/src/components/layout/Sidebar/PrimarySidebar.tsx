import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessagesSquare, Video, LogOut, Settings, ShieldCheck, CreditCard, Mail,
  Sun, Moon, Hourglass, HelpCircle, Sparkles, Feather, MessageSquare,
  Heart, Users, Key, Theater, Mic, type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useUiStore, type FeatureIconId } from '../../../stores/uiStore'
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

// ─── Feature icon catalogue ─────────────────────────────────
//   Source of truth for what each feature icon renders + where it
//   navigates. Keep keys in sync with FeatureIconId in uiStore so
//   localStorage doesn't get orphaned ids.
//
//   `guest: false` hides the icon from guest accounts entirely
//   (the matching feature pages also reject guest access at the
//   route guard). Add a new feature = add an entry here + the id
//   to DEFAULT_FEATURE_ORDER + a route in App.tsx.

interface FeatureIconDef {
  id:        FeatureIconId
  icon:      LucideIcon
  label:     string
  path:      string
  matches:   (pathname: string) => boolean
  guest:     boolean        // visible to guest accounts?
}

const FEATURE_CATALOGUE: Record<FeatureIconId, FeatureIconDef> = {
  chat: {
    id: 'chat',  icon: MessagesSquare, label: 'Chat', path: '/chat',
    matches: (p) => p.startsWith('/chat'), guest: true,
  },
  video: {
    id: 'video', icon: Video,           label: 'Video', path: '/video',
    matches: (p) => p.startsWith('/video'), guest: true,
  },
  dms: {
    id: 'dms',   icon: Mail,            label: 'Direct messages', path: '/dms',
    matches: (p) => p.startsWith('/dms'), guest: false,
  },
  persona: {
    id: 'persona', icon: Sparkles,      label: 'Persona Roulette', path: '/persona',
    matches: (p) => p.startsWith('/persona'), guest: false,
  },
  'time-capsule': {
    id: 'time-capsule', icon: Hourglass, label: 'Time Capsule', path: '/time-capsule',
    matches: (p) => p.startsWith('/time-capsule'), guest: false,
  },
  'story-chain': {
    id: 'story-chain', icon: Feather,    label: 'Story Chain', path: '/story-chain',
    matches: (p) => p.startsWith('/story-chain'), guest: false,
  },
  confessions: {
    id: 'confessions', icon: MessageSquare, label: 'Confession Box', path: '/confessions',
    matches: (p) => p.startsWith('/confessions'), guest: false,
  },
  'ghost-date': {
    id: 'ghost-date', icon: Heart,       label: 'Ghost Date', path: '/ghost-date',
    matches: (p) => p.startsWith('/ghost-date'), guest: false,
  },
  'love-triangle': {
    id: 'love-triangle', icon: Users,    label: 'Love Triangle', path: '/love-triangle',
    matches: (p) => p.startsWith('/love-triangle'), guest: false,
  },
  cipher: {
    id: 'cipher', icon: Key,             label: 'The Cipher', path: '/cipher',
    matches: (p) => p.startsWith('/cipher'), guest: false,
  },
  'pyaar-live': {
    id: 'pyaar-live', icon: Theater,     label: 'PYAAR LIVE', path: '/pyaar-live',
    matches: (p) => p.startsWith('/pyaar-live'), guest: false,
  },
  mehfil: {
    id: 'mehfil',     icon: Mic,         label: 'Mehfil', path: '/mehfil',
    matches: (p) => p.startsWith('/mehfil'), guest: false,
  },
}

export default function PrimarySidebar({ activeTab, setActiveTab }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, clearAuth } = useAuthStore()
  const theme        = useUiStore((s) => s.theme)
  const toggleTheme  = useUiStore((s) => s.toggleTheme)
  const featureOrder = useUiStore((s) => s.featureOrder)
  const moveFeature  = useUiStore((s) => s.moveFeature)
  const capsuleUnread = useTimeCapsuleStore((s) => s.unread)
  const [isAdmin, setIsAdmin] = useState(false)

  // Drag state for HTML5 drag-and-drop reordering. We keep it local
  // (not in the store) — the persisted result lands in featureOrder
  // only on drop. `dragging` is the feature being held; `hoverIndex`
  // is the destination slot we'd commit to right now.
  const [dragging, setDragging]     = useState<FeatureIconId | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // Non-feature route highlights (settings/admin/profile/etc.).
  const onAbout   = pathname.startsWith('/about')
  const onPricing = pathname.startsWith('/pricing')
  const onAdmin   = pathname.startsWith('/admin')
  const onProfile = pathname.startsWith('/profile')

  /* Admin allow-list probe — skip for guests. */
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

  // Filter the persisted order to features the current user can see.
  const visibleFeatures = useMemo(() => {
    const seen = new Set<FeatureIconId>()
    const result: FeatureIconDef[] = []
    for (const id of featureOrder) {
      if (seen.has(id)) continue
      seen.add(id)
      const def = FEATURE_CATALOGUE[id]
      if (!def) continue
      if (!def.guest && user?.isGuest) continue
      result.push(def)
    }
    return result
  }, [featureOrder, user?.isGuest])

  return (
    <aside className="hidden sm:flex w-14 shrink-0 h-screen bg-[var(--color-bg)] border-r border-[var(--color-line)] flex-col items-center py-3">
      {/* Brand */}
      <button
        onClick={() => navigate('/chat')}
        className="w-9 h-9 rounded-md flex items-center justify-center text-white mb-4 focus-ring cv-press"
        style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)' }}
        aria-label="ChatVerse home"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* ── Feature group ─────────────────────────────────────
          Reorderable via drag-and-drop. The drop indicator is a
          1-pixel accent line between icons. */}
      <nav
        className="flex flex-col items-center gap-1 flex-1 w-full overflow-y-auto px-1 scrollbar-thin"
        aria-label="Feature navigation"
      >
        {visibleFeatures.map((feat, index) => {
          const isActive = feat.matches(pathname)
          const isTab    = feat.id === 'chat' || feat.id === 'video'
          const isDragging = dragging === feat.id
          // Highlight insertion gap above this icon when hovered.
          const showDropAbove = hoverIndex === index && dragging && dragging !== feat.id

          return (
            <div key={feat.id} className="w-full flex flex-col items-center">
              {showDropAbove && <DropIndicator />}
              <FeatureIconButton
                feat={feat}
                active={isActive || (isTab && activeTab === feat.id)}
                navigate={navigate}
                setActiveTab={setActiveTab}
                isTab={isTab}
                isDragging={isDragging}
                badge={feat.id === 'time-capsule' ? capsuleUnread : undefined}
                onDragStart={() => { setDragging(feat.id); setHoverIndex(null) }}
                onDragOverSlot={() => setHoverIndex(index)}
                onDragEnd={() => { setDragging(null); setHoverIndex(null) }}
                onDrop={() => {
                  if (dragging && hoverIndex !== null) {
                    moveFeature(dragging, hoverIndex)
                  }
                  setDragging(null); setHoverIndex(null)
                }}
              />
            </div>
          )
        })}
        {/* Trailing drop slot — drop AT THE END. */}
        <div
          className="w-full"
          onDragOver={(e) => { e.preventDefault(); setHoverIndex(visibleFeatures.length) }}
        >
          {hoverIndex === visibleFeatures.length && dragging && <DropIndicator />}
        </div>
      </nav>

      {/* ── Visual separator between feature group and utility group.
          Padding + a 1px line make it read as a distinct section so
          the bell + settings don't feel like "just another feature". */}
      <div className="w-8 my-3 border-t border-[var(--color-line-strong)] opacity-70" aria-hidden="true" />

      {/* ── Utility group ──────────────────────────────────────
          Notifications, billing, admin, theme, profile, logout.
          Fixed order — not reorderable. */}
      <div className="flex flex-col items-center gap-2 pb-1">
        {!user?.isGuest && <NotificationBell />}

        {/* How-it-works — open to everyone signed in, including
            guests, so they can preview what they\'d unlock. */}
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
        <button onClick={() => navigate('/profile')} className="focus-ring rounded-full cv-press" aria-label="Your profile">
          <Avatar size="sm" name={user?.username ?? 'U'} />
        </button>
        <IconButton variant="ghost" onClick={handleLogout} aria-label="Sign out">
          <LogOut size={16} />
        </IconButton>
      </div>
    </aside>
  )
}

// ─── Subcomponents ──────────────────────────────────────────

function DropIndicator() {
  return (
    <div
      className="w-7 h-0.5 my-0.5 rounded-full bg-[var(--color-accent)]"
      style={{ animation: 'cv-pop 180ms var(--ease-spring) both' }}
      aria-hidden="true"
    />
  )
}

interface FeatureIconButtonProps {
  feat:        FeatureIconDef
  active:      boolean
  navigate:    (path: string) => void
  setActiveTab: (t: Tab) => void
  isTab:       boolean
  isDragging:  boolean
  badge?:      number
  onDragStart: () => void
  onDragOverSlot: () => void
  onDragEnd:   () => void
  onDrop:      () => void
}

function FeatureIconButton({
  feat, active, navigate, setActiveTab, isTab, isDragging,
  badge, onDragStart, onDragOverSlot, onDragEnd, onDrop,
}: FeatureIconButtonProps) {
  const Icon = feat.icon
  const handleClick = () => {
    if (isTab) setActiveTab(feat.id as Tab)
    navigate(feat.path)
  }
  return (
    <div
      className={`relative w-full flex justify-center transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        // Firefox refuses to start a drag unless data is set.
        try { e.dataTransfer.setData('text/plain', feat.id) } catch { /* ignore */ }
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverSlot()
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      <IconButton
        variant="ghost"
        active={active}
        onClick={handleClick}
        aria-label={feat.label}
        title={feat.label}
      >
        <Icon size={18} />
      </IconButton>
      {typeof badge === 'number' && badge > 0 && (
        <span
          className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full
            bg-[var(--color-accent)] text-[10px] font-semibold text-white
            inline-flex items-center justify-center pointer-events-none"
          aria-label={`${badge} new`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
  )
}
