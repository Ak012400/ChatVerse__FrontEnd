import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Users, Eye, Crown, Brain, Loader2,
  PhoneOff, Trophy, Copy, Check,
} from 'lucide-react'
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
  const { hubState, joinRoom, leaveRoom, startQuiz, submitAnswer, sendChat, submitReaction } = useGameHub()

  const snapshot = useGameStore((s) => s.snapshot)
  const currentQuestion = useGameStore((s) => s.currentQuestion)
  const lastReveal = useGameStore((s) => s.lastReveal)
  const scoreboard = useGameStore((s) => s.scoreboard)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const hasAnsweredCurrent = useGameStore((s) => s.hasAnsweredCurrent)
  const myChoiceIndex = useGameStore((s) => s.myChoiceIndex)
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
  roomName, roomSlug, status, viewerRole, hubState, onHangup,
}: {
  roomName: string
  roomSlug: string
  status: 'Lobby' | 'Playing' | 'Ended'
  viewerRole: 'Player' | 'Spectator' | null
  hubState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  onHangup: () => void
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
  participants, maxPlayers, isHost, hostUsername, hubState, onStart, chat, onSendChat,
}: {
  participants: ReturnType<typeof useGameStore.getState>['participants']
  maxPlayers: number
  isHost: boolean
  hostUsername: string
  hubState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  onStart: () => void
  chat: ReturnType<typeof useGameStore.getState>['chat']
  onSendChat: (t: string) => void
}) {
  const players = participants.filter((p) => p.role === 'Player')
  const spectators = participants.filter((p) => p.role === 'Spectator')

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

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ParticipantList
            title="Players"
            icon={<Users size={13} />}
            entries={players}
            totalSlots={maxPlayers}
          />
          <ParticipantList
            title="Spectators"
            icon={<Eye size={13} />}
            entries={spectators}
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
  title, icon, entries, totalSlots,
}: {
  title: string
  icon: React.ReactNode
  entries: ReturnType<typeof useGameStore.getState>['participants']
  totalSlots?: number
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
}) {
  // Compact mode = embedded inside the ChatPage. The host already has
  // a full chat panel alongside, so we drop our commentary rail and
  // shrink the scoreboard to leave the question card as much room as
  // possible.
  const cols = compactMode
    ? 'grid-cols-1 lg:grid-cols-[1fr_220px]'
    : 'grid-cols-1 lg:grid-cols-[1fr_280px_300px]'

  return (
    <div className={`h-full grid ${cols} gap-4 p-4 overflow-hidden`}>
      <section className="overflow-y-auto">
        <QuestionCard
          question={question}
          viewerRole={viewerRole}
          hasAnswered={hasAnswered}
          myChoiceIndex={myChoiceIndex}
          reveal={reveal}
          onAnswer={onAnswer}
        />
      </section>
      <aside className="overflow-hidden h-full">
        <Scoreboard entries={scoreboard} totalSlots={maxPlayers} compact={compactMode} />
      </aside>
      {!compactMode && (
        <aside className="overflow-hidden h-full hidden lg:block">
          <CommentaryChat messages={chat} onSend={onSendChat} />
        </aside>
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
  return (
    <div className={`h-full grid ${cols} gap-4 p-4 overflow-hidden`}>
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
  scoreboard, maxPlayers, onBackToHall, embedded,
}: {
  scoreboard: ReturnType<typeof useGameStore.getState>['scoreboard']
  maxPlayers: number
  onBackToHall: () => void
  embedded?: boolean
}) {
  const winner = scoreboard[0]
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
        <div className="max-w-xs mx-auto">
          <Scoreboard entries={scoreboard} totalSlots={maxPlayers} />
        </div>
        <Button
          size="lg"
          fullWidth
          leftIcon={<ArrowLeft size={15} />}
          onClick={onBackToHall}
          className="mt-6"
        >
          {embedded ? 'Close & return to chat' : 'Back to Gaming Hall'}
        </Button>
      </div>
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
