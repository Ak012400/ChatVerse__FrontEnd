import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Copy, Check, Flag, Play, UserPlus,
  UserCheck, UserX, Crown, Loader2,
} from 'lucide-react'
import { gamesApi } from '../../api'
import { useGameHub } from '../../hooks/useGameHub'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ChessBoardPanel from '../../components/games/ChessBoardPanel'
import CommentaryChat from '../../components/games/CommentaryChat'
import type { ChessStateSnapshot } from '../../types/games'

// ============================================================
//  PlayRoomPage — dedicated full-screen overlay for "heavy"
//  games (Chess now, Ludo Sprint B). Distinct from the chat-
//  embedded QuizRoomPage because the board needs much more
//  screen real-estate and a dedicated chat rail.
//
//  Layout (lg+):
//   ┌─────────────────────────┬──────────────┐
//   │                         │  Live feed   │
//   │      Chess board        │  (chat)      │
//   │                         ├──────────────┤
//   │                         │  Scoreboard  │
//   │                         │  Requests    │
//   └─────────────────────────┴──────────────┘
//
//  Lifecycle on mount:
//   1. REST join (Player → may auto-fallback to Spectator OR
//      get a "waiting for approval" reply on private rooms)
//   2. REST snapshot (paint immediately)
//   3. Hub.joinRoom → live event stream
//   4. Hub.fetchChessState → board state populated
//   5. If host: hub.fetchPendingRequests → requests panel
//
//  Guest gate:
//   • Guests see board + chat + can read everything
//   • Cannot make moves; ChessBoardPanel sees isLoggedIn=false
// ============================================================

