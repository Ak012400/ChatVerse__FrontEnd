import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { PanelLeftOpen } from 'lucide-react'
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react'
import PrimarySidebar from './Sidebar/PrimarySidebar'
import SecondarySidebar from './Sidebar/SecondarySidebar'
import ChatSidebar from './Sidebar/ChatSidebar'
import VideoSidebar from './Sidebar/VideoSidebar'
import OnlineBadge from '../ui/OnlineBadge'
import IncomingCallModal from '../call/IncomingCallModal'
import FloatingCallWidget from '../call/FloatingCallWidget'
import GameInviteListener from '../games/GameInviteListener'
import MobileBottomNav from './MobileBottomNav'
import { useUiStore } from '../../stores/uiStore'
import { useChatHub } from '../../hooks/useChatHub'
import { useTimeCapsuleHub } from '../../hooks/useTimeCapsuleHub'
import { usePersonaHub } from '../../hooks/usePersonaHub'
import { useConfessionHub } from '../../hooks/useConfessionHub'
import { useAuthStore } from '../../stores/authStore'
import { useActiveCallStore } from '../../stores/activeCallStore'

// Tiny helpers so guests don't open SignalR connections they can't
// use. AppLayout itself can't call a hook conditionally, so we wrap.
function TimeCapsuleHubMount() {
  useTimeCapsuleHub()
  return null
}
function PersonaHubMount() {
  usePersonaHub()
  return null
}
function ConfessionHubMount() {
  useConfessionHub()
  return null
}

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

  // Guests aren't eligible recipients (24h expiry → orphans), so don't
  // even open the websocket for them.
  const isGuest = useAuthStore((s) => !!s.user?.isGuest)

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
    pathname.startsWith('/rooms/new') ||
    pathname.startsWith('/time-capsule') ||
    pathname.startsWith('/persona') ||
    pathname.startsWith('/story-chain') ||
    pathname.startsWith('/confessions') ||
    pathname.startsWith('/about')

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

  // ── Active call shell. When a call is in progress (set from any call
  //   page after token fetch) we mount LiveKitRoom HERE at the layout
  //   level. That way navigation between pages doesn't unmount it →
  //   the connection survives → call doesn't drop. Call pages then
  //   render their UI inside that LiveKit context instead of building
  //   their own LiveKitRoom wrapper.
  const activeCall = useActiveCallStore((s) => s.call)
  const endCall = useActiveCallStore((s) => s.endCall)

  const layoutContent = (
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

      {/* Global game invite handler — listens for `chatverse:game-invite`
          window events that useGameHub dispatches when the server pushes
          a per-user GameRoomInvite. Renders a toast banner with Accept/
          Dismiss. Mounted here so invites appear on any logged-in page. */}
      <GameInviteListener />

      {/* Time-capsule hub — silent mount. The hook itself owns the
          TimeCapsuleDelivered listener which fires the inbox toast,
          so we don't need any visible UI here. Guests skipped. */}
      {!isGuest && <TimeCapsuleHubMount />}

      {/* Persona Roulette hub — same silent-mount pattern. Owns the
          PersonaMessageReceived + StreakUnmasked listeners which
          surface toasts and keep the store fresh. */}
      {!isGuest && <PersonaHubMount />}

      {/* Confession Box hub — silent mount so TopConfessionOffered
          (reveal prompt for yesterday's top author) fires anywhere
          in the app, not just /confessions. */}
      {!isGuest && <ConfessionHubMount />}

      {/* Mobile bottom nav — replaces the vertical PrimarySidebar on
          phones. Hidden on sm and above. */}
      <MobileBottomNav />

      {/* Global incoming-call modal — always mounted for logged-in users
          so any direct-invite call surfaces regardless of which route
          the recipient is on. Self-hides when no invite is pending. */}
      <IncomingCallModal />
    </div>
  )

  // CRITICAL: LiveKitRoom must ALWAYS be the root, not conditional.
  // If we swap between `<div>` (no call) and `<LiveKitRoom>` (call) as
  // the root, React sees a parent-type change and remounts every child
  // — which destroys the call page's local state (joinData, the in-call
  // step state, etc.) the moment the call starts. The user would get
  // bounced back to the join screen in an infinite loop.
  //
  // So we mount LiveKitRoom unconditionally and toggle `connect` based
  // on whether there's an active call. When no call, LiveKitRoom sits
  // dormant — no WS, no media — but its position in the tree stays
  // stable so children's state survives the activate/deactivate edge.
  return (
    <LiveKitRoom
      token={activeCall?.token ?? ''}
      serverUrl={activeCall?.serverUrl ?? 'wss://placeholder.livekit.cloud'}
      connect={!!activeCall}
      audio={activeCall?.audio ?? true}
      video={activeCall?.video ?? true}
      options={activeCall?.roomOptions}
      onDisconnected={() => endCall()}
      data-lk-theme="default"
    >
      {activeCall && <RoomAudioRenderer />}
      {layoutContent}
      {/* Floating mini-controls only render when call is active AND user
          is off the call page — self-gated inside the widget. */}
      {activeCall && <FloatingCallWidget />}
    </LiveKitRoom>
  )
}
