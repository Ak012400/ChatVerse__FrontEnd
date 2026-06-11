import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Copy, Check, Flag, Play, UserPlus,
  UserCheck, UserX, Crown, Loader2, Hand, UserPlus2, DoorOpen,
  Clock, X, ChevronDown,
} from 'lucide-react'
import InvitePlayerModal from '../../components/games/InvitePlayerModal'
import { gamesApi } from '../../api'
import { useGameHub } from '../../hooks/useGameHub'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ChessBoardPanel from '../../components/games/ChessBoardPanel'
import CommentaryChat from '../../components/games/CommentaryChat'
import type { ChessStateSnapshot, ChessColor } from '../../types/games'

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
  // STRICT equality on isGuest === false (not just falsy): a stale
  // persisted authStore user from an older schema can lack the isGuest
  // field entirely (undefined), and `!undefined` wrongly counted those
  // as registered — guests were seeing the "Request to play" button.
  // Registered flows (Login / OTP / Google) always set isGuest: false
  // explicitly, so strict comparison is safe.
  const isLoggedIn = !!me && me.isGuest === false

  const {
    hubState, joinRoom, leaveRoom, sendChat,
    submitChessMove, resignChess, fetchChessState,
    fetchPendingRequests, approveJoinRequest, declineJoinRequest,
    startQuiz, // same hub method, name kept generic to avoid re-coding
    requestPlayerSeat, inviteToGameRoom, endRoom,
    assignChessSeat, unassignChessSeat, overrideGraceWait,
  } = useGameHub()

  // Listen for the server's RoomClosed broadcast and bounce out. We
  // do this from this page (not from the hook) so we have access to
  // the router. Anyone — host or spectator — gets kicked back to chat
  // when the host closes the room.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string; reason?: string }>).detail
      if (!detail || detail.slug !== slug) return
      // Use replace so the closed-room URL isn't in browser history.
      navigate('/chat', { replace: true })
    }
    window.addEventListener('cv:room-closed', handler as EventListener)
    return () => window.removeEventListener('cv:room-closed', handler as EventListener)
  }, [slug, navigate])

  const [showInviteModal, setShowInviteModal] = useState(false)
  // "I have asked for a player seat" — hydrated from sessionStorage so
  // a refresh (or accidental tab navigation away + back) doesn't lose
  // the badge. The flag is cleared either when our role flips to
  // Player or when JoinRequestResolved arrives for our request.
  const [seatPending, setSeatPending] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !slug) return false
    try { return sessionStorage.getItem(`cv:seat-pending:${slug}`) === '1' }
    catch { return false }
  })

  // Clear the pending flag the moment we land in a Player seat — server
  // already honoured the upgrade so the badge would be a lie.
  // NOTE: We read viewerRole off the store inside the effect rather
  // than from a const declared further down, otherwise we'd hit a
  // Temporal Dead Zone error during initial render.
  const liveViewerRole = useGameStore((s) => s.snapshot?.viewerRole ?? null)
  useEffect(() => {
    if (liveViewerRole === 'Player' && seatPending) {
      setSeatPending(false)
      try { sessionStorage.removeItem(`cv:seat-pending:${slug}`) } catch { /* private mode */ }
    }
  }, [liveViewerRole, seatPending, slug])

  // Reactive — the hook dispatches `cv:seat-pending-changed` when it
  // writes the sessionStorage flag, so we update on a real signal
  // instead of polling every 1.5s. Cross-tab updates still flow via
  // the native `storage` event (other tabs don't fire CustomEvents
  // on this one).
  useEffect(() => {
    const reactToChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string; pending: boolean }>).detail
      if (!detail || detail.slug !== slug) return
      setSeatPending(detail.pending)
    }
    const reactToStorage = () => {
      try { setSeatPending(sessionStorage.getItem(`cv:seat-pending:${slug}`) === '1') }
      catch { /* private mode */ }
    }
    window.addEventListener('cv:seat-pending-changed', reactToChange as EventListener)
    window.addEventListener('storage', reactToStorage)
    return () => {
      window.removeEventListener('cv:seat-pending-changed', reactToChange as EventListener)
      window.removeEventListener('storage', reactToStorage)
    }
  }, [slug])

  const snapshot = useGameStore((s) => s.snapshot)
  const chess = useGameStore((s) => s.chess)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const joinRequestPending = useGameStore((s) => s.joinRequestPending)
  const pendingJoinRequests = useGameStore((s) => s.pendingJoinRequests)
  const offlinePlayers = useGameStore((s) => s.offlinePlayers)

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
          {/* "Request to play" pill — spectators only.
              Visibility gates (all must be true):
                • logged-in (guests sign-up to play)
                • viewerRole === 'Spectator' (seated Players don't request — they resign)
                • !isHost (host owns the room, uses Director Mode seat controls
                  to self-assign; a Request button on their own room is meaningless)
                • !seatPending (already asked — show a Pending pill instead) */}
          {isLoggedIn && viewerRole === 'Spectator' && !isHost && !seatPending && (
            <button
              onClick={() => requestPlayerSeat(slug).catch(() => {})}
              className="h-8 px-3 rounded-md text-xs bg-[var(--color-accent-soft)] hover:opacity-90 text-[var(--color-accent-fg)] inline-flex items-center gap-1.5 transition-colors"
              title="Ask host to give you a player seat"
            >
              <Hand size={12} /> Request to play
            </button>
          )}
          {isLoggedIn && viewerRole === 'Spectator' && !isHost && seatPending && (
            <span className="h-8 px-3 rounded-md text-xs bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)] inline-flex items-center gap-1.5 cursor-default" title="Waiting for host approval">
              <Loader2 size={11} className="animate-spin" /> Request pending
            </span>
          )}
          {/* Host can invite specific users by username. The
              recipient sees a toast + Accept button (handled by the
              global GameInviteHandler mounted at app level). */}
          {isHost && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="h-8 px-3 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-fg)] text-[var(--color-fg-dim)] inline-flex items-center gap-1.5 transition-colors"
              title="Invite a friend"
            >
              <UserPlus2 size={12} /> Invite
            </button>
          )}
          {/* Host's explicit "end room" — broadcasts RoomClosed so
              every participant bounces back to chat, and tears down
              the registry entry server-side. Confirmation dialog
              guards against accidental clicks since this is destructive. */}
          {isHost && (
            <button
              onClick={async () => {
                if (!window.confirm('End this room? All participants will be sent back to chat.')) return
                try { await endRoom(slug) }
                catch { /* hub error event will toast */ }
              }}
              className="h-8 px-3 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-dim)] inline-flex items-center gap-1.5 transition-colors"
              title="Close the room for everyone"
            >
              <DoorOpen size={12} /> End room
            </button>
          )}
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

      {/* DISCONNECT BANNER — shows when any seated player is in their
          60s grace window. Host gets a "skip wait" button to free the
          seat immediately. Renders above the board so it's the first
          thing anyone watching the room sees. */}
      {Object.keys(offlinePlayers).length > 0 && (
        <DisconnectBanner
          offlinePlayers={offlinePlayers}
          isHost={isHost}
          onSkip={(uid) => overrideGraceWait(slug, uid).catch(() => {})}
        />
      )}

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

          {/* SEATS — director-mode panel. Shows White / Black seats
              with their current occupant. For host in Lobby: empty seats
              get a "Sit here / Assign…" picker, filled seats get an X
              to unassign. For everyone else: just a read-only display
              so it's clear who's playing what colour. */}
          {chess && room.status === 'Lobby' && (
            <SeatsPanel
              snapshot={chess}
              isHost={isHost}
              myUserId={me?.userId ?? null}
              spectators={participants.filter(
                (p) => p.role === 'Spectator' &&
                  p.userId !== chess.whitePlayerId &&
                  p.userId !== chess.blackPlayerId,
              )}
              pendingRequestIds={new Set(pendingJoinRequests.map((r) => r.userId))}
              onAssign={(target, color) => assignChessSeat(slug, target, color).catch(() => {})}
              onUnassign={(color) => unassignChessSeat(slug, color).catch(() => {})}
            />
          )}

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

          {/* Requests panel — host sees this always so they can find it
              even when the room is quiet. The empty state guides them. */}
          {isHost && (
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
              {pendingJoinRequests.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-[var(--color-fg-mute)] italic">
                  No pending requests. When spectators ask to play, you'll see them here with approve / decline buttons.
                </p>
              ) : (
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
              )}
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

          {/* Host start button — chess needs both seats filled.
              Hint message shown when blocked so host knows what's missing. */}
          {isHost && room.status === 'Lobby' && chess && (
            chess.whitePlayerId && chess.blackPlayerId ? (
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
            ) : (
              <div className="shrink-0 rounded-md bg-[var(--color-warning-soft)] border border-[var(--color-warning-border)] px-3 py-2 text-[11px] text-[var(--color-warning-fg)] flex items-center gap-2">
                <Clock size={11} />
                Assign both seats above to start the game.
              </div>
            )
          )}
        </aside>
      </div>

      <InvitePlayerModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={async (targetUserId) => {
          try { await inviteToGameRoom(targetUserId, slug) }
          catch { /* error toast comes via hub Error event */ }
        }}
      />
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

// ============================================================
//  SeatsPanel — director-mode assignment UI
//
//  Renders two rows: White seat + Black seat. For each seat:
//   • If occupied → show name + (host-only) "X" to unassign
//   • If empty AND I'm host → show:
//       - "Sit here" button (self-assign)
//       - Spectator picker dropdown (assign anyone in room)
//   • If empty AND I'm NOT host → quiet "Empty" placeholder
//
//  Spectators with a pending seat request get a small badge in the
//  picker so the host knows who's actively asking.
// ============================================================
function SeatsPanel({
  snapshot, isHost, myUserId, spectators, pendingRequestIds,
  onAssign, onUnassign,
}: {
  snapshot: ChessStateSnapshot
  isHost: boolean
  myUserId: string | null
  spectators: { userId: string; username: string }[]
  pendingRequestIds: Set<string>
  onAssign: (targetUserId: string, color: ChessColor) => void
  onUnassign: (color: ChessColor) => void
}) {
  return (
    <div className="shrink-0 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--color-line)] flex items-center gap-2">
        <Crown size={11} className="text-[var(--color-accent-fg)]" />
        <span className="text-[10px] uppercase tracking-wide font-medium">
          Seats
        </span>
        {isHost && (
          <span className="ml-auto text-[9px] uppercase tracking-wide text-[var(--color-fg-mute)]">
            Director mode
          </span>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <SeatRow
          color="White"
          occupantId={snapshot.whitePlayerId}
          occupantName={snapshot.whitePlayerName}
          isHost={isHost}
          myUserId={myUserId}
          spectators={spectators}
          pendingRequestIds={pendingRequestIds}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
        <SeatRow
          color="Black"
          occupantId={snapshot.blackPlayerId}
          occupantName={snapshot.blackPlayerName}
          isHost={isHost}
          myUserId={myUserId}
          spectators={spectators}
          pendingRequestIds={pendingRequestIds}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      </div>
    </div>
  )
}

function SeatRow({
  color, occupantId, occupantName, isHost, myUserId,
  spectators, pendingRequestIds, onAssign, onUnassign,
}: {
  color: ChessColor
  occupantId: string | null
  occupantName: string | null
  isHost: boolean
  myUserId: string | null
  spectators: { userId: string; username: string }[]
  pendingRequestIds: Set<string>
  onAssign: (targetUserId: string, color: ChessColor) => void
  onUnassign: (color: ChessColor) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const swatchClass = color === 'White'
    ? 'bg-white border border-[var(--color-line-strong)]'
    : 'bg-neutral-900 border border-neutral-700'

  if (occupantId) {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1.5 rounded bg-[var(--color-bg)]">
        <span className={`w-4 h-4 rounded-sm shrink-0 ${swatchClass}`} />
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-mute)] w-12 shrink-0">
          {color}
        </span>
        <span className="text-xs flex-1 truncate">{occupantName ?? occupantId}</span>
        {isHost && (
          <button
            onClick={() => onUnassign(color)}
            className="h-6 w-6 rounded text-[var(--color-fg-mute)] hover:text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-soft)] inline-flex items-center justify-center transition-colors"
            title="Empty this seat"
            aria-label={`Empty ${color} seat`}
          >
            <X size={11} />
          </button>
        )}
      </div>
    )
  }

  // Empty seat
  if (!isHost) {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1.5 rounded bg-[var(--color-bg)] opacity-70">
        <span className={`w-4 h-4 rounded-sm shrink-0 ${swatchClass}`} />
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-mute)] w-12 shrink-0">
          {color}
        </span>
        <span className="text-[11px] italic text-[var(--color-fg-mute)]">
          Waiting for host to assign…
        </span>
      </div>
    )
  }

  // Empty seat, host view — sit-here + picker
  const selfAlreadyOnOtherSeat = false // host can always self-assign here; backend rejects duplicates
  return (
    <div className="rounded bg-[var(--color-bg)]">
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        <span className={`w-4 h-4 rounded-sm shrink-0 ${swatchClass}`} />
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-mute)] w-12 shrink-0">
          {color}
        </span>
        <span className="text-[11px] italic text-[var(--color-fg-mute)] flex-1">
          Empty
        </span>
        {myUserId && !selfAlreadyOnOtherSeat && (
          <button
            onClick={() => onAssign(myUserId, color)}
            className="h-6 px-2 rounded text-[10px] bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] hover:opacity-90 inline-flex items-center gap-1 transition-colors"
            title={`Sit here as ${color}`}
          >
            Sit here
          </button>
        )}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="h-6 px-2 rounded text-[10px] bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-fg)] inline-flex items-center gap-1 transition-colors"
          title="Assign a spectator to this seat"
        >
          Assign… <ChevronDown size={9} />
        </button>
      </div>
      {pickerOpen && (
        <div className="border-t border-[var(--color-line)] max-h-32 overflow-y-auto">
          {spectators.length === 0 ? (
            <p className="px-3 py-2 text-[10px] italic text-[var(--color-fg-mute)]">
              No spectators in room yet. Use the Invite button to bring someone in.
            </p>
          ) : (
            spectators.map((s) => (
              <button
                key={s.userId}
                onClick={() => { onAssign(s.userId, color); setPickerOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--color-surface-2)] flex items-center gap-2 transition-colors"
              >
                <span className="flex-1 truncate">{s.username}</span>
                {pendingRequestIds.has(s.userId) && (
                  <Badge tone="warning" size="sm">Asked</Badge>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
//  DisconnectBanner — countdown banner for any seated player who
//  is currently in their grace window.
//
//  Self-updating countdown (refs a 1s interval, cleaned up on
//  unmount + on offlinePlayers list change). Host gets a "Don't
//  wait" button per offline player to skip the timer.
// ============================================================
function DisconnectBanner({
  offlinePlayers, isHost, onSkip,
}: {
  offlinePlayers: Record<string, { username: string; seatColor: ChessColor; atUtc: string; graceSeconds: number }>
  isHost: boolean
  onSkip: (userId: string) => void
}) {
  // Tick once per second so the countdown updates. We just bump a
  // counter — actual seconds-left calculation reads atUtc + graceSeconds
  // from props every render, so no extra state needed.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = Date.now()
  const entries = Object.entries(offlinePlayers)
    .map(([userId, info]) => {
      const at = new Date(info.atUtc).getTime()
      const remaining = Math.max(0, Math.ceil((at + info.graceSeconds * 1000 - now) / 1000))
      return { userId, info, remaining }
    })
    .filter((e) => e.remaining > 0)

  if (entries.length === 0) return null

  return (
    <div className="shrink-0 bg-[var(--color-warning-soft)] border-b border-[var(--color-warning-border)] px-4 py-2 flex flex-col gap-1.5">
      {entries.map(({ userId, info, remaining }) => (
        <div key={userId} className="flex items-center gap-2 text-[12px] text-[var(--color-warning-fg)]">
          <Clock size={12} className="shrink-0" />
          <span className="flex-1">
            <strong>{info.username}</strong> left — seat <strong>{info.seatColor}</strong> held for {remaining}s.
          </span>
          {isHost && (
            <button
              onClick={() => onSkip(userId)}
              className="h-6 px-2 rounded text-[10px] bg-[var(--color-warning-border)] hover:bg-[var(--color-warning-fg)] hover:text-white text-[var(--color-warning-fg)] transition-colors"
              title="Skip the wait and free this seat now"
            >
              Don't wait
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