export default function PlayRoomPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const me = useAuthStore((s) => s.user)
  const isLoggedIn = !!me && !me.isGuest

  const {
    hubState, joinRoom, leaveRoom, sendChat,
    submitChessMove, resignChess, fetchChessState,
    fetchPendingRequests, approveJoinRequest, declineJoinRequest,
    startQuiz, // same hub method, name kept generic to avoid re-coding
  } = useGameHub()

  const snapshot = useGameStore((s) => s.snapshot)
  const chess = useGameStore((s) => s.chess)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const joinRequestPending = useGameStore((s) => s.joinRequestPending)
  const pendingJoinRequests = useGameStore((s) => s.pendingJoinRequests)

  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const room = snapshot?.room
  const viewerRole = snapshot?.viewerRole ?? null
  const isHost = useMemo(
    () => !!room && !!me && participants.some((p) => p.userId === me.userId && p.isHost),
    [room, me, participants],
  )

  // ─── Join sequence ───────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    const run = async () => {
      try {
        // 1) REST join — backend decides: admit / spectator / queue.
        const joinRes = await gamesApi.join(slug, 'Player')
        if (cancelled) return
        const note = joinRes.data.data?.note
        if (note?.toLowerCase().includes('waiting')) {
          // Private room — host approval pending. Show waiting view.
          useGameStore.getState().setJoinRequestPending(true)
          showToast({
            type: 'info', title: 'Waiting for host',
            message: note, duration: 4000,
          })
        }

        // 2) Snapshot for instant paint.
        const snapRes = await gamesApi.snapshot(slug)
        if (cancelled) return
        useGameStore.getState().applySnapshot(snapRes.data.data)

        // 3) Hub attach for live events.
        try { await joinRoom(slug) } catch {
          showToast({
            type: 'warning', title: 'Live updates pending',
            message: 'Reconnecting to the game server…', duration: 2500,
          })
        }

        // 4) Pull current chess state so the board paints immediately.
        try { await fetchChessState(slug) } catch { /* swallow */ }

        // 5) Host pulls pending requests so the requests panel is
        //    populated on first paint.
        if (joinRes.data.data?.assignedRole === 'Player' && me) {
          try { await fetchPendingRequests(slug) } catch { /* swallow */ }
        }

        if (cancelled) return
        setJoining(false)
      } catch (err: any) {
        if (cancelled) return
        setJoinError(
          err?.response?.data?.error ?? 'Could not enter the room.'
        )
        setJoining(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Once host status is established, re-pull pending list in case
  // any landed before our event subscription was active.
  useEffect(() => {
    if (isHost && slug) {
      fetchPendingRequests(slug).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, slug])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleResign = async () => {
    if (!window.confirm('Resign this game?')) return
    try { await resignChess(slug) }
    catch { /* swallow — error toast comes via Ack event */ }
  }

  const handleApprove = (rid: string) => approveJoinRequest(slug, rid).catch(() => {})
  const handleDecline = (rid: string) => declineJoinRequest(slug, rid).catch(() => {})

  // ─── Render branches ───────────────────────────────────────────

  if (joining) {
    return <FullPageStatus icon={<Loader2 size={20} className="animate-spin" />}>
      Entering the room…
    </FullPageStatus>
  }
  if (joinError || !room) {
    return (
      <FullPageStatus icon={<Crown size={20} className="text-[var(--color-warning-fg)]" />}>
        <p className="mb-3">{joinError ?? 'Room unavailable.'}</p>
        <Button size="sm" onClick={() => navigate('/chat')} leftIcon={<ArrowLeft size={14} />}>
          Back to chat
        </Button>
      </FullPageStatus>
    )
  }
  if (joinRequestPending) {
    return (
      <FullPageStatus icon={<Loader2 size={20} className="animate-spin text-[var(--color-warning-fg)]" />}>
        <p className="mb-1 text-sm font-medium">Waiting for host approval</p>
        <p className="text-xs text-[var(--color-fg-mute)] mb-3">
          You'll be admitted automatically once {room.hostUsername} approves.
        </p>
        <Button size="sm" onClick={() => navigate('/chat')} leftIcon={<ArrowLeft size={14} />}>
          Back to chat
        </Button>
      </FullPageStatus>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* Header */}
      <header className="shrink-0 px-5 py-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Crown size={16} className="text-[var(--color-accent-fg)] shrink-0" />
          <h1 className="text-sm font-medium truncate">{room.name}</h1>
          <Badge tone={room.status === 'Playing' ? 'warning' : 'accent'} size="sm" dot>
            {room.status}
          </Badge>
          {room.isPublic === false && <Badge tone="warning" size="sm">Private</Badge>}
          {viewerRole === 'Spectator' && <Badge tone="neutral" size="sm">Spectator</Badge>}
          {hubState === 'connected'  && <Badge tone="success" size="sm" dot>Online</Badge>}
          {hubState === 'connecting' && <Badge tone="warning" size="sm" dot>Connecting…</Badge>}
          {hubState === 'failed'     && <Badge tone="danger"  size="sm" dot>Offline</Badge>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyLink}
            className="text-[10px] font-mono text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] px-2 py-1 rounded-md hover:bg-[var(--color-surface-2)] flex items-center gap-1 transition-colors"
            title="Copy invite link"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span className="hidden sm:inline">{room.slug}</span>
          </button>
          {isLoggedIn && viewerRole === 'Player' && chess?.result === 'InProgress' && (
            <button
              onClick={handleResign}
              className="h-8 px-3 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-dim)] inline-flex items-center gap-1.5 transition-colors"
              title="Resign"
            >
              <Flag size={12} /> Resign
            </button>
          )}
          <button
            onClick={async () => { await leaveRoom(slug); navigate('/chat') }}
            className="h-8 px-3 rounded-md text-xs bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={12} /> Leave
          </button>
        </div>
      </header>

      {/* Body — board left, side rail right */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 p-4 overflow-hidden">
        {/* BOARD */}
        <section className="overflow-y-auto flex items-start justify-center pt-2">
          {chess ? (
            <ChessBoardPanel
              snapshot={chess}
              isLoggedIn={isLoggedIn}
              onMove={(san, uci, fenAfter) => submitChessMove(slug, san, uci, fenAfter)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[var(--color-fg-mute)]">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
        </section>

        {/* SIDE RAIL */}
        <aside className="flex flex-col gap-3 overflow-hidden h-full">
          {/* Live feed */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CommentaryChat
              messages={chat}
              onSend={(t) => sendChat(slug, t)}
            />
          </div>

          {/* Move history (compact) */}
          {chess && chess.moveHistory.length > 0 && (
            <div className="shrink-0 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--color-line)] text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                Moves
              </div>
              <div className="p-2 max-h-32 overflow-y-auto text-[11px] font-mono leading-relaxed">
                {chess.moveHistory.map((m, i) => (
                  <span key={i} className="mr-2">
                    {i % 2 === 0 && <span className="text-[var(--color-fg-mute)]">{Math.floor(i / 2) + 1}. </span>}
                    {m.san}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Requests panel — host only, only when there are requests */}
          {isHost && pendingJoinRequests.length > 0 && (
            <div className="shrink-0 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--color-line)] flex items-center gap-2">
                <UserPlus size={11} className="text-[var(--color-accent-fg)]" />
                <span className="text-[10px] uppercase tracking-wide font-medium">
                  Join requests
                </span>
                <span className="ml-auto text-[10px] text-[var(--color-fg-mute)]">
                  {pendingJoinRequests.length}
                </span>
              </div>
              <ul className="divide-y divide-[var(--color-line)]">
                {pendingJoinRequests.map((req) => (
                  <li key={req.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs flex-1 truncate">{req.username}</span>
                    <button
                      onClick={() => handleApprove(req.id)}
                      className="h-7 px-2 rounded-md text-[10px] bg-[var(--color-success-soft)] text-[var(--color-success-fg)] hover:opacity-90 inline-flex items-center gap-1"
                    >
                      <UserCheck size={10} /> Approve
                    </button>
                    <button
                      onClick={() => handleDecline(req.id)}
                      className="h-7 px-2 rounded-md text-[10px] bg-[var(--color-danger-soft)] text-[var(--color-danger-fg)] hover:opacity-90 inline-flex items-center gap-1"
                    >
                      <UserX size={10} /> Decline
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Participants */}
          <div className="shrink-0 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[var(--color-line)] flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide font-medium">
                In room · {participants.length}
              </span>
            </div>
            <ul className="p-2 space-y-1 max-h-40 overflow-y-auto text-xs">
              {participants.map((p) => (
                <li key={p.userId} className="flex items-center gap-2 px-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    p.role === 'Player'
                      ? 'bg-[var(--color-success)]'
                      : 'bg-[var(--color-fg-mute)]'
                  }`} />
                  <span className="flex-1 truncate">{p.username}</span>
                  {p.isHost && <Crown size={10} className="text-[var(--color-warning-fg)]" />}
                  <span className="text-[9px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                    {p.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Host start button — chess needs both seats filled */}
          {isHost && room.status === 'Lobby' && chess && chess.whitePlayerId && chess.blackPlayerId && (
            <Button
              size="lg"
              fullWidth
              leftIcon={<Play size={15} />}
              onClick={async () => {
                try { await startQuiz(slug) } catch { /* via hub error event */ }
              }}
            >
              Start game
            </Button>
          )}
        </aside>
      </div>
    </div>
  )
}

function FullPageStatus({
  icon, children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-mute)] p-6 text-center bg-[var(--color-bg)]">
      <div className="mb-3">{icon}</div>
      {children}
    </div>
  )
}
