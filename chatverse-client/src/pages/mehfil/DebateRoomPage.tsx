import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Flame, Hand, Send, Sparkles, Crown, X, Mic, MicOff,
  Shield, Star, BadgeCheck, Power, ChevronUp,
} from 'lucide-react'

import Button from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useDebateStore } from '../../stores/debateStore'
import { useDebateHub } from '../../hooks/useDebateHub'
import type {
  DebateFormat, DebatePreferredSide, DebateSeatDto, DebateSide,
} from '../../types/debate'
import type { MehfilRoomCard } from '../../types/mehfil'

// ============================================================
//  DebateRoomPage — standalone Mehfil specialisation.
//
//  Per the per-feature isolation policy:
//   • Mounted ONLY when MehfilPage detects room.templateKind === 'debate'.
//   • All state in debateStore, all wire calls via useDebateHub.
//   • All CSS scoped under cv-debate-* (see index.css §🔥 Debate).
//   • Audience never receives nomination bios. Monitor sees them via
//     the monitor sub-channel + GetNominationsForMonitor() return.
//
//  Two views packed into one page:
//   • Audience view (default) — stage + chat + nomination CTA
//   • Monitor sidebar (host only) — bio queue + assign/kick/ban/highlight
// ============================================================

const FORMATS: DebateFormat[] = ['1v1', '2v2', '3v3', '4v4', '5v5']
const PREMIUM_EMOJI = ['🔥', '👏', '💯', '🤔', '😂', '🫡', '👑', '💀']

type Props = {
  room: MehfilRoomCard
  iAmHost: boolean
  onLeave: () => void
  onEndRoom: () => void
}

