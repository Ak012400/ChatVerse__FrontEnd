import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Play, Eye, Crown, Dices, Loader2, PhoneOff, Copy, Check, X, Hand,
} from 'lucide-react'
import { gamesApi } from '../../api'
import { useGameHub, HubNotReadyError } from '../../hooks/useGameHub'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import CommentaryChat from '../../components/games/CommentaryChat'
import LudoBoardPanel, { LUDO_COLORS, movableTokenIndexes } from '../../components/games/LudoBoardPanel'
import type { LudoColor } from '../../types/games'

// ============================================================
//  LudoRoomPage — /ludo/:slug full-screen room.
//
//  Mirrors the quiz room's hardened entry (snapshot→join→hub with
//  retries) and the chess room's director-mode seat management.
//  The board itself is pure render — see LudoBoardPanel.
// ============================================================

const ALL_COLORS: LudoColor[] = ['Red', 'Green', 'Yellow', 'Blue']

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const status = err?.response?.status
      if (status && status >= 400 && status < 500) throw err
      if (i < attempts - 1) {
        console.warn(`[LudoRoomPage] ${label} attempt ${i + 1} failed — retrying…`, err)
        await sleep(800 * (i + 1))
      }
    }
  }
  throw lastErr
}

export default function LudoRoomPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const me = useAuthStore((s) => s.user)
  const isLoggedIn = !!me && me.isGuest === false

  const {
    hubState, joinRoom, leaveRoom, sendChat, startQuiz, endRoom,
    getLudoState, ludoRoll, ludoMove,
    assignLudoSeat, unassignLudoSeat, requestLudoSeat,
  } = useGameHub()

  const snapshot = useGameStore((s) => s.snapshot)
  const ludo = useGameStore((s) => s.ludo)
  const participants = useGameStore((s) => s.participants)
  const chat = useGameStore((s) => s.chat)
  const mySeatRequested = useGameStore((s) => s.mySeatRequested)

  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [enterAttempt, setEnterAttempt] = useState(0)

  // ─── Entry (same hardened sequence as quiz) ─────────────────────
  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const run = async () => {
      setJoining(true)
      setJoinError(null)
      let step: 'snapshot' | 'join' | 'hub' = 'snapshot'
      try {
        const snapRes = await withRetry('snapshot', () => gamesApi.snapshot(slug))
        if (cancelled) return
        const snap = snapRes.data?.data
        if (!snap?.room) throw new Error('snapshot returned empty payload')
        useGameStore.getState().applySnapshot(snap)
        setJoining(false)

        step = 'join'
        const joinRes = await withRetry('join', () => gamesApi.join(slug, 'Player'))
        if (cancelled) return
        useGameStore.getState().setRole(joinRes.data.data?.assignedRole ?? 'Spectator')
        if (joinRes.data.data?.note) {
          showToast({ type: 'info', title: 'Audience', message: joinRes.data.data.note, duration: 3000 })
        }

        step = 'hub'
        try {
          await joinRoom(slug)
          await getLudoState(slug)
        } catch (hubErr) {
          console.warn('[LudoRoomPage] hub attach failed (will reconnect):', hubErr)
          showToast({
            type: 'warning',
            title: 'Live updates pending',
            message: 'Reconnecting to the game server…',
            duration: 2500,
          })
        }
      } catch (err: any) {
        if (cancelled) return
        const serverMsg = err?.response?.data?.error
        const statusCode = err?.response?.status
        const reason = serverMsg
          ? `${serverMsg} (HTTP ${statusCode ?? '?'})`
          : err?.message ?? 'unknown failure'
        console.error(`[LudoRoomPage] enter failed at "${step}":`, err)
        setJoinError(`${step} step failed — ${reason}`)
        setJoining(false)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enterAttempt])

  // Self-heal: every (re)connect re-attaches + refreshes the board.
  useEffect(() => {
    if (hubState !== 'connected' || !slug || joining) return
    joinRoom(slug).then(() => getLudoState(slug)).catch((err) => {
      console.warn('[LudoRoomPage] re-attach failed:', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubState])

  // RoomClosed (host ended / idle close) → everyone out.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { slug?: string } | undefined
      if (!detail?.slug || detail.slug !== slug) return
      navigate('/chat')
    }
    window.addEventListener('cv:room-closed', handler as EventListener)
    return () => window.removeEventListener('cv:room-closed', handler as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const room = snapshot?.room
  const isHost = useMemo(
    () => !!me && participants.some((p) => p.userId === me.userId && p.isHost),
    [me, participants],
  )
  const mySeat = ludo?.seats.find((s) => s.userId === me?.userId) ?? null
  const myColor = mySeat?.color ?? null
  const movable = ludo ? movableTokenIndexes(ludo, myColor) : []
  const isMyTurn = !!myColor && ludo?.currentTurn === myColor

  // Turn countdown (server deadline-driven).
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!ludo?.turnDeadlineUtc) { setRemaining(0); return }
    const tick = () => setRemaining(Math.max(0,
      Math.ceil((new Date(ludo.turnDeadlineUtc!).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [ludo?.turnDeadlineUtc])

  const handleLeave = async () => {
    await leaveRoom(slug)
    navigate('/chat')
  }

  if (joining) {
    return (
      <FullStatus icon={<Loader2 size={20} className="animate-spin" />}>
        Joining the room…
      </FullStatus>
    )
  }

  if (joinError || !room) {
    return (
      <FullStatus icon={<Dices size={20} className="text-[var(--color-danger-fg)]" />}>
        <p className="mb-3">{joinError ?? 'Room unavailable.'}</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" onClick={() => setEnterAttempt((a) => a + 1)} leftIcon={<Loader2 size={14} />}>
            Retry
          </Button>
          <Button size="sm" onClick={() => navigate('/chat')} leftIcon={<ArrowLeft size={14} />}>
            Back to chat
          </Button>
        </div>
      </FullStatus>
    )
  }

  const status = ludo?.status ?? room.status
  const winnerSeat = ludo?.winnerUserId
    ? ludo.seats.find((s) => s.userId === ludo.winnerUserId)
    : null

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      {/* ─── Header ─── */}
      <header className="shrink-0 px-5 py-3 border-b border-[var(--color-line)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Dices size={16} className="text-[var(--color-accent-fg)] shrink-0" />
          <h1 className="text-sm font-medium truncate">{room.name}</h1>
          {status === 'Lobby' && <Badge tone="accent" size="sm">Lobby</Badge>}
          {status === 'Playing' && <Badge tone="warning" size="sm" dot>Live</Badge>}
          {status === 'Ended' && <Badge tone="neutral" size="sm">Ended</Badge>}
          {myColor
            ? <Badge tone="success" size="sm">{myColor}</Badge>
            : <Badge tone="neutral" size="sm"><Eye size={9} /> Spectator</Badge>}
          {hubState === 'connected' && <Badge tone="success" size="sm" dot>Online</Badge>}
          {hubState !== 'connected' && <Badge tone="warning" size="sm" dot>Connecting…</Badge>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CopySlug slug={room.slug} />
          {isHost && (
            <button
              onClick={() => {
                if (window.confirm('Close this room for everyone?')) {
                  endRoom(slug).catch(() => {})
                }
              }}
              className="h-8 px-3 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-dim)] inline-flex items-center gap-1.5 transition-colors"
            >
              <X size={12} /> End room
            </button>
          )}
          <button
            onClick={handleLeave}
            className="h-8 px-3 rounded-md text-xs bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5 transition-colors"
          >
            <PhoneOff size={12} /> Leave
          </button>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4 overflow-hidden">
        <section className="overflow-y-auto flex flex-col items-center gap-4">
          {/* Winner banner */}
          {status === 'Ended' && (
            <div className="w-full max-w-[560px] text-center bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-4">
              <p className="text-lg font-semibold">
                🏆 {winnerSeat ? `${winnerSeat.username} (${winnerSeat.color}) wins!` : 'Game over'}
              </p>
              <Button size="sm" className="mt-3" leftIcon={<ArrowLeft size={13} />} onClick={() => navigate('/chat')}>
                Back to chat
              </Button>
            </div>
          )}

          {/* Dice + turn strip (playing only) */}
          {status === 'Playing' && ludo && (
            <DiceStrip
              ludo={ludo}
              isMyTurn={isMyTurn}
              remaining={remaining}
              onRoll={() => ludoRoll(slug).catch((err: any) => {
                const friendly = err instanceof HubNotReadyError ? err.message : err?.message ?? 'Try again.'
                showToast({ type: 'danger', title: 'Roll failed', message: friendly, duration: 2500 })
              })}
            />
          )}

          {/* Board */}
          {ludo ? (
            <LudoBoardPanel
              snapshot={ludo}
              myColor={myColor}
              movableTokens={movable}
              onTokenClick={(i) => ludoMove(slug, i).catch((err: any) => {
                const friendly = err instanceof HubNotReadyError ? err.message : err?.message ?? 'Try again.'
                showToast({ type: 'danger', title: 'Move failed', message: friendly, duration: 2500 })
              })}
            />
          ) : (
            <FullStatus icon={<Loader2 size={18} className="animate-spin" />}>
              Loading board…
            </FullStatus>
          )}

          {/* Lobby controls under the board */}
          {status === 'Lobby' && ludo && (
            <LobbyControls
              ludo={ludo}
              participants={participants}
              isHost={isHost}
              isLoggedIn={isLoggedIn}
              mySeatRequested={mySeatRequested}
              meUserId={me?.userId ?? null}
              onAssign={(uid, color) => assignLudoSeat(slug, uid, color).catch(() => {})}
              onUnassign={(color) => unassignLudoSeat(slug, color).catch(() => {})}
              onRequestSeat={() => requestLudoSeat(slug).catch(() => {})}
              onStart={() => startQuiz(slug).catch((err: any) => {
                const friendly = err instanceof HubNotReadyError ? err.message : err?.message ?? 'Try again.'
                showToast({ type: 'danger', title: 'Could not start', message: friendly, duration: 3000 })
              })}
              hubReady={hubState === 'connected'}
            />
          )}
        </section>

        <aside className="overflow-hidden h-full hidden lg:block">
          <CommentaryChat messages={chat} onSend={(t) => sendChat(slug, t)} />
        </aside>
      </div>
    </div>
  )
}

// ─── Dice + turn indicator ──────────────────────────────────────

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function DiceStrip({
  ludo, isMyTurn, remaining, onRoll,
}: {
  ludo: NonNullable<ReturnType<typeof useGameStore.getState>['ludo']>
  isMyTurn: boolean
  remaining: number
  onRoll: () => void
}) {
  const turnColor = ludo.currentTurn
  const turnSeat = ludo.seats.find((s) => s.color === turnColor)
  const canRoll = isMyTurn && ludo.pendingRoll == null
  const mustMove = isMyTurn && ludo.pendingRoll != null
  return (
    <div className="w-full max-w-[560px] flex items-center justify-between gap-3 bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md px-4 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {turnColor && (
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: LUDO_COLORS[turnColor].fill }}
          />
        )}
        <span className="text-xs truncate">
          {isMyTurn
            ? (mustMove ? 'Your turn — pick a glowing token' : 'Your turn — roll!')
            : `${turnSeat?.username ?? turnColor}'s turn`}
        </span>
        <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums shrink-0">
          ⏱ {remaining}s
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {ludo.lastRoll && (
          <span
            className="text-3xl leading-none"
            title={`${ludo.lastRoll.color} rolled ${ludo.lastRoll.value}`}
            style={{ color: LUDO_COLORS[ludo.lastRoll.color].fill }}
          >
            {DICE_FACES[ludo.lastRoll.value]}
          </span>
        )}
        <Button size="sm" leftIcon={<Dices size={14} />} onClick={onRoll} disabled={!canRoll}>
          Roll
        </Button>
      </div>
    </div>
  )
}

