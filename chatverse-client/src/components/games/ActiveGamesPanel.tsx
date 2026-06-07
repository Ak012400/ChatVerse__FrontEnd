import { useEffect, useState, useCallback } from 'react'
import {
  Gamepad2, Brain, Laugh, Users, Eye, ChevronDown, ChevronUp,
  RefreshCw, ArrowRight, Sparkles,
} from 'lucide-react'
import { gamesApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'
import Badge from '../ui/Badge'
import type { GameRoomDto, GameType } from '../../types/games'

// ============================================================
//  ActiveGamesPanel — embedded inside ChatPage for gameable
//  rooms (Gaming Lounge / Mini Game).
//
//  Surfaces three pillars of discovery:
//   1. Always-on Random Rooms (one Quiz + one Jokes per chat) —
//      pinned at top, "Join" auto-creates if missing
//   2. Public games launched from this chat — listed by recency
//   3. Empty state CTA when there's nothing live
//
//  Polling cadence: 5s when chat is foregrounded. We do NOT poll
//  via SignalR — overhead of adding a hub subscription for a
//  rarely-changing list isn't worth it for an MVP, and 5s is
//  fast enough that joiners feel "live".
//
//  Collapse state persists in localStorage so users who don't
//  care about games don't see the panel after dismissing it.
// ============================================================

const POLL_MS_FOREGROUND = 5_000
const COLLAPSE_KEY = (sourceChatSlug: string) => `cv:games-panel:collapsed:${sourceChatSlug}`

interface Props {
  /** Slug of the chat room hosting the panel. Filters discovery. */
  sourceChatSlug: string
  /** Called when the user clicks Join/Watch on any card. Parent is
   *  responsible for opening the embedded game panel — the panel
   *  itself doesn't navigate. */
  onPickRoom: (slug: string) => void
  /** Called when the user clicks "Start a game" inside the panel —
   *  the parent opens the existing GameLauncherModal. Letting the
   *  parent own that modal avoids two creators for the same chat. */
  onStartGame: () => void
}

export default function ActiveGamesPanel({
  sourceChatSlug, onPickRoom, onStartGame,
}: Props) {
  const { showToast } = useToastStore()
  const [rooms, setRooms] = useState<GameRoomDto[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSE_KEY(sourceChatSlug)) === '1'
  })
  const [joiningRandomType, setJoiningRandomType] = useState<GameType | null>(null)

  // ─── Polling ───────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await gamesApi.listActive(sourceChatSlug)
      setRooms(res.data.data ?? [])
    } catch {
      // Silent — panel is non-critical and we don't want to nag
      // every 5 seconds during transient errors.
    } finally {
      setLoading(false)
    }
  }, [sourceChatSlug])

  useEffect(() => {
    fetchRooms()
    if (collapsed) return // don't poll while collapsed — pure waste
    const id = setInterval(fetchRooms, POLL_MS_FOREGROUND)
    return () => clearInterval(id)
  }, [fetchRooms, collapsed])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY(sourceChatSlug), next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  // ─── Random room handler ───────────────────────────────────────
  // Single click → backend creates-or-joins. We pass the slug to the
  // parent and it embeds the game panel. The optimistic state flag
  // disables the button during the round-trip so quick double-clicks
  // don't create two parallel join requests.
  const handleJoinRandom = async (type: GameType) => {
    if (joiningRandomType) return
    setJoiningRandomType(type)
    try {
      const res = await gamesApi.getRandomRoom(sourceChatSlug, type)
      const slug = res.data.data.slug
      onPickRoom(slug)
      if (res.data.data.note) {
        showToast({
          type: 'info',
          title: 'Spectator mode',
          message: res.data.data.note,
          duration: 3000,
        })
      }
    } catch (err: any) {
      showToast({
        type: 'danger',
        title: 'Could not join random room',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setJoiningRandomType(null)
    }
  }

  // ─── Splits ────────────────────────────────────────────────────
  // Random rooms are SERVER-sorted first, then created-at desc. We
  // re-derive here to render them with distinct styling.
  const randomRooms = rooms.filter((r) => r.isRandom)
  const userRooms = rooms.filter((r) => !r.isRandom)
  const hasAnyContent = randomRooms.length > 0 || userRooms.length > 0

  return (
    <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-surface-1)]">
      {/* Header bar — always visible */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-[var(--color-surface-2)] transition-colors text-left"
      >
        <Gamepad2 size={14} className="text-[var(--color-accent-fg)] shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide">Live Games</span>
        {!collapsed && rooms.length > 0 && (
          <Badge tone="success" size="sm" dot>{rooms.length}</Badge>
        )}
        <span className="ml-auto flex items-center gap-2">
          {!collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); fetchRooms() }}
              className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] flex items-center gap-1 transition-colors"
              role="button"
              aria-label="Refresh"
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            </span>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {/* Random rooms — always show both options so users can try
              either Quiz or Jokes without first hunting for a creator. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <RandomRoomCard
              type="Quiz"
              existing={randomRooms.find((r) => r.type === 'Quiz')}
              joining={joiningRandomType === 'Quiz'}
              onJoin={() => handleJoinRandom('Quiz')}
            />
            <RandomRoomCard
              type="Jokes"
              existing={randomRooms.find((r) => r.type === 'Jokes')}
              joining={joiningRandomType === 'Jokes'}
              onJoin={() => handleJoinRandom('Jokes')}
            />
          </div>

          {/* User-created public rooms */}
          {userRooms.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)] px-1">
                Hosted by members
              </p>
              {userRooms.map((r) => (
                <UserRoomCard key={r.slug} room={r} onJoin={() => onPickRoom(r.slug)} />
              ))}
            </div>
          )}

          {/* Empty state with "host one" CTA */}
          {!hasAnyContent && (
            <button
              type="button"
              onClick={onStartGame}
              className="w-full p-3 rounded-md border border-dashed border-[var(--color-line)] text-[11px] text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              No live member-hosted games. <span className="text-[var(--color-accent-fg)] font-medium">Start one ↗</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Random room card ───────────────────────────────────────────
function RandomRoomCard({
  type, existing, joining, onJoin,
}: {
  type: GameType
  existing?: GameRoomDto
  joining: boolean
  onJoin: () => void
}) {
  const isLive = !!existing && existing.status !== 'Ended'
  const playerFull = existing && existing.playerCount >= existing.maxPlayers
  const ctaText = !isLive
    ? 'Start round'
    : playerFull
      ? 'Watch live'
      : 'Join now'

  const iconBg = type === 'Quiz'
    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
    : 'bg-[var(--color-success-soft)] text-[var(--color-success-fg)]'
  const icon = type === 'Quiz' ? <Brain size={16} /> : <Laugh size={16} />
  const label = type === 'Quiz' ? 'Random Quiz' : 'Random Jokes'

  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={joining}
      className="text-left p-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] disabled:opacity-50 transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium truncate">{label}</p>
            <Sparkles size={9} className="text-[var(--color-warning-fg)] shrink-0" />
            <span className="text-[9px] uppercase tracking-wide text-[var(--color-fg-mute)]">always on</span>
          </div>
          <p className="text-[10px] text-[var(--color-fg-mute)] flex items-center gap-2 mt-0.5">
            {isLive ? (
              <>
                <span className="flex items-center gap-1">
                  <Users size={9} />{existing!.playerCount}/{existing!.maxPlayers}
                </span>
                <span className="flex items-center gap-1">
                  <Eye size={9} />{existing!.spectatorCount}
                </span>
              </>
            ) : (
              <span>Click to start</span>
            )}
          </p>
        </div>
        <span className="text-[10px] font-medium text-[var(--color-accent-fg)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
          {ctaText} <ArrowRight size={10} />
        </span>
      </div>
    </button>
  )
}

// ─── User-hosted room card ──────────────────────────────────────
function UserRoomCard({
  room, onJoin,
}: {
  room: GameRoomDto
  onJoin: () => void
}) {
  const isLobby = room.status === 'Lobby'
  const isPlaying = room.status === 'Playing'
  const playersFull = room.playerCount >= room.maxPlayers
  const cta = playersFull
    ? 'Watch'
    : isPlaying
      ? 'Spectate'
      : 'Join lobby'

  const icon = room.type === 'Jokes' ? <Laugh size={14} /> : <Brain size={14} />
  return (
    <button
      type="button"
      onClick={onJoin}
      className="w-full text-left p-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium truncate">{room.name}</p>
            {isLobby && <Badge tone="accent" size="sm">Lobby</Badge>}
            {isPlaying && <Badge tone="warning" size="sm" dot>Live</Badge>}
          </div>
          <p className="text-[10px] text-[var(--color-fg-mute)] flex items-center gap-2 mt-0.5">
            <span>{room.hostUsername}</span>
            <span className="flex items-center gap-1">
              <Users size={9} />{room.playerCount}/{room.maxPlayers}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={9} />{room.spectatorCount}
            </span>
          </p>
        </div>
        <span className="text-[10px] font-medium text-[var(--color-accent-fg)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
          {cta} <ArrowRight size={10} />
        </span>
      </div>
    </button>
  )
}
