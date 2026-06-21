import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, Search, MessageSquare, Plus, ArrowLeft } from 'lucide-react'

import { dmsApi, usersApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useChatHub } from '../../hooks/useChatHub'
import { useDmStore, type DmMessage } from '../../stores/dmStore'

import Avatar from '../../components/ui/Avatar'
import Loader from '../../components/ui/Loader'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import { DragHandle } from '../../components/ui/DragHandle'
import { BlockUserButton } from '../../components/users/BlockUserButton'
import { SpotifyEmbed } from '../../components/chat/SpotifyEmbed'
import { extractSpotifyEmbed } from '../../lib/spotifyExtract'
import { useResizableWidth } from '../../hooks/useResizableWidth'

// 👇 FIX: Declare a constant stable reference for empty arrays to prevent infinite re-renders
const EMPTY_ARRAY: any[] = []

/**
 * DMs page. Two layouts in one:
 * - left rail  → conversation list (always visible on desktop)
 * - right pane → either the active thread or a "pick someone" CTA
 *
 * Realtime: ReceiveDm + DmTyping events flow through useChatHub and
 * land in the Zustand store. This page reads from the store; the hub
 * is the single source of incoming updates.
 */
export default function DmsPage() {
  const navigate = useNavigate()
  const { otherUserId } = useParams<{ otherUserId?: string }>()
  const me = useAuthStore((s) => s.user)
  const { sendDm, sendDmTyping, markDmRead } = useChatHub()

  // Resizable conversation list — desktop only. The handle sits on
  // the list's right edge so dragging right grows it.
  const listResize = useResizableWidth({
    storageKey: 'dms-conversation-list',
    defaultWidth: 288,   // matches the original w-72
    minWidth: 220,
    maxWidth: 480,
    direction: 'right',
  })

  // Is the other party in this thread blocked? Hydrate once per
  // otherUserId by checking the outgoing block list. The cost is one
  // small GET per thread switch; we cache via the BlockedUsersSection's
  // own load when the user visits Profile.
  const [otherIsBlocked, setOtherIsBlocked] = useState(false)
  useEffect(() => {
    if (!otherUserId) { setOtherIsBlocked(false); return }
    let cancelled = false
    usersApi.myBlocks().then((res) => {
      if (cancelled) return
      const blocks: { userId: string }[] = res.data?.data ?? []
      setOtherIsBlocked(blocks.some((b) => b.userId === otherUserId))
    }).catch(() => { /* best effort */ })
    return () => { cancelled = true }
  }, [otherUserId])

  const conversations = useDmStore((s) => s.conversations)
  const setConversations = useDmStore((s) => s.setConversations)
  
  // 👇 FIX: Use EMPTY_ARRAY instead of inline []
  const thread = useDmStore((s) => (otherUserId ? s.threads[otherUserId] ?? EMPTY_ARRAY : EMPTY_ARRAY))
  const setThread = useDmStore((s) => s.setThread)
  const markThreadRead = useDmStore((s) => s.markThreadRead)
  
  // 👇 FIX: Use EMPTY_ARRAY instead of inline []
  const typingIn = useDmStore((s) =>
    otherUserId
      ? s.typingIn[`dm:${[me?.userId ?? '', otherUserId].sort().join('-')}`] ?? EMPTY_ARRAY
      : EMPTY_ARRAY,
  )

  const [convsLoading, setConvsLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [input, setInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  // Optimistic username for a freshly-picked search result. The
  // conversation list won't include this user yet (no prior thread),
  // so without this fallback the header shows the generic "Conversation"
  // placeholder — which reads as "chat didn't open". We hydrate the
  // header with the picked username immediately, then let `activeConv`
  // take over once the real conversation lands.
  const [pendingPickedUsername, setPendingPickedUsername] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  /* Load conversation list once on mount */
  useEffect(() => {
    setConvsLoading(true)
    dmsApi
      .conversations()
      .then((r) => setConversations(r.data.data?.conversations ?? []))
      .catch(() => setConversations([]))
      .finally(() => setConvsLoading(false))
  }, [setConversations])

  /* Load the active thread + mark read */
  useEffect(() => {
    if (!otherUserId) return
    setThreadLoading(true)
    dmsApi
      .thread(otherUserId)
      .then((r) => {
        // Backend returns newest-first; reverse for chronological render.
        const msgs: DmMessage[] = [...(r.data.data?.messages ?? [])].reverse()
        setThread(otherUserId, msgs)
        markThreadRead(otherUserId)
        // Also fire the hub-side mark — server clears unread and
        // notifies the other party with a "Read" receipt.
        markDmRead(otherUserId)
      })
      .catch(() => setThread(otherUserId, []))
      .finally(() => setThreadLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId])

  /* Scroll to bottom on new messages */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length, typingIn.length])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otherUserId || !input.trim()) return
    await sendDm(otherUserId, input.trim())
    setInput('')
  }

  const activeConv = useMemo(
    () => conversations.find((c) => c.otherUserId === otherUserId),
    [conversations, otherUserId],
  )

  // Clear the optimistic picked-name once the real conversation lands
  // OR the user navigates away to a different thread. Without this we'd
  // hold a stale name when the user keeps clicking different search
  // results.
  useEffect(() => {
    if (!otherUserId) {
      setPendingPickedUsername(null)
      return
    }
    if (activeConv) setPendingPickedUsername(null)
  }, [otherUserId, activeConv])

  /** Best display name for the open thread — prefers the real
   *  conversation row, falls back to the just-picked search result. */
  const displayUsername =
    activeConv?.otherUsername ?? pendingPickedUsername ?? 'Conversation'

  // Mobile layout switch — narrow screens can't fit conv-list + thread
  // side by side. When a thread is open, the list hides; when no thread
  // is picked, the list takes the full canvas. Desktop (sm+) keeps the
  // classic two-column layout.
  const onMobileShowList = !otherUserId
  const onMobileShowThread = !!otherUserId

  return (
    <div className="flex h-full bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Conversation list — width draggable on desktop via the
          DragHandle rendered between this aside and the thread main. */}
      <aside
        className={`${onMobileShowList ? 'flex' : 'hidden'} sm:flex
          w-full shrink-0 border-r-0 lg:border-r border-[var(--color-line)] flex-col`}
        style={{
          // Apply the dynamic width only on sm+ (mobile is full-width).
          ['--dms-list-w' as never]: `${listResize.width}px`,
        }}
      >
        <style>{`@media (min-width: 640px) { [data-dms-aside] { width: var(--dms-list-w); } }`}</style>
        <div data-dms-aside className="flex flex-col h-full w-full">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--color-line)]">
          <h2 className="text-sm font-semibold tracking-tight">Direct messages</h2>
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="w-7 h-7 rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] inline-flex items-center justify-center transition-colors"
            aria-label="Start new DM"
          >
            <Plus size={14} />
          </button>
        </div>

        {showSearch && (
          <NewDmSearch
            onPick={(uid, username) => {
              // Pre-populate the conversation in dmStore BEFORE navigate.
              // The AppLayout `key={pathname}` remount destroys DmsPage's
              // local state on route change, so any optimistic data has
              // to live in the store to survive. This guarantees the new
              // DmsPage mount sees the picked user already in the
              // conversation list + `activeConv` lookup succeeds → header
              // shows real username + the list row is visually selected.
              useDmStore.getState().upsertOptimisticConversation(uid, username, me?.userId ?? '')
              // Now navigate. The route change triggers the remount;
              // the new instance reads the store and renders correctly.
              navigate(`/dms/${uid}`)
              setPendingPickedUsername(username)
              setShowSearch(false)
            }}
          />
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {convsLoading ? (
            <div className="px-3 py-4">
              <Loader text="Loading…" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <MessageSquare size={20} className="mx-auto text-[var(--color-fg-mute)] mb-2" />
              <p className="text-xs text-[var(--color-fg-faint)] leading-relaxed">
                No conversations yet. Use{' '}
                <button
                  onClick={() => setShowSearch(true)}
                  className="text-[var(--color-accent-fg)] hover:text-[var(--color-fg)] transition-colors"
                >
                  + New
                </button>{' '}
                to start one.
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5 px-2">
              {conversations.map((c) => {
                const active = otherUserId === c.otherUserId
                return (
                  <li key={c.conversationId}>
                    <button
                      onClick={() => navigate(`/dms/${c.otherUserId}`)}
                      className={`group w-full px-2.5 py-2 rounded-md flex items-center gap-2.5 text-left
                        transition-[background-color,color,transform] duration-150 ease-out
                        active:scale-[0.98]
                        ${
                          active
                            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] shadow-[inset_2px_0_0_0_var(--color-accent)]'
                            : 'hover:bg-[var(--color-surface-2)] hover:translate-x-px'
                        }`}
                    >
                      <Avatar name={c.otherUsername} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate flex-1">
                            {c.otherUsername}
                          </p>
                          {c.unreadCount > 0 && (
                            <Badge tone="accent" size="sm">
                              {c.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--color-fg-faint)] truncate">
                          {c.lastMessageMine && 'You: '}
                          {c.lastMessage}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        </div>
      </aside>

      {/* Drag handle between list and thread — desktop only. */}
      <DragHandle
        isDragging={listResize.isDragging}
        onPointerDown={listResize.onPointerDown}
        onDoubleClick={listResize.resetToDefault}
        label="Resize conversation list"
      />

      {/* Thread pane — full width on mobile when active, hidden when none picked */}
      {otherUserId ? (
        <main className={`${onMobileShowThread ? 'flex' : 'hidden'} sm:flex flex-1 flex-col min-w-0`}>
          <header className="h-14 px-5 border-b border-[var(--color-line)] flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/dms')}
              className="sm:hidden w-8 h-8 rounded-md text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] inline-flex items-center justify-center transition-colors"
              aria-label="Back to list"
            >
              <ArrowLeft size={14} />
            </button>
            <Avatar name={displayUsername} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {displayUsername}
              </p>
              {typingIn.length > 0 && (
                <p className="text-[11px] text-[var(--color-accent-fg)]">typing…</p>
              )}
            </div>
            {/* Block / Unblock — tucked into the header so it's there
                when needed without dominating the chat. Visibility logic
                lives in the button (two-tap confirm on first block). */}
            {otherUserId && (
              <BlockUserButton
                targetUserId={otherUserId}
                isBlocked={otherIsBlocked}
                onChanged={setOtherIsBlocked}
              />
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {threadLoading ? (
              <Loader variant="chat-skeleton" />
            ) : thread.length === 0 ? (
              <p className="text-xs text-[var(--color-fg-mute)] text-center mt-6">
                Say hi 👋
              </p>
            ) : (
              thread.map((m) => {
                const mine = m.senderId === me?.userId
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}
                  >
                    {!mine && <Avatar name={m.senderName} size="xs" />}
                    {(() => {
                      // Backend-enriched spotify wins; otherwise derive
                      // from message content client-side so embeds work
                      // even before the backend deploys SpotifyLinkExtractor.
                      const sp = m.spotify ?? extractSpotifyEmbed(m.content)
                      return (
                        <div className="max-w-[70%] flex flex-col gap-1.5">
                          <div
                            className={`px-3 py-1.5 text-sm rounded-2xl leading-relaxed
                              ${
                                mine
                                  ? 'bg-[var(--color-accent)] text-white rounded-tr-md'
                                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] rounded-tl-md'
                              }`}
                          >
                            {m.content}
                          </div>
                          {sp && <SpotifyEmbed embed={sp} />}
                        </div>
                      )
                    })()}
                  </div>
                )
              })
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={handleSend}
            className="px-5 py-3 border-t border-[var(--color-line)] flex items-center gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (otherUserId) sendDmTyping(otherUserId)
              }}
              placeholder={`Message ${displayUsername === 'Conversation' ? '' : displayUsername}`}
              className="flex-1 h-9 px-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)]
                text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-mute)]
                focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
                transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-9 px-3.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
                text-white text-sm font-medium transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                inline-flex items-center justify-center gap-1.5 focus-ring"
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </form>
        </main>
      ) : (
        // Empty state — desktop only; on mobile the conv-list takes the
        // full canvas so this would be redundant clutter.
        <main className="hidden sm:flex flex-1 items-center justify-center text-[var(--color-fg-faint)]">
          <div className="text-center">
            <MessageSquare size={28} className="mx-auto text-[var(--color-fg-mute)] mb-3" />
            <p className="text-sm font-medium text-[var(--color-fg)]">Pick a conversation</p>
            <p className="text-xs text-[var(--color-fg-faint)] mt-1">
              Or start a new one from the sidebar.
            </p>
          </div>
        </main>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Inline username search (used by the "+" button at the top).
───────────────────────────────────────────────────────────── */
function NewDmSearch({ onPick }: { onPick: (userId: string, username: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ userId: string; username: string }[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    const handle = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await usersApi.search(q.trim())
        setHits(res.data.data?.results ?? [])
      } catch {
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => window.clearTimeout(handle)
  }, [q])

  return (
    <div className="px-3 py-2 border-b border-[var(--color-line)]">
      <Input
        leftIcon={<Search size={14} />}
        placeholder="Find someone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {q.trim().length >= 2 && (
        <div className="mt-2 bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-md max-h-48 overflow-y-auto">
          {searching ? (
            <p className="p-3 text-xs text-[var(--color-fg-faint)] text-center">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="p-3 text-xs text-[var(--color-fg-faint)] text-center">No matches</p>
          ) : (
            hits.map((h) => (
              <button
                key={h.userId}
                type="button"
                onClick={(e) => {
                  // Stop the click from bubbling to any parent that
                  // might intercept (e.g. an outside-click dismisser on
                  // the search panel) — that race was eating the click
                  // and the navigation never fired.
                  e.preventDefault()
                  e.stopPropagation()
                  onPick(h.userId, h.username)
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-[var(--color-surface-3)] text-left transition-colors"
              >
                <Avatar name={h.username} size="sm" />
                <span className="text-sm">{h.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}