export default function DebateRoomPage({ room, iAmHost, onLeave, onEndRoom }: Props) {
  const me = useAuthStore((s) => s.user)
  const hub = useDebateHub()
  const roomState = useDebateStore((s) => s.roomState)
  const monitorNominations = useDebateStore((s) => s.monitorNominations)
  const lastHighlight = useDebateStore((s) => s.lastHighlight)

  // ─── Join on mount, leave on unmount ──────────────────────────
  useEffect(() => {
    if (!hub.isConnected()) return
    hub.joinRoom(room.id).catch(() => {})
    return () => {
      hub.leaveRoom(room.id).catch(() => {})
      useDebateStore.getState().clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, hub.isConnected()])

  // ─── On becoming monitor, pull bios ────────────────────────────
  useEffect(() => {
    if (!iAmHost) return
    if (!hub.isConnected()) return
    hub.getNominationsForMonitor(room.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmHost, room.id, hub.isConnected()])

  // ─── Server-side kick / ban → navigate out ─────────────────────
  useEffect(() => {
    const onKicked = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    const onBanned = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    window.addEventListener('cv:debate-kicked', onKicked)
    window.addEventListener('cv:debate-banned', onBanned)
    return () => {
      window.removeEventListener('cv:debate-kicked', onKicked)
      window.removeEventListener('cv:debate-banned', onBanned)
    }
  }, [room.id, onLeave])

  // ─── Derived ───────────────────────────────────────────────────
  const round = roomState?.round ?? null
  const seats = roomState?.seats ?? []
  const messages = roomState?.messages ?? []
  const proSeats = seats.filter((s) => s.side === 'pro').sort((a, b) => a.position - b.position)
  const conSeats = seats.filter((s) => s.side === 'con').sort((a, b) => a.position - b.position)

  const amISeated = useMemo(
    () => seats.some((s) => s.occupantUserId === me?.userId),
    [seats, me?.userId],
  )
  const amINominated = useMemo(
    () => monitorNominations.some((n) => n.userId === me?.userId) ||
      messages.some(() => false), // (audience can't detect their own pending; UI uses local state)
    [monitorNominations, messages, me?.userId],
  )

  return (
    <div className="cv-debate-stage cv-pop p-4 sm:p-5 border border-[var(--color-line)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl shrink-0 inline-flex items-center justify-center text-2xl cv-halo shadow-lg"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}
          >
            <Flame size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
              <span>Debate</span>
              <span>·</span>
              <span>hosted by {room.hostUsername}</span>
              <BadgeCheck size={10} className="inline" />
            </div>
            <div className="text-lg sm:text-xl font-semibold cv-text-gradient mt-0.5 leading-tight">{room.title}</div>
            {room.description && (
              <p className="text-xs text-[var(--color-fg-dim)] mt-1 max-w-md leading-relaxed">{room.description}</p>
            )}
          </div>
        </div>
        <RoundStatusPill round={round} />
      </div>

      {/* Monitor controls bar */}
      {iAmHost && (
        <MonitorControlsBar
          roomId={room.id}
          round={round}
          onOpenRound={(fmt, mins) => hub.openRound(room.id, fmt, mins)}
          onEndRound={() => hub.endRound(room.id)}
          onEndRoom={onEndRoom}
        />
      )}

      {/* Stage — Pro vs Con */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-4 mt-4">
        <SideStage
          label="PRO"
          accent="#22c55e"
          seats={proSeats}
          iAmHost={iAmHost}
          highlightUserId={lastHighlight?.targetUserId ?? null}
          onUnseat={(uid) => hub.unseatUser(room.id, uid)}
        />
        <CenterDivider format={round?.format ?? null} round={round} />
        <SideStage
          label="CON"
          accent="#ef4444"
          seats={conSeats}
          iAmHost={iAmHost}
          highlightUserId={lastHighlight?.targetUserId ?? null}
          onUnseat={(uid) => hub.unseatUser(room.id, uid)}
        />
      </div>

      {/* Body — main column (chat) + sidebar (monitor only) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-5">
        <ChatColumn
          roomId={room.id}
          myUserId={me?.userId}
          iAmHost={iAmHost}
          amISeated={amISeated}
          amINominated={amINominated}
          pendingCount={roomState?.pendingNominationCount ?? 0}
          messages={messages}
          onSend={(content, isQuestion) =>
            isQuestion ? hub.sendQuestion(room.id, content) : hub.sendChat(room.id, content)}
          onNominate={(name, age, gender, pref) =>
            hub.nominate(room.id, name, age, gender, pref)}
          onWithdraw={() => hub.withdrawNomination(room.id)}
          onHighlight={(uid, mid) => hub.highlight(room.id, uid, mid)}
          onKick={(uid, reason) => hub.kick(room.id, uid, reason)}
          onBan={(uid, reason) => hub.ban(room.id, uid, reason)}
        />
        {iAmHost && (
          <MonitorSidebar
            nominations={monitorNominations}
            onAssign={(nominationId, side, position) =>
              hub.assignSeat(room.id, nominationId, side, position)}
            availableSeats={seats}
          />
        )}
      </div>

      {/* Footer leave */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={onLeave}
          className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Back to Mehfil
        </button>
        <div className="text-[10px] text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
          <MicOff size={10} /> Audio coming in v2 — text + nominations live now
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   RoundStatusPill — LIVE / open_nominations / ended badges.
───────────────────────────────────────────────────────────── */
function RoundStatusPill({ round }: { round: ReturnType<typeof useDebateStore.getState>['roomState'] extends infer T ? T extends { round: infer R } ? R : null : null }) {
  if (!round) {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-fg-faint)]">
        Waiting for round
      </span>
    )
  }
  if (round.status === 'live') {
    return (
      <span className="cv-debate-mic-pulse inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Live · {round.format}
      </span>
    )
  }
  if (round.status === 'ended') {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-fg-faint)]">
        Ended · {round.format}
      </span>
    )
  }
  return (
    <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
      Open nominations · {round.format}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────
   MonitorControlsBar — open / start / end actions.
───────────────────────────────────────────────────────────── */
function MonitorControlsBar({
  roomId, round, onOpenRound, onEndRound, onEndRoom,
}: {
  roomId: string
  round: any
  onOpenRound: (fmt: DebateFormat, mins?: number) => void
  onEndRound: () => void
  onEndRoom: () => void
}) {
  void roomId
  const [pickFormat, setPickFormat] = useState<DebateFormat>('1v1')

  return (
    <div className="cv-debate-monitor-rail rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] inline-flex items-center gap-1.5">
        <Shield size={12} /> Monitor
      </div>
      {!round || round.status === 'ended' ? (
        <>
          <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setPickFormat(f)}
                className={[
                  'px-2.5 h-7 text-[11px] font-mono transition-colors',
                  pickFormat === f
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                ].join(' ')}
              >
                {f}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={() => onOpenRound(pickFormat)} leftIcon={<ChevronUp size={12} />}>
            Open nominations
          </Button>
          <Button size="sm" variant="primary" onClick={() => onOpenRound(pickFormat, 30)} leftIcon={<Flame size={12} />}>
            Open + go live (30 min)
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={onEndRound} leftIcon={<X size={12} />}>
          End round
        </Button>
      )}
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onEndRoom} leftIcon={<Power size={12} />}>
          End Mehfil
        </Button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   SideStage — Pro/Con bracket with seats.
───────────────────────────────────────────────────────────── */
function SideStage({
  label, accent, seats, iAmHost, highlightUserId, onUnseat,
}: {
  label: 'PRO' | 'CON'
  accent: string
  seats: DebateSeatDto[]
  iAmHost: boolean
  highlightUserId: string | null
  onUnseat: (userId: string) => void
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: accent }}>
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {seats.length === 0 && (
          <div className="text-[11px] text-[var(--color-fg-faint)] py-2 px-2">
            No seats yet — monitor opens a round to populate.
          </div>
        )}
        {seats.map((s) => (
          <SeatTile
            key={s.id}
            seat={s}
            accent={accent}
            iAmHost={iAmHost}
            highlighted={highlightUserId === s.occupantUserId}
            onUnseat={() => s.occupantUserId && onUnseat(s.occupantUserId)}
          />
        ))}
      </div>
    </div>
  )
}

