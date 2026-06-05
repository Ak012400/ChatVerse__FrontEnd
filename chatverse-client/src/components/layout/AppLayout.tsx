import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { PanelLeftOpen } from 'lucide-react'
import PrimarySidebar from './Sidebar/PrimarySidebar'
import SecondarySidebar from './Sidebar/SecondarySidebar'
import ChatSidebar from './Sidebar/ChatSidebar'
import VideoSidebar from './Sidebar/VideoSidebar'
import OnlineBadge from '../ui/OnlineBadge'
import IncomingCallModal from '../call/IncomingCallModal'
import MobileBottomNav from './MobileBottomNav'
import { useUiStore } from '../../stores/uiStore'
import { useChatHub } from '../../hooks/useChatHub'

type Tab = 'chat' | 'video'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { slug } = useParams()
  const collapsed = useUiStore((s) => s.secondaryCollapsed)
  const toggleSecondary = useUiStore((s) => s.toggleSecondary)

  // Mount the chat hub at the layout level so the SignalR connection
  // is alive for every logged-in route. IncomingCallModal reads from
  // useCallStore, which the hub populates on "IncomingCall" events —
  // without this hook call, the connection never opens and no incoming
  // call ever fires.
  useChatHub()

  // Best-effort: ask for desktop-notification permission once the user
  // is past auth. If they decline, calls still ring inside the app —
  // they just won't pop a system notification when the tab is hidden.
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Derive initial tab from URL so deep-links land on the right secondary panel.
  const [activeTab, setActiveTab] = useState<Tab>(
    pathname.startsWith('/video') ? 'video' : 'chat',
  )

  useEffect(() => {
    if (pathname.startsWith('/video')) setActiveTab('video')
    else if (pathname.startsWith('/chat')) setActiveTab('chat')
  }, [pathname])

  // Pages that don't fit the standard 3-pane layout (profile, DMs, admin,
  // verification, pricing, video calls in progress) skip the secondary
  // sidebar entirely — they want every pixel for their own canvas.
  const skipSecondary =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/dms') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/rooms/new')

  const showSecondary = !skipSecondary

  // On mobile, when the user has drilled into a specific chat/video
  // session (/chat/:slug, /video/random, etc), hiding the secondary
  // sidebar gives the content the full screen. Showing the secondary
  // sidebar AND the content side-by-side at < 380px would crush both.
  // Desktop ignores this — it has plenty of horizontal room.
  const mobileDrillDown =
    /^\/chat\/.+/.test(pathname) ||
    /^\/video\/.+/.test(pathname)
  const secondaryMobileClass = mobileDrillDown ? 'hidden sm:flex' : 'flex'

  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-fg)] overflow-hidden">
      <PrimarySidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {showSecondary && (
        <div className={secondaryMobileClass}>
          <SecondarySidebar title={activeTab === 'chat' ? 'Rooms' : 'Video'}>
            {activeTab === 'chat' ? <ChatSidebar slug={slug} /> : <VideoSidebar />}
          </SecondarySidebar>
        </div>
      )}

      {/* Expand handle — only visible when sidebar is collapsed AND this
          route would normally show one. Lives on the left edge of main
          so a single click brings the panel back without hunting. */}
      {showSecondary && collapsed && (
        <button
          onClick={toggleSecondary}
          className="absolute left-14 top-1/2 -translate-y-1/2 z-30 w-5 h-16 rounded-r-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-l-0 border-[var(--color-line)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] inline-flex items-center justify-center transition-colors"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={12} />
        </button>
      )}

      <main className="flex-1 min-w-0 overflow-hidden relative pb-14 sm:pb-0">
        {/* Global presence pill — floats in the top-right corner of the
            main canvas without taking layout space. Self-hides until
            the first /presence/stats response. */}
        <OnlineBadge className="absolute top-3 right-4 z-20" />
        {children}
      </main>

      {/* Mobile bottom nav — replaces the vertical PrimarySidebar on
          phones. Hidden on sm and above. */}
      <MobileBottomNav />

      {/* Global incoming-call modal — always mounted for logged-in users
          so any direct-invite call surfaces regardless of which route
          the recipient is on. Self-hides when no invite is pending. */}
      <IncomingCallModal />
    </div>
  )
}