// ─── Lobby seat management ──────────────────────────────────────

function LobbyControls({
  ludo, participants, isHost, isLoggedIn, mySeatRequested, meUserId,
  onAssign, onUnassign, onRequestSeat, onStart, hubReady,
}: {
  ludo: NonNullable<ReturnType<typeof useGameStore.getState>['ludo']>
  participants: ReturnType<typeof useGameStore.getState>['participants']
  isHost: boolean
  isLoggedIn: boolean
  mySeatRequested: boolean
  meUserId: string | null
  onAssign: (userId: string, color: LudoColor) => void
  onUnassign: (color: LudoColor) => void
  onRequestSeat: () => void
  onStart: () => void
  hubReady: boolean
}) {
  const seatedIds = new Set(ludo.seats.map((s) => s.userId))
  const unseated = participants
    .filter((p) => !seatedIds.has(p.userId))
    .sort((a, b) =>
      Number(ludo.seatRequests.includes(b.userId)) -
      Number(ludo.seatRequests.includes(a.userId)))
  const meSeated = !!meUserId && seatedIds.has(meUserId)
  const canStart = hubReady && ludo.seats.length >= 2

  return (
    <div className="w-full max-w-[560px] space-y-3">
      {/* Seat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ALL_COLORS.map((color) => {
          const seat = ludo.seats.find((s) => s.color === color)
          return (
            <div
              key={color}
              className="rounded-md border p-2.5 text-center"
              style={{
                borderColor: LUDO_COLORS[color].fill,
                background: LUDO_COLORS[color].soft,
              }}
            >
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: LUDO_COLORS[color].fill }}>
                {color}
              </p>
              {seat ? (
                <>
                  <p className="text-xs font-medium truncate">{seat.username}</p>
                  {isHost && (
                    <button
                      onClick={() => onUnassign(color)}
                      className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-mute)] transition-colors"
                    >
                      Unseat
                    </button>
                  )}
                </>
              ) : (
                <p className="text-[10px] italic text-[var(--color-fg-mute)]">Empty</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Host: assign people to seats */}
      {isHost && unseated.length > 0 && (
        <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)] mb-2">
            Assign a seat
          </p>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {unseated.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-xs">
                <span className="truncate flex-1">
                  {p.username}
                  {p.isHost && <Crown size={10} className="inline ml-1 text-[var(--color-warning-fg)]" />}
                  {ludo.seatRequests.includes(p.userId) && (
                    <span title="Asked for a seat" className="ml-1">🙋</span>
                  )}
                </span>
                {ALL_COLORS.filter((c) => !ludo.seats.some((s) => s.color === c)).map((c) => (
                  <button
                    key={c}
                    onClick={() => onAssign(p.userId, c)}
                    className="w-5 h-5 rounded-full border border-[var(--color-line)] hover:scale-110 transition-transform"
                    style={{ background: LUDO_COLORS[c].fill }}
                    title={`Seat as ${c}`}
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Spectator: raise a hand */}
      {!isHost && !meSeated && isLoggedIn && (
        <div className="text-center">
          {mySeatRequested ? (
            <span className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-xs bg-[var(--color-warning-soft)] text-[var(--color-warning-fg)] cursor-default">
              <Hand size={13} /> Hand raised — waiting for the host
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
      {!isLoggedIn && (
        <p className="text-center text-[11px] text-[var(--color-fg-mute)]">
          You're watching as a guest — sign up to play.
        </p>
      )}

      {/* Host: start */}
      {isHost && (
        <div className="text-center">
          <Button size="lg" leftIcon={<Play size={15} />} onClick={onStart} disabled={!canStart}>
            Start game
          </Button>
          {!canStart && (
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-mute)]">
              {!hubReady ? 'Connecting to game server…' : 'Assign at least 2 seats to start'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Small shared bits ──────────────────────────────────────────

function CopySlug({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch { /* ignore */ }
      }}
      className="text-[10px] font-mono text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] px-2 py-1 rounded-md hover:bg-[var(--color-surface-2)] flex items-center gap-1 transition-colors"
      title="Copy invite link"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span className="hidden sm:inline">{slug}</span>
    </button>
  )
}

function FullStatus({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-mute)] p-6 text-center">
      <div className="mb-3">{icon}</div>
      {children}
    </div>
  )
}
