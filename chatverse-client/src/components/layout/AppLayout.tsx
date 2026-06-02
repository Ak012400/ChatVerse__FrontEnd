import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { PanelLeftOpen } from 'lucide-react'
import PrimarySidebar from './Sidebar/PrimarySidebar'
import SecondarySidebar from './Sidebar/SecondarySidebar'
import ChatSidebar from './Sidebar/ChatSidebar'
import VideoSidebar from './Sidebar/VideoSidebar'
import { useUiStore } from '../../stores/uiStore'

type Tab = 'chat' | 'video'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { slug } = useParams()
  const collapsed = useUiStore((s) => s.secondaryCollapsed)
  const toggleSecondary = useUiStore((s) => s.toggleSecondary)

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

  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-fg)] overflow-hidden">
      <PrimarySidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {showSecondary && (
        <SecondarySidebar title={activeTab === 'chat' ? 'Rooms' : 'Video'}>
          {activeTab === 'chat' ? <ChatSidebar slug={slug} /> : <VideoSidebar />}
        </SecondarySidebar>
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

      <main className="flex-1 min-w-0 overflow-hidden relative">{children}</main>
    </div>
  )
}
