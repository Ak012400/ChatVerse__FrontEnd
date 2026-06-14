import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Users, Eye, Crown, Brain, Loader2,
  PhoneOff, Trophy, Copy, Check, X, Hand, MessageCircle,
} from 'lucide-react'
import { MobileBottomSheet } from '../../components/ui/MobileBottomSheet'
import { gamesApi } from '../../api'
import { useGameHub, HubNotReadyError } from '../../hooks/useGameHub'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import QuestionCard from '../../components/games/QuestionCard'
import Scoreboard from '../../components/games/Scoreboard'
import CommentaryChat from '../../components/games/CommentaryChat'
import JokesPanel from '../../components/games/JokesPanel'

// ============================================================
//  QuizRoomPage — main quiz UI.
//
//  Three view states based on room.status:
//    'Lobby'   → waiting screen with participant list + host's "Start"
//    'Playing' → 3-column layout: question + scoreboard + chat
//    'Ended'   → final podium with "Play again" / "Back to hall"
//
//  The page kicks off the join sequence on mount:
//    1) POST /game-rooms/{slug}/join   → register role server-side
//    2) GET  /game-rooms/{slug}        → fresh snapshot for first paint
//    3) hub.JoinRoom(slug)             → live event stream attaches
//
//  Step (2) is what saves us from a blank-screen-while-handshaking
//  flash — the snapshot covers everything until the first hub event
//  lands, which is usually within 200ms.
// ============================================================

interface QuizRoomPageProps {
  /** Optional explicit slug — when this component is embedded inside the
   *  ChatPage as a side panel, the slug comes from chat state rather
   *  than the URL. URL-based usage (route /games/:slug) leaves it
   *  undefined and falls back to useParams. */
  slug?: string
  /** Called instead of navigating to /games when the user hangs up.
   *  Embedded usage closes the panel; route usage navigates. */
  onLeave?: () => void
  /** Compact = fewer columns on the playing layout (drops the chat
   *  rail since the embedded host already has chat alongside). */
  compactMode?: boolean
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Retry transient failures (network errors, 5xx, timeouts) with a
 *  growing backoff. 4xx responses are permanent — the room is gone or
 *  the request is invalid — so those fail immediately. Keeps the entry
 *  sequence resilient to Render cold starts + flaky mobile networks. */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = err?.response?.status
      if (status && status >= 400 && status < 500) throw err
      if (i < attempts - 1) {
        console.warn(`[QuizRoomPage] ${label} attempt ${i + 1} failed — retrying…`, err)
        await sleep(800 * (i + 1))
      }
    }
  }
  throw lastErr
}

