import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import PrimarySidebar from './Sidebar/PrimarySidebar'
import SecondarySidebar from './Sidebar/SecondarySidebar'
import ChatSidebar from './Sidebar/ChatSidebar'
import VideoSidebar from './Sidebar/VideoSidebar'

type Tab = 'chat' | 'video'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { slug } = useParams()

  // Derive initial tab from URL so deep-links land on the right secondary panel.
  const [activeTab, setActiveTab] = useState<Tab>(
    pathname.startsWith('/video') ? 'video' : 'chat',
  )

  useEffect(() => {
    if (pathname.startsWith('/video')) setActiveTab('video')
    else if (pathname.startsWith('/chat')) setActiveTab('chat')
  }, [pathname])

  const isProfile = pathname.startsWith('/profile')

  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-fg)] overflow-hidden">
      <PrimarySidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Hide secondary sidebar on profile route — it deserves its own canvas. */}
      {!isProfile && (
        <SecondarySidebar title={activeTab === 'chat' ? 'Rooms' : 'Video'}>
          {activeTab === 'chat' ? <ChatSidebar slug={slug} /> : <VideoSidebar />}
        </SecondarySidebar>
      )}

      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  )
}