function SeatTile({
  seat, accent, iAmHost, highlighted, onUnseat,
}: {
  seat: DebateSeatDto
  accent: string
  iAmHost: boolean
  highlighted: boolean
  onUnseat: () => void
}) {
  const empty = !seat.occupantUserId
  return (
    <div
      className={[
        'cv-debate-seat relative rounded-md border px-2.5 h-10 flex items-center gap-2 transition-colors',
        empty
          ? 'border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]',
        highlighted ? 'cv-debate-highlight-burst' : '',
      ].join(' ')}
      style={empty ? undefined : { borderColor: accent }}
    >
      <div
        className="w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[10px] font-bold"
        style={{ background: empty ? 'transparent' : accent, color: empty ? accent : 'white', border: `1px solid ${accent}` }}
      >
        {seat.position + 1}
      </div>
      <div className="flex-1 min-w-0">
        {empty ? (
          <span className="text-[11px]">empty</span>
        ) : (
          <span className="text-sm font-medium truncate">{seat.occupantUsername}</span>
        )}
      </div>
      {!empty && <Mic size={12} className="text-[var(--color-fg-faint)]" />}
      {iAmHost && !empty && (
        <button
          onClick={onUnseat}
          className="text-[var(--color-fg-mute)] hover:text-[var(--color-danger)] transition-colors"
          title="Unseat"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function CenterDivider({ format, round }: { format: DebateFormat | null; round: any }) {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center px-2 text-[var(--color-fg-faint)]">
      <Sparkles size={14} />
      <div className="text-[10px] uppercase tracking-wider mt-1">{format ?? '—'}</div>
      {round?.endsAt && round.status === 'live' && (
        <Countdown endsAt={round.endsAt} />
      )}
    </div>
  )
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return <div className="text-[10px] mt-1">0:00</div>
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return <div className="text-[10px] mt-1 tabular-nums">{min}:{sec.toString().padStart(2, '0')}</div>
}

/* ─────────────────────────────────────────────────────────────
   ChatColumn — chat + composer + nomination CTA + premium emoji rail.
───────────────────────────────────────────────────────────── */
function ChatColumn({
  roomId, myUserId, iAmHost, amISeated, amINominated, pendingCount, messages,
  onSend, onNominate, onWithdraw, onHighlight, onKick, onBan,
}: {
  roomId: string
  myUserId: string | undefined
  iAmHost: boolean
  amISeated: boolean
  amINominated: boolean
  pendingCount: number
  messages: ReturnType<typeof useDebateStore.getState>['roomState'] extends infer T ? T extends { messages: infer M } ? M : never[] : never[]
  onSend: (content: string, isQuestion: boolean) => void
  onNominate: (name: string, age: number, gender: string, pref: DebatePreferredSide) => void
  onWithdraw: () => void
  onHighlight: (uid: string, mid?: string) => void
  onKick: (uid: string, reason?: string) => void
  onBan: (uid: string, reason?: string) => void
}) {
  void roomId
  const [draft, setDraft] = useState('')
  const [isQuestion, setIsQuestion] = useState(false)
  const [showNomineeForm, setShowNomineeForm] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [(messages as any[]).length])

  const send = () => {
    const t = draft.trim()
    if (!t) return
    onSend(t, isQuestion)
    setDraft('')
    setIsQuestion(false)
  }

  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] flex flex-col min-h-[360px] max-h-[60vh]">
      {/* Nomination CTA strip */}
      <div className="border-b border-[var(--color-line)] px-3 py-2 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-[var(--color-fg-faint)] inline-flex items-center gap-1">
          <Hand size={11} /> {pendingCount} {pendingCount === 1 ? 'hand' : 'hands'} raised
        </span>
        {!iAmHost && !amISeated && (
          amINominated ? (
            <button
              onClick={onWithdraw}
              className="ml-auto text-[var(--color-warning-fg)] hover:underline"
            >
              Withdraw nomination
            </button>
          ) : (
            <button
              onClick={() => setShowNomineeForm(true)}
              className="ml-auto text-[var(--color-accent-fg)] hover:underline inline-flex items-center gap-1"
            >
              <Hand size={11} /> Nominate yourself
            </button>
          )
        )}
        {amISeated && (
          <span className="ml-auto inline-flex items-center gap-1 text-emerald-300">
            <Mic size={11} /> You are on stage
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {(messages as any[]).length === 0 && (
          <p className="text-[11px] text-[var(--color-fg-mute)] text-center mt-3">
            No messages yet — open the debate by asking a question or making your case.
          </p>
        )}
        {(messages as any[]).map((m) => (
          <ChatBubble
            key={m.id}
            m={m}
            mine={m.senderUserId === myUserId}
            iAmHost={iAmHost}
            onHighlight={() => onHighlight(m.senderUserId, m.id)}
            onKick={() => onKick(m.senderUserId)}
            onBan={() => onBan(m.senderUserId)}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--color-line)] p-2 flex flex-col gap-1.5">
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={isQuestion ? 'Ask a question…' : 'Say something…'}
            className="flex-1 resize-none rounded-md cv-glass text-sm leading-relaxed p-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
          />
          <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send} leftIcon={<Send size={12} />}>
            {isQuestion ? 'Ask' : 'Send'}
          </Button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setIsQuestion((v) => !v)}
            className={[
              'h-6 px-2 rounded-full text-[10px] inline-flex items-center gap-1 transition-colors',
              isQuestion
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent-fg)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border border-[var(--color-line)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            <Hand size={10} /> Question
          </button>
          {PREMIUM_EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => setDraft((d) => d + e)}
              className="h-6 w-6 rounded-full inline-flex items-center justify-center text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)] border border-[var(--color-line)] transition-colors"
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {showNomineeForm && (
        <NominationFormModal
          onSubmit={(name, age, gender, pref) => {
            onNominate(name, age, gender, pref)
            setShowNomineeForm(false)
          }}
          onClose={() => setShowNomineeForm(false)}
        />
      )}
    </div>
  )
}

function ChatBubble({
  m, mine, iAmHost, onHighlight, onKick, onBan,
}: {
  m: any
  mine: boolean
  iAmHost: boolean
  onHighlight: () => void
  onKick: () => void
  onBan: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`group flex gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
        m.senderIsMonitor
          ? 'bg-[var(--color-accent-soft)] border border-[var(--color-accent-fg)] text-[var(--color-fg)]'
          : mine
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
      } ${m.isHighlighted ? 'cv-debate-highlight-burst' : ''}`}>
        <div className="text-[10px] opacity-70 inline-flex items-center gap-1">
          {m.senderUsername}
          {m.senderIsMonitor && <Shield size={9} />}
          {m.senderIsSeated && !m.senderIsMonitor && <Mic size={9} />}
          {m.isQuestion && <Hand size={9} />}
          {m.isHighlighted && <Star size={9} className="text-amber-300" />}
        </div>
        <div className="mt-0.5 break-words">{m.content}</div>
      </div>
      {iAmHost && !mine && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5">
          <button
            onClick={onHighlight}
            className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 inline-flex items-center justify-center"
            title="Highlight as good question"
          >
            <Star size={9} />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-5 h-5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] inline-flex items-center justify-center"
            title="Mod actions"
          >
            <Shield size={9} />
          </button>
          {open && (
            <div className="absolute mt-6 ml-6 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-xl p-1.5 z-10 flex flex-col gap-1">
              <button
                onClick={() => { onKick(); setOpen(false) }}
                className="text-[11px] px-2 py-1 rounded hover:bg-[var(--color-surface-2)] text-left"
              >
                Kick from room
              </button>
              <button
                onClick={() => { onBan(); setOpen(false) }}
                className="text-[11px] px-2 py-1 rounded hover:bg-[var(--color-danger-soft)] text-[var(--color-danger-fg)] text-left"
              >
                Ban from room
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NominationFormModal({
  onSubmit, onClose,
}: {
  onSubmit: (name: string, age: number, gender: string, pref: DebatePreferredSide) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [pref, setPref] = useState<DebatePreferredSide>('either')

  const can = name.trim().length > 0 && Number(age) >= 13 && Number(age) <= 120

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl max-h-[88vh] overflow-y-auto">
        <header className="p-4 border-b border-[var(--color-line)] sticky top-0 bg-[var(--color-surface-1)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Hand size={14} /> Nominate yourself for a seat
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            Your name + age + gender are visible <strong>only to the monitor</strong> to help them pick balanced debaters.
            Audience members see only your username on stage.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Real name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
              placeholder="What the monitor should call you"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Age</label>
              <input
                type="number"
                min={13}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Preferred side</label>
            <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
              {(['pro', 'con', 'either'] as DebatePreferredSide[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setPref(s)}
                  className={[
                    'px-3 h-7 text-[11px] capitalize',
                    pref === s
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <footer className="p-4 border-t border-[var(--color-line)] sticky bottom-0 bg-[var(--color-surface-1)]">
          <Button
            fullWidth
            variant="primary"
            disabled={!can}
            onClick={() => onSubmit(name.trim(), Number(age), gender || 'other', pref)}
            leftIcon={<Hand size={14} />}
          >
            Raise hand
          </Button>
        </footer>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   MonitorSidebar — privileged nomination queue + assign actions.
───────────────────────────────────────────────────────────── */
function MonitorSidebar({
  nominations, onAssign, availableSeats,
}: {
  nominations: import('../../types/debate').DebateNominationPrivate[]
  onAssign: (nominationId: string, side: DebateSide, position: number) => void
  availableSeats: DebateSeatDto[]
}) {
  const [picking, setPicking] = useState<string | null>(null)

  const emptyPro = availableSeats.filter((s) => s.side === 'pro' && !s.occupantUserId)
  const emptyCon = availableSeats.filter((s) => s.side === 'con' && !s.occupantUserId)

  return (
    <aside className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] inline-flex items-center gap-1.5">
        <Crown size={12} /> Nomination queue (private)
      </div>
      <p className="text-[10px] text-[var(--color-fg-mute)] leading-snug">
        Name + age + gender are visible to you only. Pick the side + seat number to place a nominee on stage.
      </p>
      {nominations.length === 0 && (
        <p className="text-[11px] text-[var(--color-fg-faint)] py-3 text-center">No hands raised yet.</p>
      )}
      {nominations.map((n) => (
        <div key={n.id} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-xs space-y-1">
          <div className="font-medium text-[var(--color-fg)] inline-flex items-center gap-1.5">
            {n.realName || n.username}
            <span className="text-[10px] text-[var(--color-fg-mute)]">· {n.username}</span>
          </div>
          <div className="text-[10px] text-[var(--color-fg-dim)] inline-flex items-center gap-2">
            <span>Age {n.age}</span>
            {n.gender && <span>· {n.gender}</span>}
            <span>· prefers {n.preferredSide}</span>
          </div>
          {picking === n.id ? (
            <div className="flex flex-col gap-1 pt-1">
              {emptyPro.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase text-emerald-300">Pro</span>
                  {emptyPro.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onAssign(n.id, 'pro', s.position); setPicking(null) }}
                      className="text-[10px] h-6 px-2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                    >
                      Seat {s.position + 1}
                    </button>
                  ))}
                </div>
              )}
              {emptyCon.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase text-red-300">Con</span>
                  {emptyCon.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onAssign(n.id, 'con', s.position); setPicking(null) }}
                      className="text-[10px] h-6 px-2 rounded-full bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                    >
                      Seat {s.position + 1}
                    </button>
                  ))}
                </div>
              )}
              {emptyPro.length === 0 && emptyCon.length === 0 && (
                <p className="text-[10px] text-[var(--color-fg-mute)]">All seats full — unseat someone first.</p>
              )}
              <button
                onClick={() => setPicking(null)}
                className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] self-start"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPicking(n.id)}
              className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent-fg)] inline-flex items-center gap-1"
            >
              <ChevronUp size={10} /> Assign seat
            </button>
          )}
        </div>
      ))}
    </aside>
  )
}