export default function QuizRoomPage({ slug: slugProp, onLeave, compactMode }: QuizRoomPageProps = {}) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp ?? params.slug ?? ''
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const me = useAuthStore((s) => s.user)
  const {
    hubState, joinRoom, leaveRoom, startQuiz, submitAnswer, sendChat,
    submitReaction, rematchQuiz, sendCheer, setQuizRole,
    requestQuizSeat, endRoom,
  } = useGameHub()

  const snapshot = useGameStore((s) => s.snapshot)
  const currentQuestion = useGameStore((s) => s.currentQuestion)
  const lastReveal = useGameStore((s) => s.lastReveal)
  const scoreboard = useGameStore((s) => s.scoreboard)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const hasAnsweredCurrent = useGameStore((s) => s.hasAnsweredCurrent)
  const myChoiceIndex = useGameStore((s) => s.myChoiceIndex)
  // Quiz v2 live-feedback state
  const answeredUserIds = useGameStore((s) => s.answeredUserIds)
  const cheers = useGameStore((s) => s.cheers)
  const expireCheer = useGameStore((s) => s.expireCheer)
  const seatRequestUserIds = useGameStore((s) => s.seatRequestUserIds)
  const mySeatRequested = useGameStore((s) => s.mySeatRequested)

  // Host ended the room (or idle-close fired) — bounce everyone out.
  // The hub's RoomClosed handler dispatches this window event.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { slug?: string } | undefined
      if (!detail?.slug || detail.slug !== slug) return
      if (onLeave) onLeave()
      else navigate('/games')
    }
    window.addEventListener('cv:room-closed', handler as EventListener)
    return () => window.removeEventListener('cv:room-closed', handler as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])
  // Jokes-mode state — null/empty unless room.type === 'Jokes'
  const currentJoke = useGameStore((s) => s.currentJoke)
  const jokeCounts = useGameStore((s) => s.jokeCounts)
  const lastJokeReveal = useGameStore((s) => s.lastJokeReveal)
  const jokesFinalStats = useGameStore((s) => s.jokesFinalStats)
  const myReaction = useGameStore((s) => s.myReaction)

  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  // Bumping this re-runs the whole entry sequence — wired to the
  // "Retry" button on the error screen.
  const [enterAttempt, setEnterAttempt] = useState(0)

  // ─── Entry sequence (redesigned) ───────────────────────────────
  //
  // Order: snapshot → join → hub.
  //   1) SNAPSHOT FIRST (read-only, cacheable) — paints the room
  //      immediately, even before our join lands. The old order
  //      (join first) kept users staring at "Joining…" through every
  //      transient hiccup.
  //   2) JOIN — idempotent; the creator was ALREADY auto-joined by
  //      POST /game-rooms at create time, so for them this is a
  //      no-op confirm that just returns their existing role.
  //   3) HUB — live events; non-fatal, auto-reconnect covers us.
  //
  // Each REST step retries transient failures (network / 5xx / cold
  // start) up to 3 times with backoff. 4xx fails fast — the room is
  // genuinely gone or the request is invalid; retrying won't help.
  //
  // Critical: we deliberately do NOT auto-leave on unmount. That
  // cleanup was racing with React StrictMode's double-mount in dev
  // — the first mount's cleanup would call leaveRoom() which kills
  // the SignalR connection AND wipes the store, and the second
  // mount would then race against a half-torn-down hub. Explicit
  // hangup button is the only path that frees the slot now.
  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const run = async () => {
      setJoining(true)
      setJoinError(null)
      let step: 'snapshot' | 'join' | 'hub' = 'snapshot'
      try {
        // 1) Snapshot — paint the room ASAP.
        const snapRes = await withRetry('snapshot', () => gamesApi.snapshot(slug))
        if (cancelled) return
        const snap = snapRes.data?.data
        if (!snap?.room) {
          throw new Error('snapshot returned empty payload')
        }
        useGameStore.getState().applySnapshot(snap)
        setJoining(false) // ← UI is interactive from here on

        // 2) Join — confirms/creates our participant row.
        step = 'join'
        const joinRes = await withRetry('join', () => gamesApi.join(slug, 'Player'))
        if (cancelled) return
        const assignedRole = joinRes.data.data?.assignedRole ?? 'Player'
        useGameStore.getState().setRole(assignedRole)
        if (joinRes.data.data?.note) {
          showToast({
            type: 'info',
            title: 'Spectator mode',
            message: joinRes.data.data.note,
            duration: 3000,
          })
        }

        // 3) Hub attach — subscribes to live events. Failure here
        //    isn't fatal: the REST snapshot covers everything we
        //    need to render the lobby. The hub will retry via
        //    .withAutomaticReconnect() in the background.
        step = 'hub'
        try {
          await joinRoom(slug)
        } catch (hubErr) {
          // Don't fail the whole page — log + toast and proceed.
          console.warn('[QuizRoomPage] hub.joinRoom failed (will reconnect):', hubErr)
          showToast({
            type: 'warning',
            title: 'Live updates pending',
            message: 'Reconnecting to the game server…',
            duration: 2500,
          })
        }
      } catch (err: any) {
        if (cancelled) return
        // Surface the exact failure so we can debug from the toast/console
        // rather than seeing the opaque "Could not enter" forever.
        const serverMsg = err?.response?.data?.error
        const statusCode = err?.response?.status
        const reason = serverMsg
          ? `${serverMsg} (HTTP ${statusCode ?? '?'})`
          : err?.message ?? 'unknown failure'
        console.error(`[QuizRoomPage] enter sequence failed at step "${step}":`, err)
        setJoinError(`${step} step failed — ${reason}`)
        setJoining(false)
      }
    }

    run()

    return () => {
      // Just mark this run as obsolete. Do NOT call leaveRoom here —
      // doing so makes a strict-mode double-mount race against itself.
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enterAttempt])

  // ─── Self-heal: re-attach on every hub connect ─────────────────
  // Root cause of "host stuck in Lobby while the quiz is on Q7": his
  // initial JoinRoom (group attach) failed, the connection later came
  // back, but nothing re-attached him to the SignalR group — so no
  // event ever reached him again. JoinRoom is idempotent server-side
  // (group add + fresh RoomSnapshot), so calling it on EVERY transition
  // to 'connected' both re-attaches and resyncs the whole room state.
  useEffect(() => {
    if (hubState !== 'connected' || !slug || joining) return
    joinRoom(slug).catch((err) => {
      console.warn('[QuizRoomPage] re-attach after connect failed:', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubState])

  const room = snapshot?.room
  const viewerRole = snapshot?.viewerRole ?? null
  const isHost = useMemo(
    () => !!room && !!me && participants.some((p) => p.userId === me.userId && p.isHost),
    [room, me, participants],
  )

  const handleHangup = async () => {
    await leaveRoom(slug)
    // Embedded host overrides this — close the panel and let the user
    // stay in the chat. Route-mode falls back to navigating to the hall.
    if (onLeave) onLeave()
    else navigate('/games')
  }

  const handleStart = async () => {
    // ─── Pre-flight validations ────────────────────────────────
    // Surface clear, actionable messages BEFORE invoking — this is
    // what was previously bubbling up as the cryptic "WebSocket
    // failed to connect" log line. Order matters: check the cheapest
    // thing (hub state) before the round-trip.

    if (hubState !== 'connected') {
      const reason =
        hubState === 'failed'      ? 'Game server is not reachable. Try refreshing the page.' :
        hubState === 'connecting'  ? 'Still connecting to the game server. Try again in a second.' :
                                     'Not connected to the game server yet.'
      showToast({
        type: 'warning',
        title: 'Hold on…',
        message: reason,
        duration: 3000,
      })
      return
    }

    // Solo start safety net — server permits 1 player, but if the host
    // is alone they probably meant to wait for others. Warn first
    // instead of silently launching.
    const playerCount = participants.filter((p) => p.role === 'Player').length
    if (playerCount < 2) {
      const proceed = window.confirm(
        'You are alone in the room. Start the quiz anyway?\n\nYou can keep waiting for others to join.',
      )
      if (!proceed) return
    }

    try {
      await startQuiz(slug)
    } catch (err: any) {
      // HubNotReadyError comes from our wrapper — show its friendly
      // message verbatim. Everything else is unexpected and gets a
      // generic fallback with the underlying reason for debugging.
      const friendly = err instanceof HubNotReadyError
        ? err.message
        : err?.message ?? 'Try again.'
      showToast({
        type: 'danger',
        title: 'Could not start',
        message: friendly,
        duration: 3500,
      })
    }
  }

  const handleAnswer = (choiceIndex: number) => {
    if (!currentQuestion) return
    // NOT fire-and-forget (#148): if the invoke never reaches the hub
    // (HubNotReadyError, dropped socket) there will be no AnswerAck —
    // the old silent catch made the click look completely dead. The
    // hook already rolled back the optimistic lock; we surface why.
    submitAnswer(slug, currentQuestion.id, choiceIndex).catch((err: any) => {
      const friendly = err instanceof HubNotReadyError
        ? err.message
        : err?.message ?? 'Try again.'
      showToast({
        type: 'danger',
        title: 'Answer not sent',
        message: friendly,
        duration: 3000,
      })
    })
  }

  // Jokes-mode reaction submit. Same error-surfacing contract as
  // handleAnswer (#148).
  const handleReact = (reaction: 'Laugh' | 'Meh' | 'Skull' | 'EyeRoll') => {
    if (!currentJoke) return
    submitReaction(slug, currentJoke.id, reaction).catch((err: any) => {
      const friendly = err instanceof HubNotReadyError
        ? err.message
        : err?.message ?? 'Try again.'
      showToast({
        type: 'danger',
        title: 'Reaction not sent',
        message: friendly,
        duration: 3000,
      })
    })
  }

  // ─── Render branches ───────────────────────────────────────────

  if (joining) {
    return (
      <FullPageStatus icon={<Loader2 size={20} className="animate-spin" />}>
        Joining the room…
      </FullPageStatus>
    )
  }

  if (joinError || !room) {
    return (
      <FullPageStatus icon={<Brain size={20} className="text-[var(--color-danger-fg)]" />}>
        <p className="mb-3">{joinError ?? 'Room unavailable.'}</p>
        <div className="flex items-center justify-center gap-2">
          {/* Retry re-runs the whole entry sequence — most entry
              failures are transient (cold start, network blip). */}
          <Button
            size="sm"
            onClick={() => setEnterAttempt((a) => a + 1)}
            leftIcon={<Loader2 size={14} />}
          >
            Retry
          </Button>
          <Button
            size="sm"
            onClick={() => (onLeave ? onLeave() : navigate('/games'))}
            leftIcon={<ArrowLeft size={14} />}
          >
            {onLeave ? 'Close' : 'Back to Gaming Hall'}
          </Button>
        </div>
      </FullPageStatus>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <RoomHeader
        roomName={room.name}
        roomSlug={room.slug}
        status={room.status}
        viewerRole={viewerRole}
        hubState={hubState}
        onHangup={handleHangup}
        isHost={isHost}
        onEndRoom={() => {
          // Confirm — closing kicks EVERYONE out, any time, any state.
          if (window.confirm('Close this room for everyone?')) {
            endRoom(slug).catch(() => { /* Error event toasts the reason */ })
          }
        }}
      />

      <div className="flex-1 overflow-hidden">
        {room.status === 'Lobby' && (
          <LobbyView
            participants={participants}
            maxPlayers={room.maxPlayers}
            isHost={isHost}
            hostUsername={room.hostUsername}
            hubState={hubState}
            onStart={handleStart}
            chat={chat}
            onSendChat={(t) => sendChat(slug, t)}
            onSetRole={(uid, role) => setQuizRole(slug, uid, role).catch(() => {
              /* server Error event toasts the reason */
            })}
            seatRequestUserIds={seatRequestUserIds}
            canRequestSeat={!isHost && viewerRole === 'Spectator'}
            mySeatRequested={mySeatRequested}
            onRequestSeat={() => requestQuizSeat(slug).catch(() => {
              /* QuizSeatAck / Error event toasts the reason */
            })}
          />
        )}

        {/* Game-type dispatch for Playing state. Quiz/Trivia rooms
            (room.type === 'Quiz') use PlayingView with question card +
            scoreboard. Jokes rooms route to JokesPlayingView which
            wraps JokesPanel with the same chat-rail layout. */}
        {room.status === 'Playing' && room.type === 'Jokes' && (
          <JokesPlayingView
            joke={currentJoke}
            counts={jokeCounts}
            reveal={lastJokeReveal}
            finalStats={jokesFinalStats}
            viewerRole={viewerRole}
            myReaction={myReaction}
            chat={chat}
            onReact={handleReact}
            onSendChat={(t) => sendChat(slug, t)}
            compactMode={compactMode}
          />
        )}

        {room.status === 'Playing' && room.type !== 'Jokes' && currentQuestion && (
          <PlayingView
            question={currentQuestion}
            reveal={lastReveal}
            viewerRole={viewerRole}
            hasAnswered={hasAnsweredCurrent}
            myChoiceIndex={myChoiceIndex}
            scoreboard={scoreboard}
            maxPlayers={room.maxPlayers}
            chat={chat}
            onAnswer={handleAnswer}
            onSendChat={(t) => sendChat(slug, t)}
            compactMode={compactMode}
            participants={participants}
            answeredUserIds={answeredUserIds}
            cheers={cheers}
            onCheer={(emoji) => sendCheer(slug, emoji).catch(() => { /* fire-and-forget */ })}
            onExpireCheer={expireCheer}
            isHost={isHost}
            onSetRole={(uid, role) => setQuizRole(slug, uid, role).catch(() => {
              /* server Error event toasts the reason */
            })}
            seatRequestUserIds={seatRequestUserIds}
            canRequestSeat={!isHost && viewerRole === 'Spectator'}
            mySeatRequested={mySeatRequested}
            onRequestSeat={() => requestQuizSeat(slug).catch(() => {
              /* QuizSeatAck / Error event toasts the reason */
            })}
          />
        )}

        {room.status === 'Playing' && room.type !== 'Jokes' && !currentQuestion && (
          <FullPageStatus icon={<Loader2 size={18} className="animate-spin" />}>
            Loading next question…
          </FullPageStatus>
        )}

        {room.status === 'Ended' && room.type === 'Jokes' && (
          <JokesEndedView
            finalStats={jokesFinalStats}
            onBackToHall={() => (onLeave ? onLeave() : navigate('/games'))}
            embedded={!!onLeave}
          />
        )}

        {room.status === 'Ended' && room.type !== 'Jokes' && (
          <EndedView
            scoreboard={scoreboard}
            maxPlayers={room.maxPlayers}
            onBackToHall={() => (onLeave ? onLeave() : navigate('/games'))}
            embedded={!!onLeave}
            isHost={isHost}
            onRematch={() => rematchQuiz(slug).catch((err: any) => {
              showToast({
                type: 'danger',
                title: 'Rematch failed',
                message: err?.message ?? 'Try again.',
                duration: 3000,
              })
            })}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
//  Header — room identity + leave button
// ============================================================

function RoomHeader({
  roomName, roomSlug, status, viewerRole, hubState, onHangup, isHost, onEndRoom,
}: {
  roomName: string
  roomSlug: string
  status: 'Lobby' | 'Playing' | 'Ended'
  viewerRole: 'Player' | 'Spectator' | null
  hubState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  onHangup: () => void
  /** Host-only: close the room for EVERYONE, any time, any state. */
  isHost?: boolean
  onEndRoom?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <header className="shrink-0 px-5 py-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Brain size={16} className="text-[var(--color-accent-fg)] shrink-0" />
        <h1 className="text-sm font-medium truncate">{roomName}</h1>
        {status === 'Lobby'   && <Badge tone="accent"    size="sm">Lobby</Badge>}
        {status === 'Playing' && <Badge tone="warning" size="sm" dot>Live</Badge>}
        {status === 'Ended'   && <Badge tone="neutral" size="sm">Ended</Badge>}
        {viewerRole === 'Spectator' && (
          <Badge tone="neutral" size="sm">
            <Eye size={9} /> Spectator
          </Badge>
        )}
        {/* Connection indicator — gives the user a heads-up that
            "Start" / "Submit" might be blocked, before they click it. */}
        {hubState === 'connected'    && <Badge tone="success" size="sm" dot>Online</Badge>}
        {hubState === 'connecting'   && <Badge tone="warning" size="sm" dot>Connecting…</Badge>}
        {hubState === 'failed'       && <Badge tone="danger"  size="sm" dot>Offline</Badge>}
        {hubState === 'disconnected' && <Badge tone="neutral" size="sm" dot>Idle</Badge>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={copyLink}
          className="text-[10px] font-mono text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] px-2 py-1 rounded-md hover:bg-[var(--color-surface-2)] flex items-center gap-1 transition-colors"
          title="Copy invite link"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span className="hidden sm:inline">{roomSlug}</span>
        </button>
        {/* Host's nuclear option — always visible to the owner so the
            room is closeable from Lobby, mid-game, or Ended. */}
        {isHost && onEndRoom && (
          <button
            onClick={onEndRoom}
            className="h-8 px-3 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-dim)] inline-flex items-center gap-1.5 transition-colors"
            title="Close this room for everyone"
          >
            <X size={12} />
            End room
          </button>
        )}
        <button
          onClick={onHangup}
          className="h-8 px-3 rounded-md text-xs bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <PhoneOff size={12} />
          Leave
        </button>
      </div>
    </header>
  )
}

// ============================================================
//  LobbyView — pre-game roster + host start button
// ============================================================

function LobbyView({
  participants, maxPlayers, isHost, hostUsername, hubState, onStart, chat, onSendChat, onSetRole,
  seatRequestUserIds, canRequestSeat, mySeatRequested, onRequestSeat,
}: {
  participants: ReturnType<typeof useGameStore.getState>['participants']
  maxPlayers: number
  isHost: boolean
  hostUsername: string
  hubState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  onStart: () => void
  chat: ReturnType<typeof useGameStore.getState>['chat']
  onSendChat: (t: string) => void
  /** Director mode: host seats/unseats. Undefined for non-hosts. */
  onSetRole?: (userId: string, role: 'Player' | 'Spectator') => void
  seatRequestUserIds?: string[]
  canRequestSeat?: boolean
  mySeatRequested?: boolean
  onRequestSeat?: () => void
}) {
  const players = participants.filter((p) => p.role === 'Player')
  const spectators = participants.filter((p) => p.role === 'Spectator')
  const seatsFree = players.length < maxPlayers

  // Start button gates on TWO conditions:
  //   1. Hub must be live (else invoke would 404 with the cryptic
  //      "endpoint may not be a SignalR endpoint" error)
  //   2. At least one player must exist (server enforces ≥1 too,
  //      but client-side gate avoids a round-trip on the empty case)
  const canStart = hubState === 'connected' && players.length >= 1
  const startHint =
    hubState === 'failed'      ? 'Server unreachable — refresh page' :
    hubState === 'connecting'  ? 'Connecting to server…' :
    hubState !== 'connected'   ? 'Waiting for game server' :
    players.length < 1         ? 'Need at least one player' :
    players.length < 2         ? 'You can start alone, or wait for others' :
                                 null

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4 overflow-hidden">
      <section className="overflow-y-auto">
        <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-6 text-center">
          <Brain size={28} className="mx-auto text-[var(--color-accent-fg)] mb-3" />
          <h2 className="text-lg font-semibold mb-1">Waiting to start</h2>
          <p className="text-sm text-[var(--color-fg-mute)]">
            Host <span className="font-medium text-[var(--color-fg-dim)]">{hostUsername}</span> will start when ready.
          </p>

          {isHost && (
            <>
              <Button
                size="lg"
                leftIcon={<Play size={15} />}
                onClick={onStart}
                className="mt-5"
                disabled={!canStart}
              >
                Start quiz
              </Button>
              {startHint && (
                <p className="mt-2 text-[11px] text-[var(--color-fg-mute)]">{startHint}</p>
              )}
            </>
          )}
        </div>

        {/* Director-mode: spectator raises a hand instead of begging
            in chat. Host sees the 🙋 badge + can one-click seat them. */}
        {canRequestSeat && onRequestSeat && (
          <div className="mt-4">
            {mySeatRequested ? (
              <span className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-xs bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)] cursor-default">
                <Hand size={13} /> Hand raised — waiting for {hostUsername}
              </span>
            ) : (
              <button
                onClick={onRequestSeat}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-xs bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
              >
                <Hand size={13} /> Request a seat
              </button>
            )}
          </div>
        )}
        {!isHost && !canRequestSeat && (
          <p className="mt-3 text-[11px] text-center text-[var(--color-fg-mute)]">
            {hostUsername} picks who plays.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ParticipantList
            title="Players"
            icon={<Users size={13} />}
            entries={players}
            totalSlots={maxPlayers}
            action={isHost && onSetRole
              ? (p) => (
                <button
                  onClick={() => onSetRole(p.userId, 'Spectator')}
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-mute)] transition-colors"
                  title="Move to spectators"
                >
                  Unseat
                </button>
              )
              : undefined}
          />
          <ParticipantList
            title="Spectators"
            icon={<Eye size={13} />}
            entries={[...spectators].sort((a, b) =>
              // Raised hands float to the top of the host's list.
              Number((seatRequestUserIds ?? []).includes(b.userId)) -
              Number((seatRequestUserIds ?? []).includes(a.userId)))}
            action={(p) => (
              <>
                {(seatRequestUserIds ?? []).includes(p.userId) && (
                  <span title="Asked for a seat" className="text-[11px]">🙋</span>
                )}
                {isHost && onSetRole && (
                  <button
                    onClick={() => seatsFree && onSetRole(p.userId, 'Player')}
                    disabled={!seatsFree}
                    className={[
                      'ml-auto text-[10px] px-1.5 py-0.5 rounded transition-colors',
                      seatsFree
                        ? 'bg-[var(--color-accent-soft)] hover:opacity-80 text-[var(--color-accent-fg)]'
                        : 'bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] cursor-not-allowed',
                    ].join(' ')}
                    title={seatsFree ? 'Seat as player' : 'All seats full'}
                  >
                    + Seat
                  </button>
                )}
              </>
            )}
          />
        </div>
      </section>

      <aside className="overflow-hidden h-full">
        <CommentaryChat messages={chat} onSend={onSendChat} />
      </aside>
    </div>
  )
}

function ParticipantList({
  title, icon, entries, totalSlots, action,
}: {
  title: string
  icon: React.ReactNode
  entries: ReturnType<typeof useGameStore.getState>['participants']
  totalSlots?: number
  /** Director mode: optional per-row action button (host only). */
  action?: (p: ReturnType<typeof useGameStore.getState>['participants'][number]) => React.ReactNode
}) {
  const empties = Math.max(0, (totalSlots ?? entries.length) - entries.length)
  return (
    <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--color-fg-mute)]">{icon}</span>
        <span className="text-xs font-medium">{title}</span>
        <span className="ml-auto text-[10px] text-[var(--color-fg-mute)] tabular-nums">
          {entries.length}{totalSlots ? `/${totalSlots}` : ''}
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((p) => (
          <li key={p.userId} className="flex items-center gap-2 px-2 py-1 rounded text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            <span>{p.username}</span>
            {p.isHost && <Crown size={10} className="text-[var(--color-warning-fg)]" />}
            {action?.(p)}
          </li>
        ))}
        {empties > 0 && Array.from({ length: empties }).map((_, i) => (
          <li key={`e-${i}`} className="flex items-center gap-2 px-2 py-1 rounded text-xs opacity-40">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-line)]" />
            <span className="italic text-[var(--color-fg-mute)]">Empty seat</span>
          </li>
        ))}
        {entries.length === 0 && empties === 0 && (
          <li className="text-[10px] text-[var(--color-fg-mute)] italic px-2 py-1">
            No one yet.
          </li>
        )}
      </ul>
    </div>
  )
}

