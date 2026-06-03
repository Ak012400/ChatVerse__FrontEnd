import { useMemo, useState } from 'react'
import { Hash, Plus, LinkIcon, Loader2, X, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Room } from '../../../types'
import { useChatStore } from '../../../stores/chatStore'
import { useAuthStore } from '../../../stores/authStore'
import { useToastStore } from '../../../stores/toastStore'
import { roomsApi } from '../../../api'

interface Props {
  slug?: string
}

/**
 * Extracts an invite token from either a raw token string or a full URL
 * like `https://chatverse.live/rooms/join/<token>`. Tolerant of trailing
 * slashes and query strings.
 */
function extractInviteToken(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // Take last non-empty path segment after stripping query/hash.
  const cleaned = s.split(/[?#]/)[0]
  const parts = cleaned.split('/').filter(Boolean)
  return parts[parts.length - 1] || null
}

export default function ChatSidebar({ slug }: Props) {
  const rooms = useChatStore((s) => s.rooms)
  const setRooms = useChatStore((s) => s.setRooms)
  const onlineCount = useChatStore((s) => s.onlineCount)
  const isGuest = useAuthStore((s) => s.user?.isGuest ?? true)
  const { showToast } = useToastStore()
  const navigate = useNavigate()

  const [showJoin, setShowJoin] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [joining, setJoining] = useState(false)

  // Split rooms into public + private buckets, then group public rooms
  // by category. Private rooms sit in their own "My rooms" section.
  const { privateRooms, publicGrouped } = useMemo(() => {
    const priv: Room[] = []
    const pub: Room[] = []
    for (const r of rooms) (r.isPrivate ? priv : pub).push(r)

    const map = new Map<string, Room[]>()
    for (const r of pub) {
      const key = (r.category ?? 'rooms').toString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return { privateRooms: priv, publicGrouped: Array.from(map.entries()) }
  }, [rooms])

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = extractInviteToken(inviteInput)
    if (!token) {
      showToast({
        type: 'warning',
        title: 'Empty invite',
        message: 'Paste a room invite URL or token.',
        duration: 2500,
      })
      return
    }
    setJoining(true)
    try {
      const res = await roomsApi.joinByInvite(token)
      const data = res.data.data
      // Optimistically merge the joined room into the sidebar so the user
      // doesn't need a page refresh to see it.
      const newRoom: Room = {
        slug: data.slug,
        displayName: data.displayName,
        description: data.description ?? '',
        category: data.category ?? 'public',
        iconEmoji: data.iconEmoji ?? '💬',
        activeNow: 0,
        totalMessages: 0,
        isPrivate: true,
      }
      const exists = rooms.some((r) => r.slug === newRoom.slug)
      if (!exists) setRooms([newRoom, ...rooms])

      setInviteInput('')
      setShowJoin(false)
      showToast({
        type: 'success',
        title: 'Joined',
        message: `Welcome to ${newRoom.displayName}.`,
        duration: 2500,
      })
      navigate(`/chat/${newRoom.slug}`)
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Could not join',
        message: err.response?.data?.error ?? 'Invite invalid or expired.',
        duration: 3500,
      })
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="px-2 space-y-5">
      {/* Actions: + New room (registered only) + Join via invite (all users) */}
      <div className="space-y-1">
        {!isGuest && (
          <button
            onClick={() => navigate('/rooms/new')}
            className="w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
          >
            <Plus size={14} className="text-[var(--color-accent-fg)] shrink-0" />
            <span>New room</span>
          </button>
        )}

        {!showJoin ? (
          <button
            onClick={() => setShowJoin(true)}
            className="w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] transition-colors"
          >
            <LinkIcon size={14} className="text-[var(--color-fg-faint)] shrink-0" />
            <span>Join with invite</span>
          </button>
        ) : (
          <form onSubmit={submitInvite} className="px-1 pb-1">
            <div className="flex items-center gap-1.5">
              <input
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                autoFocus
                placeholder="Paste invite URL or token"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-xs text-[var(--color-fg)]
                  focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setInviteInput('')
                    setShowJoin(false)
                  }
                }}
              />
              <button
                type="submit"
                disabled={joining || !inviteInput.trim()}
                className="h-8 px-2 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-xs font-medium inline-flex items-center justify-center disabled:opacity-50"
                aria-label="Join"
              >
                {joining ? (
                  <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  'Join'
                )}
              </button>
              <button
                type="button"
                onClick={() => { setInviteInput(''); setShowJoin(false) }}
                className="w-7 h-8 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-fg-faint)] inline-flex items-center justify-center"
                aria-label="Cancel"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-fg-mute)] mt-1 px-1">
              Tip: paste the full URL or just the token after <code>/join/</code>.
            </p>
          </form>
        )}
      </div>

      {/* Private rooms section — invite-joined */}
      {privateRooms.length > 0 && (
        <div>
          <div className="px-2 mb-1 flex items-center gap-1.5">
            <Lock size={10} className="text-[var(--color-fg-mute)]" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-mute)]">
              My rooms
            </h3>
          </div>
          <div className="space-y-0.5">
            {privateRooms.map((r) => {
              const active = slug === r.slug
              const count = onlineCount[r.slug] ?? r.activeNow ?? 0
              return (
                <button
                  key={r.slug}
                  onClick={() => navigate(`/chat/${r.slug}`)}
                  className={`group w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors
                    ${
                      active
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
                        : 'text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
                    }`}
                >
                  <span className="text-xs shrink-0">{r.iconEmoji || '💬'}</span>
                  <span className="flex-1 text-left truncate">{r.displayName}</span>
                  {count > 0 && (
                    <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Public categorised rooms */}
      {publicGrouped.length === 0 && privateRooms.length === 0 && (
        <div className="px-3 py-6 text-center">
          <p className="text-xs text-[var(--color-fg-mute)]">No rooms yet.</p>
        </div>
      )}

      {publicGrouped.map(([section, items]) => (
        <div key={section}>
          <div className="px-2 mb-1 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-mute)]">
              {section}
            </h3>
          </div>
          <div className="space-y-0.5">
            {items.map((r) => {
              const active = slug === r.slug
              const count = onlineCount[r.slug] ?? r.activeNow ?? 0
              return (
                <button
                  key={r.slug}
                  onClick={() => navigate(`/chat/${r.slug}`)}
                  className={`group w-full pl-2 pr-2 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors
                    ${
                      active
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
                        : 'text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
                    }`}
                >
                  <Hash size={14} className="text-[var(--color-fg-mute)] shrink-0" />
                  <span className="flex-1 text-left truncate">{r.displayName}</span>
                  {count > 0 && (
                    <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
