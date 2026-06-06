import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Users, Eye, Crown, Brain, Loader2,
  PhoneOff, Trophy, Copy, Check,
} from 'lucide-react'
import { gamesApi } from '../../api'
import { useGameHub } from '../../hooks/useGameHub'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import QuestionCard from '../../components/games/QuestionCard'
import Scoreboard from '../../components/games/Scoreboard'
import CommentaryChat from '../../components/games/CommentaryChat'

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

export default function QuizRoomPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const me = useAuthStore((s) => s.user)
  const { joinRoom, leaveRoom, startQuiz, submitAnswer, sendChat } = useGameHub()

  const snapshot = useGameStore((s) => s.snapshot)
  const currentQuestion = useGameStore((s) => s.currentQuestion)
  const lastReveal = useGameStore((s) => s.lastReveal)
  const scoreboard = useGameStore((s) => s.scoreboard)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const hasAnsweredCurrent = useGameStore((s) => s.hasAnsweredCurrent)
  const myChoiceIndex = useGameStore((s) => s.myChoiceIndex)

  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)

  // ─── Join sequence ─────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const run = async () => {
      try {
        // 1) Join as Player by default — backend falls back to Spectator
        //    automatically if the player slots are already full.
        const joinRes = await gamesApi.join(slug, 'Player')
        if (cancelled) return
        const assignedRole = joinRes.data.data.assignedRole
        if (joinRes.data.data.note) {
          showToast({
            type: 'info',
            title: 'Spectator mode',
            message: joinRes.data.data.note,
            duration: 3000,
          })
        }

        // 2) Snapshot — paint immediately so the room doesn't flash blank.
        const snapRes = await gamesApi.snapshot(slug)
        if (cancelled) return
        useGameStore.getState().applySnapshot(snapRes.data.data)
        useGameStore.getState().setRole(assignedRole)

        // 3) Hub attach — subscribes to live events.
        await joinRoom(slug)
        if (cancelled) return
        setJoining(false)
      } catch (err: any) {
        if (cancelled) return
        setJoinError(err.response?.data?.error ?? 'Could not enter the room.')
        setJoining(false)
      }
    }

    run()

    return () => {
      cancelled = true
      // Don't auto-leave on every effect re-run — only the explicit
      // hangup button calls leaveRoom. This effect's cleanup just
      // disposes our intent.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Detach hub + reset store ONLY when navigating away from this page.
  useEffect(() => {
    return () => {
      // Fire-and-forget; we don't want to block React's unmount.
      leaveRoom(slug).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const room = snapshot?.room
  const viewerRole = snapshot?.viewerRole ?? null
  const isHost = useMemo(
    () => !!room && !!me && participants.some((p) => p.userId === me.userId && p.isHost),
    [room, me, participants],
  )

  const handleHangup = async () => {
    await leaveRoom(slug)
    navigate('/games')
  }

  const handleStart = async () => {
    try { await startQuiz(slug) }
    catch (err: any) {
      showToast({
        type: 'danger',
        title: 'Could not start',
        message: err?.message ?? 'Try again.',
        duration: 3000,
      })
    }
  }

  const handleAnswer = (choiceIndex: number) => {
    if (!currentQuestion) return
    submitAnswer(slug, currentQuestion.id, choiceIndex).catch(() => {
      /* error toast comes via AnswerAck hub event */
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
        <Button size="sm" onClick={() => navigate('/games')} leftIcon={<ArrowLeft size={14} />}>
          Back to Gaming Hall
        </Button>
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
        onHangup={handleHangup}
      />

      <div className="flex-1 overflow-hidden">
        {room.status === 'Lobby' && (
          <LobbyView
            participants={participants}
            maxPlayers={room.maxPlayers}
            isHost={isHost}
            hostUsername={room.hostUsername}
            onStart={handleStart}
            chat={chat}
            onSendChat={(t) => sendChat(slug, t)}
          />
        )}

        {room.status === 'Playing' && currentQuestion && (
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
          />
        )}

        {room.status === 'Playing' && !currentQuestion && (
          <FullPageStatus icon={<Loader2 size={18} className="animate-spin" />}>
            Loading next question…
          </FullPageStatus>
        )}

        {room.status === 'Ended' && (
          <EndedView
            scoreboard={scoreboard}
            maxPlayers={room.maxPlayers}
            onBackToHall={() => navigate('/games')}
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
  roomName, roomSlug, status, viewerRole, onHangup,
}: {
  roomName: string
  roomSlug: string
  status: 'Lobby' | 'Playing' | 'Ended'
  viewerRole: 'Player' | 'Spectator' | null
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
  participants, maxPlayers, isHost, hostUsername, onStart, chat, onSendChat,
}: {
  participants: ReturnType<typeof useGameStore.getState>['participants']
  maxPlayers: number
  isHost: boolean
  hostUsername: string
  onStart: () => void
  chat: ReturnType<typeof useGameStore.getState>['chat']
  onSendChat: (t: string) => void
}) {
  const players = participants.filter((p) => p.role === 'Player')
  const spectators = participants.filter((p) => p.role === 'Spectator')

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
            <Button
              size="lg"
              leftIcon={<Play size={15} />}
              onClick={onStart}
              className="mt-5"
              disabled={players.length < 1}
            >
              Start quiz
            </Button>
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
  scoreboard, maxPlayers, chat, onAnswer, onSendChat,
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
}) {
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_280px_300px] gap-4 p-4 overflow-hidden">
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
        <Scoreboard entries={scoreboard} totalSlots={maxPlayers} />
      </aside>
      <aside className="overflow-hidden h-full hidden lg:block">
        <CommentaryChat messages={chat} onSend={onSendChat} />
      </aside>
    </div>
  )
}

// ============================================================
//  EndedView — final podium
// ============================================================

function EndedView({
  scoreboard, maxPlayers, onBackToHall,
}: {
  scoreboard: ReturnType<typeof useGameStore.getState>['scoreboard']
  maxPlayers: number
  onBackToHall: () => void
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
          Back to Gaming Hall
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