// ============================================================
//  PlayingView — 3-column layout: question + chat + scoreboard
// ============================================================

function PlayingView({
  question, reveal, viewerRole, hasAnswered, myChoiceIndex,
  scoreboard, maxPlayers, chat, onAnswer, onSendChat, compactMode,
  participants, answeredUserIds, cheers, onCheer, onExpireCheer,
  isHost, onSetRole,
  seatRequestUserIds, canRequestSeat, mySeatRequested, onRequestSeat,
}: {
  question: NonNullable<ReturnType<typeof useGameStore.getState>['currentQuestion']>
  reveal: ReturnType<typeof useGameStore.getState>['lastReveal']
  viewerRole: 'Player' | 'Spectator' | null
  hasAnswered: boolean
  myChoiceIndex: number | null
  scoreboard: ReturnType<typeof useGameStore.getState>['scoreboard']
  maxPlayers: number
  chat: ReturnType<typeof useGameStore.getState>['chat']
  onAnswer: (i: number) => void
  onSendChat: (t: string) => void
  compactMode?: boolean
  participants: ReturnType<typeof useGameStore.getState>['participants']
  answeredUserIds: string[]
  cheers: ReturnType<typeof useGameStore.getState>['cheers']
  onCheer: (emoji: string) => void
  onExpireCheer: (id: number) => void
  isHost?: boolean
  onSetRole?: (userId: string, role: 'Player' | 'Spectator') => void
  seatRequestUserIds?: string[]
  canRequestSeat?: boolean
  mySeatRequested?: boolean
  onRequestSeat?: () => void
}) {
  // Compact mode = embedded inside the ChatPage. The host already has
  // a full chat panel alongside, so we drop our commentary rail and
  // shrink the scoreboard to leave the question card as much room as
  // possible.
  const cols = compactMode
    ? 'grid-cols-1 lg:grid-cols-[1fr_220px]'
    : 'grid-cols-1 lg:grid-cols-[1fr_280px_300px]'

  // Mobile commentary drawer toggle — chat is hidden on phones since
  // there's no horizontal room for a 300px rail. Open via floating
  // button below; same UX as Music Lounge.
  const [showMobileChat, setShowMobileChat] = useState(false)

  return (
    <div className={`h-full grid ${cols} gap-3 sm:gap-4 p-3 sm:p-4 overflow-hidden`}>
      {/* relative wrapper so the cheer overlay floats over the card */}
      <section className="overflow-y-auto relative">
        <AnsweredChips
          participants={participants}
          answeredUserIds={answeredUserIds}
        />
        <QuestionCard
          question={question}
          viewerRole={viewerRole}
          hasAnswered={hasAnswered}
          myChoiceIndex={myChoiceIndex}
          reveal={reveal}
          onAnswer={onAnswer}
        />
        {/* Anyone can hype — spectators especially. Players see it too
            (cheering your rival's wrong answer is half the fun). */}
        <CheerBar onCheer={onCheer} />
        {/* Mid-game hand-raise — host can seat them from the side panel
            without leaving the question. */}
        {canRequestSeat && onRequestSeat && (
          <div className="flex justify-center mt-2">
            {mySeatRequested ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-warning-fg)]">
                <Hand size={11} /> Hand raised — host will seat you
              </span>
            ) : (
              <button
                onClick={onRequestSeat}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-accent-fg)] hover:underline"
              >
                <Hand size={11} /> Want to play? Request a seat
              </button>
            )}
          </div>
        )}
        <CheerOverlay cheers={cheers} onExpire={onExpireCheer} />
      </section>
      <aside className="overflow-hidden h-full flex flex-col gap-3">
        <div className="flex-1 min-h-0">
          <Scoreboard entries={scoreboard} totalSlots={maxPlayers} compact={compactMode} />
        </div>
        {/* Director mode mid-game: host can seat a late spectator
            without waiting for the lobby — they start at 0 and can
            answer from the next question. */}
        {isHost && onSetRole && (
          <HostAudiencePanel
            participants={participants}
            maxPlayers={maxPlayers}
            onSetRole={onSetRole}
            seatRequestUserIds={seatRequestUserIds ?? []}
          />
        )}
      </aside>
      {!compactMode && (
        <aside className="overflow-hidden h-full hidden lg:block">
          <CommentaryChat messages={chat} onSend={onSendChat} />
        </aside>
      )}

      {/* Mobile commentary — same chat surface, opened via a floating
          button + bottom sheet so phones aren't excluded from the
          conversation. Hidden in compactMode (embedded ChatPage host
          already has the real chat sidebar). */}
      {!compactMode && (
        <>
          <button
            type="button"
            onClick={() => setShowMobileChat(true)}
            className="lg:hidden fixed bottom-4 right-3 z-30
                       flex items-center gap-1.5 h-10 px-3 rounded-full
                       bg-[var(--color-accent)] text-white text-xs font-semibold shadow-lg
                       active:scale-[0.96] transition-transform"
            aria-label="Open commentary chat"
          >
            <MessageCircle size={14} />
            Chat{chat.length > 0 ? ` · ${chat.length}` : ''}
          </button>

          <MobileBottomSheet
            open={showMobileChat}
            onClose={() => setShowMobileChat(false)}
            title="Commentary"
            heightVh={75}
          >
            <CommentaryChat messages={chat} onSend={onSendChat} />
          </MobileBottomSheet>
        </>
      )}
    </div>
  )
}

