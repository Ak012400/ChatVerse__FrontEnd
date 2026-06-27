import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Flame, Mic, MicOff, Hand, Send, Shield, Crown, X, Lock, Globe,
  Copy, Check, Power, Sparkles, Volume2, BadgeCheck, ChevronUp,
} from 'lucide-react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant } from '@livekit/components-react'
import type { RoomOptions } from 'livekit-client'

import Button from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useStageBracketStore } from '../../stores/stageBracketStore'
import { useStageBracketHub } from '../../hooks/useStageBracketHub'
import type {
  StageBracketPrivacy, StageBracketPreferredSide,
  StageBracketSeatDto, StageBracketNominationPrivate,
} from '../../types/stageBracket'
import type { MehfilRoomCard } from '../../types/mehfil'

// ============================================================
//  DebateV2RoomPage — 5v5 debate stage with server-driven mic
//  rotation, audience challenge, and real-time LiveKit audio.
//
//  Architecture: shares the StageBracket backend with the upcoming
//  Roast page. Theme + labels are the only differences.
// ============================================================

const SECONDS_PER_TURN_OPTIONS = [60, 90, 120]
const ROUND_MINUTES_OPTIONS = [3, 5, 10]
const CHALLENGE_SECONDS_OPTIONS = [30, 60, 90]

const audioOnlyRoomOptions: RoomOptions = {
  adaptiveStream: true, dynacast: true,
  publishDefaults: { dtx: true, red: true },
}

type Props = {
  room: MehfilRoomCard
  iAmHost: boolean
  onLeave: () => void
  onEndRoom: () => void
}