// ============================================================
//  JokesPlayingView — Jokes-mode wrapper around JokesPanel.
//
//  Same overall layout as PlayingView (game panel left, optional
//  chat rail right) but routes the centre column through JokesPanel
//  instead of QuestionCard + Scoreboard.
// ============================================================

function JokesPlayingView({
  joke, counts, reveal, finalStats, viewerRole, myReaction,
  chat, onReact, onSendChat, compactMode,
}: {
  joke: ReturnType<typeof useGameStore.getState>['currentJoke']
  counts: ReturnType<typeof useGameStore.getState>['jokeCounts']
  reveal: ReturnType<typeof useGameStore.getState>['lastJokeReveal']
  finalStats: ReturnType<typeof useGameStore.getState>['jokesFinalStats']
  viewerRole: 'Player' | 'Spectator' | null
  myReaction: ReturnType<typeof useGameStore.getState>['myReaction']
  chat: ReturnType<typeof useGameStore.getState>['chat']
  onReact: (r: 'Laugh' | 'Meh' | 'Skull' | 'EyeRoll') => void
  onSendChat: (t: string) => void
  compactMode?: boolean
}) {
  const cols = compactMode
    ? 'grid-cols-1'
    : 'grid-cols-1 lg:grid-cols-[1fr_300px]'
  // Mobile commentary drawer toggle — same as PlayingView.
  const [showMobileChat, setShowMobileChat] = useState(false)
  return (
    <div className={`h-full grid ${cols} gap-3 sm:gap-4 p-3 sm:p-4 overflow-hidden`}>
      <section className="overflow-y-auto">
        <JokesPanel
          joke={joke}
          counts={counts}
          reveal={reveal}
          finalStats={finalStats}
          viewerRole={viewerRole}
          myReaction={myReaction}
          onReact={onReact}
        />
      </section>
      {!compactMode && (
        <aside className="overflow-hidden h-full hidden lg:block">
          <CommentaryChat messages={chat} onSend={onSendChat} />
        </aside>
      )}

      {/* Mobile commentary — same chat surface, opened via a floating
          button + bottom sheet so phones aren't excluded from the
          conversation. Hidden in compactMode (embedded ChatPage host
          already has the real chat sidebar). */}
      {!compactMode && (
        <>
          <button
            type="button"
            onClick={() => setShowMobileChat(true)}
            className="lg:hidden fixed bottom-4 right-3 z-30
                       flex items-center gap-1.5 h-10 px-3 rounded-full
                       bg-[var(--color-accent)] text-white text-xs font-semibold shadow-lg
                       active:scale-[0.96] transition-transform"
            aria-label="Open commentary chat"
          >
            <MessageCircle size={14} />
            Chat{chat.length > 0 ? ` · ${chat.length}` : ''}
          </button>

          <MobileBottomSheet
            open={showMobileChat}
            onClose={() => setShowMobileChat(false)}
            title="Commentary"
            heightVh={75}
          >
            <CommentaryChat messages={chat} onSend={onSendChat} />
          </MobileBottomSheet>
        </>
      )}
    </div>
  )
}

// ============================================================
//  JokesEndedView — wraps JokesPanel's final leaderboard with a
//  back-to-hall / close button so the layout matches EndedView.
// ============================================================

function JokesEndedView({
  finalStats, onBackToHall, embedded,
}: {
  finalStats: ReturnType<typeof useGameStore.getState>['jokesFinalStats']
  onBackToHall: () => void
  embedded?: boolean
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-4">
        <JokesPanel
          joke={null}
          counts={{ Laugh: 0, Meh: 0, Skull: 0, EyeRoll: 0 }}
          reveal={null}
          finalStats={finalStats}
          viewerRole={null}
          myReaction={null}
          onReact={() => {}}
        />
        <div className="mt-4">
          <Button
            size="lg"
            fullWidth
            leftIcon={<ArrowLeft size={15} />}
            onClick={onBackToHall}
          >
            {embedded ? 'Close & return to chat' : 'Back to Gaming Hall'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
//  EndedView — final podium
// ============================================================

function EndedView({
  scoreboard, maxPlayers, onBackToHall, embedded, isHost, onRematch,
}: {
  scoreboard: ReturnType<typeof useGameStore.getState>['scoreboard']
  maxPlayers: number
  onBackToHall: () => void
  embedded?: boolean
  isHost?: boolean
  onRematch?: () => void
}) {
  const winner = scoreboard[0]
  // Podium order: 2nd | 1st | 3rd — the classic Olympic layout.
  const podium = [scoreboard[1], scoreboard[0], scoreboard[2]]
  const podiumHeights = ['h-16', 'h-24', 'h-12']
  const podiumMedals = ['🥈', '🥇', '🥉']
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-6 py-10 text-center">
        <Trophy size={36} className="mx-auto text-[var(--color-warning-fg)] mb-3" />
        <h2 className="text-xl font-semibold mb-1">Game over!</h2>
        {winner ? (
          <p className="text-sm text-[var(--color-fg-mute)] mb-6">
            <span className="font-medium text-[var(--color-fg)]">{winner.username}</span>
            {' '}wins with {winner.score} points 🎉
          </p>
        ) : (
          <p className="text-sm text-[var(--color-fg-mute)] mb-6">No scores recorded.</p>
        )}

        {/* Quiz v2 podium — rises in with a scoped keyframe */}
        {scoreboard.length > 0 && (
          <>
            <style>{`
              @keyframes cv-podium-rise {
                from { transform: translateY(24px); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
              }
            `}</style>
            <div className="flex items-end justify-center gap-2 mb-6">
              {podium.map((e, i) => e ? (
                <div
                  key={e.userId}
                  className="flex flex-col items-center w-24"
                  style={{ animation: `cv-podium-rise 0.5s ease ${i * 0.15}s backwards` }}
                >
                  <span className="text-2xl mb-1">{podiumMedals[i]}</span>
                  <span className="text-xs font-medium truncate w-full">{e.username}</span>
                  <span className="text-[10px] text-[var(--color-fg-mute)] mb-1">{e.score} pts</span>
                  <div
                    className={`w-full ${podiumHeights[i]} rounded-t-md bg-[var(--color-accent-soft)] border border-b-0 border-[var(--color-accent-fg)]`}
                  />
                </div>
              ) : <div key={`empty-${i}`} className="w-24" />)}
            </div>
          </>
        )}

        <div className="max-w-xs mx-auto">
          <Scoreboard entries={scoreboard} totalSlots={maxPlayers} />
        </div>

        {/* Host-only rematch — same room, same settings, fresh scores */}
        {isHost && onRematch && (
          <Button
            size="lg"
            fullWidth
            leftIcon={<Play size={15} />}
            onClick={onRematch}
            className="mt-6"
          >
            Rematch — same crew, new questions
          </Button>
        )}
        <Button
          size="lg"
          fullWidth
          leftIcon={<ArrowLeft size={15} />}
          onClick={onBackToHall}
          className={isHost ? 'mt-2' : 'mt-6'}
        >
          {embedded ? 'Close & return to chat' : 'Back to Gaming Hall'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
//  Quiz v2 — live feedback components
// ============================================================

/** Chips showing who has locked in an answer for the current question
 *  (no choice revealed — just "done" state). */
function AnsweredChips({
  participants, answeredUserIds,
}: {
  participants: ReturnType<typeof useGameStore.getState>['participants']
  answeredUserIds: string[]
}) {
  const players = participants.filter((p) => p.role === 'Player')
  if (players.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)] mr-1">
        Answered {answeredUserIds.length}/{players.length}
      </span>
      {players.map((p) => {
        const done = answeredUserIds.includes(p.userId)
        return (
          <span
            key={p.userId}
            className={[
              'px-2 py-0.5 rounded-full text-[10px] border transition-colors',
              done
                ? 'bg-[var(--color-success-soft)] border-[var(--color-success-border)] text-[var(--color-success-fg)]'
                : 'bg-[var(--color-surface-2)] border-[var(--color-line)] text-[var(--color-fg-mute)]',
            ].join(' ')}
          >
            {done ? '✓ ' : ''}{p.username}
          </span>
        )
      })}
    </div>
  )
}

/** Director mode mid-game panel — compact spectator list with
 *  "+ Seat" buttons (and seated players with "Unseat"). Host only. */
function HostAudiencePanel({
  participants, maxPlayers, onSetRole, seatRequestUserIds = [],
}: {
  participants: ReturnType<typeof useGameStore.getState>['participants']
  maxPlayers: number
  onSetRole: (userId: string, role: 'Player' | 'Spectator') => void
  seatRequestUserIds?: string[]
}) {
  const players = participants.filter((p) => p.role === 'Player')
  // Raised hands first — those are the people actually waiting.
  const spectators = participants
    .filter((p) => p.role === 'Spectator')
    .sort((a, b) =>
      Number(seatRequestUserIds.includes(b.userId)) -
      Number(seatRequestUserIds.includes(a.userId)))
  const seatsFree = players.length < maxPlayers
  if (spectators.length === 0 && players.length === 0) return null
  return (
    <div className="shrink-0 bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-3 max-h-44 overflow-y-auto">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)] mb-2">
        Seats ({players.length}/{maxPlayers})
      </p>
      <ul className="space-y-1">
        {spectators.map((p) => (
          <li key={p.userId} className="flex items-center gap-2 text-xs">
            <span className="truncate flex-1">
              {p.username}
              {seatRequestUserIds.includes(p.userId) && (
                <span title="Asked for a seat" className="ml-1">🙋</span>
              )}
            </span>
            <button
              onClick={() => seatsFree && onSetRole(p.userId, 'Player')}
              disabled={!seatsFree}
              className={[
                'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                seatsFree
                  ? 'bg-[var(--color-accent-soft)] hover:opacity-80 text-[var(--color-accent-fg)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] cursor-not-allowed',
              ].join(' ')}
            >
              + Seat
            </button>
          </li>
        ))}
        {players.map((p) => (
          <li key={p.userId} className="flex items-center gap-2 text-xs opacity-75">
            <span className="truncate flex-1">{p.username} <span className="text-[var(--color-fg-mute)]">(playing)</span></span>
            <button
              onClick={() => onSetRole(p.userId, 'Spectator')}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-mute)] transition-colors"
            >
              Unseat
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Emoji hype row — broadcast to the whole room via SendCheer. */
function CheerBar({ onCheer }: { onCheer: (emoji: string) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-3">
      {['🔥', '👏', '😂', '💀', '🎉'].map((e) => (
        <button
          key={e}
          onClick={() => onCheer(e)}
          className="text-lg hover:scale-125 active:scale-95 transition-transform"
          title="Send a cheer"
        >
          {e}
        </button>
      ))}
    </div>
  )
}

/** Floating cheers — rise + fade, auto-expire from the store. */
function CheerOverlay({
  cheers, onExpire,
}: {
  cheers: ReturnType<typeof useGameStore.getState>['cheers']
  onExpire: (id: number) => void
}) {
  useEffect(() => {
    if (cheers.length === 0) return
    const timers = cheers.map((c) => setTimeout(() => onExpire(c.id), 2400))
    return () => { timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheers])

  if (cheers.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes cv-cheer-float {
          0%   { opacity: 0; transform: translateY(16px) scale(0.8); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-140px) scale(1.35); }
        }
      `}</style>
      {cheers.map((c, i) => (
        <div
          key={c.id}
          className="absolute bottom-8 text-2xl text-center"
          style={{
            left: `${12 + ((i * 17) % 70)}%`,
            animation: 'cv-cheer-float 2.4s ease-out forwards',
          }}
        >
          {c.emoji}
          <span className="block text-[9px] text-[var(--color-fg-mute)]">{c.username}</span>
        </div>
      ))}
    </div>
  )
}

// ============================================================
//  Shared status wrapper
// ============================================================

function FullPageStatus({
  icon, children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-mute)] p-6 text-center">
      <div className="mb-3">{icon}</div>
      {children}
    </div>
  )
}