export default function DebateV2RoomPage({ room, iAmHost, onLeave, onEndRoom }: Props) {
  const me = useAuthStore((s) => s.user)
  const hub = useStageBracketHub()
  const roomState = useStageBracketStore((s) => s.roomState)
  const seatNominations = useStageBracketStore((s) => s.seatNominations)
  const challengeNominations = useStageBracketStore((s) => s.challengeNominations)
  const micLivekit = useStageBracketStore((s) => s.micLivekit)

  const [showJoinPrompt, setShowJoinPrompt] = useState(false)
  const [inviteCodeInput, setInviteCodeInput] = useState('')

  // Join on mount
  useEffect(() => {
    if (!hub.isConnected()) return
    hub.joinRoom(room.id).catch((err) => {
      const msg = String(err?.message ?? '')
      if (msg.toLowerCase().includes('invite')) setShowJoinPrompt(true)
    })
    return () => {
      hub.leaveRoom(room.id).catch(() => {})
      useStageBracketStore.getState().clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, hub.isConnected()])

  // Host: pull bios
  useEffect(() => {
    if (!iAmHost || !hub.isConnected()) return
    hub.getNominationsForHost(room.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmHost, room.id, hub.isConnected()])

  // Re-fetch mic token whenever active speaker changes
  const activeSide = roomState?.round?.activeSide
  const activeSeatPos = roomState?.round?.activeSeatPosition
  const challengerUid = roomState?.round?.challengerUserId
  const roundLive = roomState?.round?.status === 'live'
  useEffect(() => {
    if (!roundLive) return
    hub.getActiveMicToken(room.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundLive, activeSide, activeSeatPos, challengerUid])

  // Kick/ban → leave
  useEffect(() => {
    const onKicked = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    const onBanned = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    window.addEventListener('cv:sb-kicked', onKicked)
    window.addEventListener('cv:sb-banned', onBanned)
    return () => {
      window.removeEventListener('cv:sb-kicked', onKicked)
      window.removeEventListener('cv:sb-banned', onBanned)
    }
  }, [room.id, onLeave])

  if (showJoinPrompt) {
    return (
      <InviteCodeGate
        value={inviteCodeInput}
        setValue={setInviteCodeInput}
        onSubmit={async () => {
          const s = await hub.joinRoom(room.id, inviteCodeInput.trim())
          if (s) setShowJoinPrompt(false)
        }}
        onBack={onLeave}
      />
    )
  }

  const config = roomState?.config
  const round = roomState?.round
  const seats = roomState?.seats ?? []
  const messages = roomState?.messages ?? []
  const leftSeats = useMemo(
    () => seats.filter((s) => s.side === 'left').sort((a, b) => a.position - b.position),
    [seats],
  )
  const rightSeats = useMemo(
    () => seats.filter((s) => s.side === 'right').sort((a, b) => a.position - b.position),
    [seats],
  )

  const myUid = me?.userId
  const amISeated = useMemo(() => seats.some((s) => s.occupantUserId === myUid), [seats, myUid])
  const amICurrentSpeaker = useMemo(() => {
    if (!round || round.status !== 'live') return false
    if (round.challengerUserId) return round.challengerUserId === myUid
    const activeSeat = seats.find(
      (s) => s.side === round.activeSide && s.position === round.activeSeatPosition,
    )
    return activeSeat?.occupantUserId === myUid
  }, [round, seats, myUid])
  const amINominated = seatNominations.some((n) => n.userId === myUid)

  return (
    <div className="cv-debate-v2-stage cv-pop p-4 sm:p-5 border border-[var(--color-line)] relative">
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
              <span>host: {room.hostUsername}</span>
              <BadgeCheck size={10} className="inline" />
            </div>
            <div className="text-lg sm:text-2xl font-semibold cv-text-gradient mt-0.5 leading-tight">{room.title}</div>
            <div className="text-xs text-[var(--color-fg-faint)] mt-1 inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {config?.privacy === 'private' ? <Lock size={11} /> : <Globe size={11} />}
                {config?.privacy ?? 'public'}
              </span>
              {config && <><span>·</span><span>{config.secondsPerTurn}s/turn · {config.roundDurationMinutes}min round</span></>}
            </div>
          </div>
        </div>
        <RoundStatusPill round={round ?? null} />
      </div>

      {/* Topic banner */}
      {round?.topic && (
        <div className="cv-debate-v2-topic mb-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Topic</div>
          <div className="text-sm font-medium text-[var(--color-fg)]">{round.topic}</div>
        </div>
      )}

      {/* Host controls */}
      {iAmHost && (
        <HostControlsBar
          config={config ?? null}
          round={round ?? null}
          onConfigure={(p, secs, mins, chal, topic) =>
            hub.configureRoom(room.id, 'debate', p, secs, mins, chal, topic)}
          onStartRound={() => hub.startRound(room.id)}
          onGoLive={() => hub.goLive(room.id)}
          onEndRound={() => hub.endRound(room.id)}
          onEndRoom={onEndRoom}
        />
      )}

      {/* The 5v5 stage */}
      <div className="cv-debate-v2-arena grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-4 mt-4">
        <SideStage
          label="PRO"
          accent="#22c55e"
          seats={leftSeats}
          activeSide={round?.activeSide ?? null}
          activeSeatPosition={round?.activeSeatPosition ?? -1}
          challengerActive={!!round?.challengerUserId}
          iAmHost={iAmHost}
          onUnseat={(uid) => hub.unseatUser(room.id, uid)}
        />
        <CenterColumn round={round ?? null} micLivekit={micLivekit} amICurrentSpeaker={amICurrentSpeaker} />
        <SideStage
          label="CON"
          accent="#ef4444"
          seats={rightSeats}
          activeSide={round?.activeSide ?? null}
          activeSeatPosition={round?.activeSeatPosition ?? -1}
          challengerActive={!!round?.challengerUserId}
          iAmHost={iAmHost}
          onUnseat={(uid) => hub.unseatUser(room.id, uid)}
        />
      </div>

      {/* Body — chat + host sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mt-5">
        <ChatColumn
          myUserId={myUid}
          amISeated={amISeated}
          amINominated={amINominated}
          pendingCount={roomState?.pendingNominationCount ?? 0}
          messages={messages}
          roundLive={round?.status === 'live'}
          onSendChat={(text) => hub.sendChat(room.id, text)}
          onNominate={(side, note) => hub.nominateForSeat(room.id, side, note)}
          onWithdrawNomination={() => hub.withdrawNomination(room.id)}
          onRaiseHandChallenge={(note) => hub.raiseHandToChallenge(room.id, note)}
        />
        {iAmHost ? (
          <HostSidebar
            seatNoms={seatNominations}
            challengeNoms={challengeNominations}
            onAssign={(nomId, side, pos) => hub.assignSeat(room.id, nomId, side, pos)}
            onRejectSeat={(nomId) => hub.rejectChallenge(room.id, nomId)}
            onApproveChallenge={(nomId) => hub.approveChallenge(room.id, nomId)}
            onRejectChallenge={(nomId) => hub.rejectChallenge(room.id, nomId)}
            seats={seats}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={onLeave}
          className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Back to Mehfil
        </button>
        <div className="text-[10px] text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
          <Mic size={10} /> {config?.secondsPerTurn ?? 90}s per turn · audience can raise hand to challenge
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Building blocks
───────────────────────────────────────────────────────────── */

function InviteCodeGate({
  value, setValue, onSubmit, onBack,
}: { value: string; setValue: (v: string) => void; onSubmit: () => void; onBack: () => void }) {
  return (
    <div className="cv-debate-v2-stage cv-pop p-6 sm:p-8 border border-[var(--color-line)] max-w-md mx-auto">
      <div className="text-center space-y-4">
        <div className="inline-flex w-14 h-14 rounded-full items-center justify-center cv-halo"
             style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
          <Lock size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold cv-text-gradient">Private Debate</h2>
          <p className="text-xs text-[var(--color-fg-dim)] mt-1">Enter the host's invite code.</p>
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="XXXXXXXX"
          className="w-full text-center font-mono tracking-widest text-lg px-4 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-orange-400 outline-none"
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" fullWidth onClick={onBack}>Cancel</Button>
          <Button variant="primary" size="sm" fullWidth onClick={onSubmit} disabled={value.length < 4}>Enter</Button>
        </div>
      </div>
    </div>
  )
}

function RoundStatusPill({ round }: { round: any | null }) {
  if (!round) {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-fg-faint)]">
        Waiting for host
      </span>
    )
  }
  if (round.status === 'live') {
    return (
      <span className="cv-debate-v2-pulse inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/40">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Live
      </span>
    )
  }
  if (round.status === 'ended') {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-fg-faint)]">
        Ended
      </span>
    )
  }
  return (
    <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
      Open seats
    </span>
  )
}

function HostControlsBar({
  config, round, onConfigure, onStartRound, onGoLive, onEndRound, onEndRoom,
}: {
  config: any | null
  round: any | null
  onConfigure: (privacy: StageBracketPrivacy, secs: number, mins: number, challenge: number, topic: string | null) => void
  onStartRound: () => void
  onGoLive: () => void
  onEndRound: () => void
  onEndRoom: () => void
}) {
  const [showConfig, setShowConfig] = useState(false)
  const [topicDraft, setTopicDraft] = useState(config?.hostTopic ?? '')
  useEffect(() => { setTopicDraft(config?.hostTopic ?? '') }, [config?.hostTopic])

  const isOpen = round?.status === 'open_seats'
  const isLive = round?.status === 'live'

  return (
    <div className="cv-debate-v2-monitor-rail rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-orange-300 inline-flex items-center gap-1.5">
        <Shield size={12} /> Host
      </div>
      <Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)} leftIcon={<Sparkles size={12} />}>
        {showConfig ? 'Hide config' : 'Config'}
      </Button>
      {!round || round.status === 'ended' ? (
        <Button size="sm" variant="primary" onClick={onStartRound} leftIcon={<Flame size={12} />}>
          Open new round
        </Button>
      ) : isOpen ? (
        <Button size="sm" variant="primary" onClick={onGoLive} leftIcon={<Mic size={12} />}>
          Go live (start mic rotation)
        </Button>
      ) : null}
      {isLive && (
        <Button size="sm" variant="ghost" onClick={onEndRound} leftIcon={<X size={12} />}>
          End round
        </Button>
      )}
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onEndRoom} leftIcon={<Power size={12} />}>
          End Mehfil
        </Button>
      </div>
      {showConfig && config && (
        <div className="basis-full mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
          <PrivacyPicker
            value={config.privacy}
            onChange={(p) => onConfigure(p, config.secondsPerTurn, config.roundDurationMinutes, config.challengeSlotSeconds, config.hostTopic)}
          />
          <NumberPills
            label="Sec / turn"
            options={SECONDS_PER_TURN_OPTIONS}
            value={config.secondsPerTurn}
            onChange={(n) => onConfigure(config.privacy, n, config.roundDurationMinutes, config.challengeSlotSeconds, config.hostTopic)}
          />
          <NumberPills
            label="Round min"
            options={ROUND_MINUTES_OPTIONS}
            value={config.roundDurationMinutes}
            onChange={(n) => onConfigure(config.privacy, config.secondsPerTurn, n, config.challengeSlotSeconds, config.hostTopic)}
          />
          <NumberPills
            label="Challenge s"
            options={CHALLENGE_SECONDS_OPTIONS}
            value={config.challengeSlotSeconds}
            onChange={(n) => onConfigure(config.privacy, config.secondsPerTurn, config.roundDurationMinutes, n, config.hostTopic)}
          />
          <div className="sm:col-span-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Topic (optional)</div>
            <div className="flex gap-1.5">
              <input
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value.slice(0, 200))}
                placeholder="Leave empty for random topic"
                className="flex-1 px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-orange-400 outline-none text-sm"
              />
              <Button
                size="sm" variant="ghost"
                onClick={() => onConfigure(config.privacy, config.secondsPerTurn, config.roundDurationMinutes, config.challengeSlotSeconds, topicDraft.trim() || null)}
              >Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PrivacyPicker({ value, onChange }: { value: StageBracketPrivacy; onChange: (v: StageBracketPrivacy) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Privacy</div>
      <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
        {(['public', 'private'] as StageBracketPrivacy[]).map((p) => (
          <button
            key={p} onClick={() => onChange(p)}
            className={[
              'px-2.5 h-7 capitalize',
              value === p ? 'bg-orange-500/20 text-orange-300' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {p === 'public' ? <Globe size={11} className="inline mr-1" /> : <Lock size={11} className="inline mr-1" />}
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumberPills({ label, options, value, onChange }: { label: string; options: number[]; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">{label}</div>
      <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
        {options.map((n) => (
          <button
            key={n} onClick={() => onChange(n)}
            className={[
              'px-2.5 h-7 font-mono',
              value === n ? 'bg-orange-500/20 text-orange-300' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >{n}</button>
        ))}
      </div>
    </div>
  )
}

function SideStage({
  label, accent, seats, activeSide, activeSeatPosition, challengerActive, iAmHost, onUnseat,
}: {
  label: 'PRO' | 'CON'
  accent: string
  seats: StageBracketSeatDto[]
  activeSide: string | null
  activeSeatPosition: number
  challengerActive: boolean
  iAmHost: boolean
  onUnseat: (uid: string) => void
}) {
  const myLabel = label === 'PRO' ? 'left' : 'right'
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: accent }}>
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {seats.map((s) => {
          const isActive = !challengerActive && activeSide === myLabel && activeSeatPosition === s.position
          return (
            <SeatTile
              key={s.id}
              seat={s}
              accent={accent}
              isActive={isActive}
              iAmHost={iAmHost}
              onUnseat={() => s.occupantUserId && onUnseat(s.occupantUserId)}
            />
          )
        })}
      </div>
    </div>
  )
}

function SeatTile({
  seat, accent, isActive, iAmHost, onUnseat,
}: {
  seat: StageBracketSeatDto
  accent: string
  isActive: boolean
  iAmHost: boolean
  onUnseat: () => void
}) {
  const empty = !seat.occupantUserId
  return (
    <div
      className={[
        'cv-debate-v2-seat relative rounded-md border px-2.5 h-10 flex items-center gap-2 transition-colors',
        empty
          ? 'border-dashed border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]',
        isActive ? 'cv-debate-v2-seat-active' : '',
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
        {empty ? <span className="text-[11px]">empty</span> : (
          <span className="text-sm font-medium truncate">{seat.occupantUsername}</span>
        )}
      </div>
      {isActive && <Mic size={12} className="text-emerald-300" />}
      {!isActive && !empty && <MicOff size={12} className="text-[var(--color-fg-mute)]" />}
      {iAmHost && !empty && (
        <button onClick={onUnseat} className="text-[var(--color-fg-mute)] hover:text-[var(--color-danger)]" title="Unseat">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function CenterColumn({
  round, micLivekit, amICurrentSpeaker,
}: {
  round: any | null
  micLivekit: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null
  amICurrentSpeaker: boolean
}) {
  const isLive = round?.status === 'live'
  return (
    <div className="hidden lg:flex flex-col items-center justify-start px-2 text-[var(--color-fg-faint)] gap-2">
      <Crown size={16} className="text-amber-300" />
      <div className="text-[10px] uppercase tracking-wider">vs</div>
      {isLive && round?.currentTurnEndsAt && (
        <TurnCountdown endsAt={round.currentTurnEndsAt} label="Turn" />
      )}
      {round?.challengerUsername && round.challengerEndsAt && (
        <div className="text-[10px] text-amber-300 inline-flex items-center gap-1">
          ⚡ {round.challengerUsername}
        </div>
      )}
      {round?.challengerEndsAt && (
        <TurnCountdown endsAt={round.challengerEndsAt} label="Chal" tone="amber" />
      )}
      {round?.endsAt && isLive && (
        <TurnCountdown endsAt={round.endsAt} label="Round" tone="dim" />
      )}

      {/* Hidden LiveKit room — provides audio. Performer publishes; everyone subscribes. */}
      {micLivekit && (
        <div style={{ height: 0, overflow: 'hidden' }}>
          <LiveKitRoom
            token={micLivekit.token}
            serverUrl={micLivekit.serverUrl}
            connect={true}
            audio={micLivekit.canPublish}
            video={false}
            options={audioOnlyRoomOptions}
            data-lk-theme="default"
          >
            <RoomAudioRenderer />
            {amICurrentSpeaker && <PerformerMicHelper />}
          </LiveKitRoom>
        </div>
      )}

      {amICurrentSpeaker && (
        <div className="cv-debate-v2-pulse mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 px-2 py-1 rounded-full">
          <Volume2 size={10} /> Your mic
        </div>
      )}
    </div>
  )
}

function TurnCountdown({ endsAt, label, tone }: { endsAt: string; label: string; tone?: 'amber' | 'dim' }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [])
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return <span className="text-[10px] text-[var(--color-warning-fg)]">{label} 0s</span>
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const r = sec % 60
  const text = min > 0 ? `${min}:${r.toString().padStart(2, '0')}` : `${r}s`
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'dim' ? 'text-[var(--color-fg-mute)]' : 'text-[var(--color-fg)]'
  return <div className={`text-[10px] tabular-nums ${color}`}>{label} {text}</div>
}

function PerformerMicHelper() {
  const { localParticipant } = useLocalParticipant()
  useEffect(() => {
    localParticipant?.setMicrophoneEnabled(true).catch(() => {})
  }, [localParticipant])
  return null
}

function ChatColumn({
  myUserId, amISeated, amINominated, pendingCount, messages, roundLive,
  onSendChat, onNominate, onWithdrawNomination, onRaiseHandChallenge,
}: {
  myUserId: string | undefined
  amISeated: boolean
  amINominated: boolean
  pendingCount: number
  messages: any[]
  roundLive: boolean
  onSendChat: (t: string) => void
  onNominate: (side: StageBracketPreferredSide, note: string) => void
  onWithdrawNomination: () => void
  onRaiseHandChallenge: (note: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [showSeatForm, setShowSeatForm] = useState(false)
  const [showChallengeForm, setShowChallengeForm] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const send = () => {
    const t = draft.trim()
    if (!t) return
    onSendChat(t)
    setDraft('')
  }

  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] flex flex-col min-h-[360px] max-h-[60vh]">
      <div className="border-b border-[var(--color-line)] px-3 py-2 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-[var(--color-fg-faint)] inline-flex items-center gap-1">
          <Hand size={11} /> {pendingCount} {pendingCount === 1 ? 'hand' : 'hands'}
        </span>
        {!amISeated && (
          amINominated ? (
            <button
              onClick={onWithdrawNomination}
              className="ml-auto text-[var(--color-warning-fg)] hover:underline"
            >Withdraw nomination</button>
          ) : (
            <button
              onClick={() => setShowSeatForm(true)}
              className="ml-auto text-[var(--color-accent-fg)] hover:underline inline-flex items-center gap-1"
            >
              <Hand size={11} /> Nominate yourself
            </button>
          )
        )}
        {!amISeated && roundLive && (
          <button
            onClick={() => setShowChallengeForm(true)}
            className="text-amber-300 hover:underline inline-flex items-center gap-1"
            title="Challenge a current speaker"
          >
            ⚡ Challenge
          </button>
        )}
        {amISeated && (
          <span className="ml-auto inline-flex items-center gap-1 text-emerald-300">
            <Mic size={11} /> You're on stage
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {messages.length === 0 && (
          <p className="text-[11px] text-[var(--color-fg-mute)] text-center mt-3">
            No messages yet — start the debate.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderUserId === myUserId
          return (
            <div key={m.id} className={`group flex gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                m.senderIsHost
                  ? 'bg-orange-500/20 border border-orange-400 text-[var(--color-fg)]'
                  : mine
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
              }`}>
                <div className="text-[10px] opacity-70 inline-flex items-center gap-1">
                  {m.senderUsername}
                  {m.senderIsHost && <Shield size={9} />}
                  {m.senderIsSeated && !m.senderIsHost && <Mic size={9} />}
                </div>
                <div className="mt-0.5 break-words">{m.content}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--color-line)] p-2 flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Say something…"
          className="flex-1 resize-none rounded-md cv-glass text-sm leading-relaxed p-2 border border-[var(--color-line)] focus:outline-none focus:border-orange-400"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
        />
        <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send} leftIcon={<Send size={12} />}>
          Send
        </Button>
      </div>

      {showSeatForm && (
        <NominationForm
          title="Take a seat"
          onSubmit={(side, note) => { onNominate(side, note); setShowSeatForm(false) }}
          onClose={() => setShowSeatForm(false)}
        />
      )}
      {showChallengeForm && (
        <ChallengeForm
          onSubmit={(note) => { onRaiseHandChallenge(note); setShowChallengeForm(false) }}
          onClose={() => setShowChallengeForm(false)}
        />
      )}
    </div>
  )
}

function NominationForm({
  title, onSubmit, onClose,
}: {
  title: string
  onSubmit: (side: StageBracketPreferredSide, note: string) => void
  onClose: () => void
}) {
  const [side, setSide] = useState<StageBracketPreferredSide>('either')
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl">
        <header className="p-4 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Hand size={14} className="text-orange-300" /> {title}
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            In public mode, server seats you automatically when a slot opens. In private mode, the host approves.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Preferred side</label>
            <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
              {(['left', 'right', 'either'] as StageBracketPreferredSide[]).map((s) => (
                <button
                  key={s} onClick={() => setSide(s)}
                  className={[
                    'px-3 h-7 text-[11px] capitalize',
                    side === s ? 'bg-orange-500/20 text-orange-300' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  {s === 'left' ? 'Pro' : s === 'right' ? 'Con' : 'Either'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Note (optional, host-only)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
              placeholder="Stance / angle"
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-orange-400 outline-none text-sm"
            />
          </div>
        </div>
        <footer className="p-4 border-t border-[var(--color-line)]">
          <Button
            fullWidth variant="primary"
            onClick={() => onSubmit(side, note.trim())}
            leftIcon={<Hand size={14} />}
          >Raise hand</Button>
        </footer>
      </div>
    </div>
  )
}

function ChallengeForm({
  onSubmit, onClose,
}: { onSubmit: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl">
        <header className="p-4 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            ⚡ Challenge the current speaker
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            If the host approves, the current speaker's mic mutes briefly while you get the floor.
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 120))}
            placeholder="What's your counterpoint?"
            className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none text-sm"
          />
        </div>
        <footer className="p-4 border-t border-[var(--color-line)]">
          <Button fullWidth variant="primary" onClick={() => onSubmit(note.trim())} leftIcon={<Hand size={14} />}>
            Send challenge request
          </Button>
        </footer>
      </div>
    </div>
  )
}

function HostSidebar({
  seatNoms, challengeNoms, onAssign, onRejectSeat, onApproveChallenge, onRejectChallenge, seats,
}: {
  seatNoms: StageBracketNominationPrivate[]
  challengeNoms: StageBracketNominationPrivate[]
  onAssign: (nomId: string, side: 'left' | 'right', pos: number) => void
  onRejectSeat: (nomId: string) => void
  onApproveChallenge: (nomId: string) => void
  onRejectChallenge: (nomId: string) => void
  seats: StageBracketSeatDto[]
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const emptyLeft = seats.filter((s) => s.side === 'left' && !s.occupantUserId)
  const emptyRight = seats.filter((s) => s.side === 'right' && !s.occupantUserId)

  return (
    <aside className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
      {/* Seat nominations */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-orange-300 inline-flex items-center gap-1.5">
          <Hand size={12} /> Seat queue ({seatNoms.length})
        </div>
        {seatNoms.length === 0 && (
          <p className="text-[11px] text-[var(--color-fg-faint)] py-2 text-center">No hands.</p>
        )}
        {seatNoms.map((n) => (
          <div key={n.id} className="mt-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2 text-xs space-y-1">
            <div className="font-medium inline-flex items-center gap-1.5">
              {n.username}
              <span className="text-[10px] text-[var(--color-fg-mute)]">· prefers {n.preferredSide}</span>
            </div>
            {n.note && <div className="text-[10px] italic text-[var(--color-fg-dim)]">"{n.note}"</div>}
            {picking === n.id ? (
              <div className="flex flex-col gap-1 pt-1">
                {emptyLeft.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] uppercase text-emerald-300">Pro</span>
                    {emptyLeft.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onAssign(n.id, 'left', s.position); setPicking(null) }}
                        className="text-[10px] h-6 px-2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                      >Seat {s.position + 1}</button>
                    ))}
                  </div>
                )}
                {emptyRight.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] uppercase text-red-300">Con</span>
                    {emptyRight.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onAssign(n.id, 'right', s.position); setPicking(null) }}
                        className="text-[10px] h-6 px-2 rounded-full bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                      >Seat {s.position + 1}</button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setPicking(null)}
                  className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] self-start"
                >Cancel</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 pt-1">
                <button
                  onClick={() => setPicking(n.id)}
                  className="text-[10px] h-6 px-2 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400 inline-flex items-center gap-1"
                ><ChevronUp size={10} /> Seat</button>
                <button
                  onClick={() => onRejectSeat(n.id)}
                  className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-surface-3)] text-[var(--color-fg-dim)]"
                >Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Challenge requests */}
      {challengeNoms.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 inline-flex items-center gap-1.5">
            ⚡ Challenge requests ({challengeNoms.length})
          </div>
          {challengeNoms.map((n) => (
            <div key={n.id} className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs space-y-1">
              <div className="font-medium">{n.username}</div>
              {n.note && <div className="text-[10px] italic text-[var(--color-fg-dim)]">"{n.note}"</div>}
              <div className="flex gap-1 pt-1">
                <button
                  onClick={() => onApproveChallenge(n.id)}
                  className="text-[10px] h-6 px-2 rounded-full bg-amber-500/30 text-amber-300 border border-amber-400"
                >⚡ Approve</button>
                <button
                  onClick={() => onRejectChallenge(n.id)}
                  className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-surface-3)] text-[var(--color-fg-dim)]"
                >Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

// Silence unused-import warnings for narrow checks.
void Copy; void Check
