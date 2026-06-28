import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Mic, MicOff, Crown, X, Lock, Globe, Copy, Check, ChevronUp,
  Power, Sparkles, Hand, Volume2, Star, Shield, Loader2,
} from 'lucide-react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant } from '@livekit/components-react'
import type { RoomOptions } from 'livekit-client'

import Button from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useOpenMicStore } from '../../stores/openMicStore'
import { useOpenMicHub } from '../../hooks/useOpenMicHub'
import {
  OPEN_MIC_REACTIONS, type OpenMicGender, type OpenMicPrivacy,
  type OpenMicQueueEntryPrivate,
} from '../../types/openMic'
import type { MehfilRoomCard } from '../../types/mehfil'

// ============================================================
//  OpenMicRoomPage — third per-template Mehfil specialisation.
//
//  Mounted ONLY when MehfilPage detects room.templateKind === 'open_mic'.
//  All state in openMicStore, wire via useOpenMicHub.
//  All CSS scoped under cv-openmic-* (see index.css §🎤 Open Mic).
// ============================================================

const SLOT_DURATIONS = [60, 180, 300]

const audioOnlyRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: { dtx: true, red: true },
}

type Props = {
  room: MehfilRoomCard
  iAmHost: boolean
  onLeave: () => void
  onEndRoom: () => void
  /** Optional — parity with DebateV2/Roast. MehfilPage auto-flips
   *  scheduled→live for open_mic templates on first open, so this
   *  prop is currently a no-op slot kept for future server resync. */
  onStartMehfil?: () => Promise<void> | void
}

export default function OpenMicRoomPage({ room, iAmHost, onLeave, onEndRoom, onStartMehfil }: Props) {
  // Silence unused-prop lint while keeping the API surface uniform.
  void onStartMehfil

  const me = useAuthStore((s) => s.user)
  const hub = useOpenMicHub()
  const roomState = useOpenMicStore((s) => s.roomState)
  const mcQueue = useOpenMicStore((s) => s.mcQueue)
  const slotLivekit = useOpenMicStore((s) => s.slotLivekit)
  const floatingReactions = useOpenMicStore((s) => s.floatingReactions)
  const pruneReactions = useOpenMicStore((s) => s.pruneFloatingReactions)

  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [showJoinPrompt, setShowJoinPrompt] = useState(false)

  // Join on mount
  useEffect(() => {
    if (!hub.isConnected()) return
    hub.joinRoom(room.id).catch((err) => {
      const msg = String(err?.message ?? '')
      if (msg.toLowerCase().includes('invite')) setShowJoinPrompt(true)
    })
    return () => {
      hub.leaveRoom(room.id).catch(() => {})
      useOpenMicStore.getState().clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, hub.isConnected()])

  // MC: pull privileged queue bios
  useEffect(() => {
    if (!iAmHost || !hub.isConnected()) return
    hub.getQueueForMc(room.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmHost, room.id, hub.isConnected()])

  // When active slot changes, request LiveKit token
  const activeSlotId = roomState?.activeSlot?.id ?? null
  useEffect(() => {
    if (!activeSlotId) {
      useOpenMicStore.getState().setSlotLivekit(null)
      return
    }
    hub.getSlotLiveKitToken(room.id, activeSlotId).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlotId])

  // Prune floating reactions
  useEffect(() => {
    const t = window.setInterval(pruneReactions, 800)
    return () => window.clearInterval(t)
  }, [pruneReactions])

  // Kick / ban → navigate out
  useEffect(() => {
    const onKicked = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    const onBanned = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    window.addEventListener('cv:openmic-kicked', onKicked)
    window.addEventListener('cv:openmic-banned', onBanned)
    return () => {
      window.removeEventListener('cv:openmic-kicked', onKicked)
      window.removeEventListener('cv:openmic-banned', onBanned)
    }
  }, [room.id, onLeave])

  const submitInviteCode = async () => {
    const s = await hub.joinRoom(room.id, inviteCodeInput.trim())
    if (s) setShowJoinPrompt(false)
  }

  if (showJoinPrompt) {
    return (
      <InviteCodeGate
        value={inviteCodeInput}
        setValue={setInviteCodeInput}
        onSubmit={submitInviteCode}
        onBack={onLeave}
      />
    )
  }

  const config = roomState?.config
  const set = roomState?.set
  const activeSlot = roomState?.activeSlot
  const amIPerformer = useMemo(
    () => activeSlot?.performerUserId === me?.userId,
    [activeSlot?.performerUserId, me?.userId],
  )
  const amINominated = useMemo(
    () => mcQueue.some((e) => e.userId === me?.userId),
    [mcQueue, me?.userId],
  )

  return (
    <div className="cv-openmic-stage cv-pop p-4 sm:p-5 border border-[var(--color-line)] relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl shrink-0 inline-flex items-center justify-center text-2xl cv-halo shadow-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
          >
            <Mic size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
              <span>Open Mic</span>
              <span>·</span>
              <span>MC: {room.hostUsername}</span>
            </div>
            <div className="text-lg sm:text-2xl font-semibold cv-text-gradient mt-0.5 leading-tight">{room.title}</div>
            <div className="text-xs text-[var(--color-fg-faint)] mt-1 inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {config?.privacy === 'private' ? <Lock size={11} /> : <Globe size={11} />}
                {config?.privacy ?? 'public'}
              </span>
              <span>·</span>
              <span>{(config?.slotDurationSeconds ?? 180) / 60} min slots</span>
              {set && <><span>·</span><span>Set {set.status}</span></>}
            </div>
          </div>
        </div>
        <SetStatusPill set={set ?? null} slot={activeSlot ?? null} />
      </div>

      {/* MC controls bar */}
      {iAmHost && config && (
        <McControlsBar
          config={config}
          set={set ?? null}
          activeSlot={activeSlot ?? null}
          onConfigure={(p, d) => hub.configureRoom(room.id, p, d)}
          onStartSet={() => hub.startSet(room.id)}
          onEndSet={() => hub.endSet(room.id)}
          onEndSlot={() => hub.endCurrentSlot(room.id)}
          onHighlight={() => activeSlot && hub.highlightPerformance(room.id, activeSlot.id)}
          onEndRoom={onEndRoom}
        />
      )}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mt-4">
        {/* Stage */}
        <StagePanel
          slot={activeSlot ?? null}
          livekitCreds={slotLivekit}
          amIPerformer={amIPerformer}
          floatingReactions={floatingReactions}
          onReact={(emoji) => hub.sendReaction(room.id, emoji)}
        />

        {/* Right sidebar — MC queue OR audience queue badge */}
        {iAmHost ? (
          <McQueueSidebar
            entries={mcQueue}
            onNext={(entryId) => hub.nextPerformer(room.id, entryId)}
            onKick={(uid) => hub.kick(room.id, uid)}
            onBan={(uid) => hub.ban(room.id, uid)}
          />
        ) : (
          <AudienceSidebar
            pendingQueueCount={roomState?.pendingQueueCount ?? 0}
            amINominated={amINominated}
            set={set ?? null}
            onRaiseHand={(name, age, gender, title) =>
              hub.joinQueue(room.id, name, age, gender, title)}
            onWithdraw={() => hub.leaveQueue(room.id)}
            recentSlots={roomState?.recentSlots ?? []}
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={onLeave}
          className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Back to Mehfil
        </button>
        <div className="text-[10px] text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
          <Mic size={10} /> Performer audio is live · audience reacts with emoji bursts
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   InviteCodeGate — private room entry.
───────────────────────────────────────────────────────────── */
function InviteCodeGate({
  value, setValue, onSubmit, onBack,
}: { value: string; setValue: (v: string) => void; onSubmit: () => void; onBack: () => void }) {
  return (
    <div className="cv-openmic-stage cv-pop p-6 sm:p-8 border border-[var(--color-line)] max-w-md mx-auto">
      <div className="text-center space-y-4">
        <div className="inline-flex w-14 h-14 rounded-full items-center justify-center cv-halo"
             style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>
          <Lock size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold cv-text-gradient">Private Open Mic</h2>
          <p className="text-xs text-[var(--color-fg-dim)] mt-1">Enter the MC's invite code.</p>
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="XXXXXXXX"
          className="w-full text-center font-mono tracking-widest text-lg px-4 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none"
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

/* ─────────────────────────────────────────────────────────────
   SetStatusPill
───────────────────────────────────────────────────────────── */
function SetStatusPill({ set, slot }: { set: { status: string } | null; slot: { id: string } | null }) {
  if (slot) {
    return (
      <span className="cv-openmic-mic-glow inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Live · on mic
      </span>
    )
  }
  if (set?.status === 'waiting') {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-line)]">
        Queue open
      </span>
    )
  }
  if (set?.status === 'ended') {
    return (
      <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] border border-[var(--color-line)]">
        Set ended
      </span>
    )
  }
  return (
    <span className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] border border-[var(--color-line)]">
      Waiting for MC
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────
   McControlsBar — config + start/end set + slot controls.
───────────────────────────────────────────────────────────── */
function McControlsBar({
  config, set, activeSlot, onConfigure, onStartSet, onEndSet, onEndSlot, onHighlight, onEndRoom,
}: {
  config: { privacy: 'public' | 'private'; inviteCode: string | null; slotDurationSeconds: number }
  set: { status: string } | null
  activeSlot: { id: string; isHighlighted: boolean } | null
  onConfigure: (privacy: OpenMicPrivacy, slotDurationSeconds: number) => void
  onStartSet: () => void
  onEndSet: () => void
  onEndSlot: () => void
  onHighlight: () => void
  onEndRoom: () => void
}) {
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyInvite = async () => {
    if (!config.inviteCode) return
    try {
      await navigator.clipboard.writeText(config.inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const setActive = set && set.status !== 'ended'

  return (
    <div className="cv-openmic-monitor-rail rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 inline-flex items-center gap-1.5">
        <Crown size={12} /> MC
      </div>
      <Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)} leftIcon={<Sparkles size={12} />}>
        {showConfig ? 'Hide config' : 'Config'}
      </Button>
      {!setActive ? (
        <Button size="sm" variant="primary" onClick={onStartSet} leftIcon={<Mic size={12} />}>
          Start set (open queue)
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={onEndSet} leftIcon={<X size={12} />}>
          End set
        </Button>
      )}
      {activeSlot && (
        <>
          <Button size="sm" variant="ghost" onClick={onEndSlot} leftIcon={<MicOff size={12} />}>
            End current slot
          </Button>
          <Button
            size="sm"
            variant={activeSlot.isHighlighted ? 'primary' : 'ghost'}
            onClick={onHighlight}
            leftIcon={<Star size={12} />}
          >
            {activeSlot.isHighlighted ? 'Highlighted' : 'Highlight'}
          </Button>
        </>
      )}
      {config.privacy === 'private' && config.inviteCode && (
        <button
          onClick={copyInvite}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[10px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-line)] hover:border-amber-400"
          title="Copy invite code"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {config.inviteCode}
        </button>
      )}
      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onEndRoom} leftIcon={<Power size={12} />}>
          End Mehfil
        </Button>
      </div>

      {showConfig && (
        <div className="basis-full mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Privacy</div>
            <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
              {(['public', 'private'] as OpenMicPrivacy[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onConfigure(p, config.slotDurationSeconds)}
                  className={[
                    'px-2.5 h-7 capitalize',
                    config.privacy === p
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  {p === 'public' ? <Globe size={11} className="inline mr-1" /> : <Lock size={11} className="inline mr-1" />}
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Slot duration</div>
            <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
              {SLOT_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => onConfigure(config.privacy, d)}
                  className={[
                    'px-2.5 h-7 font-mono',
                    config.slotDurationSeconds === d
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   StagePanel — the main stage with performer + audio + reactions.
───────────────────────────────────────────────────────────── */
function StagePanel({
  slot, livekitCreds, amIPerformer, floatingReactions, onReact,
}: {
  slot: { id: string; performerUsername: string; performanceTitle: string; startedAt: string; endsAt: string | null; applauseCount: number; isHighlighted: boolean } | null
  livekitCreds: { roomName: string; serverUrl: string; token: string; canPublish: boolean } | null
  amIPerformer: boolean
  floatingReactions: { id: number; emoji: string; at: number }[]
  onReact: (emoji: string) => void
}) {
  if (!slot) {
    return (
      <div className="cv-openmic-stage-canvas rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-1)] p-8 sm:p-12 text-center min-h-[280px] flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-[var(--color-surface-2)] inline-flex items-center justify-center mb-3 opacity-60">
          <Mic size={32} className="text-[var(--color-fg-mute)]" />
        </div>
        <p className="text-sm text-[var(--color-fg-dim)] font-medium">No one on mic yet</p>
        <p className="text-xs text-[var(--color-fg-mute)] mt-1">
          MC will pick the next performer from the queue.
        </p>
      </div>
    )
  }

  return (
    <div className={[
      'cv-openmic-stage-canvas relative rounded-xl border bg-[var(--color-surface-1)] overflow-hidden',
      slot.isHighlighted
        ? 'border-amber-400 cv-openmic-stage-highlight'
        : 'border-[var(--color-line)]',
    ].join(' ')}>
      {/* Aurora glow behind performer */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(245,158,11,0.18), transparent 65%)',
          filter: 'blur(30px)',
        }}
      />

      {/* Floating reactions overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
        {floatingReactions.map((r, i) => (
          <span
            key={r.id}
            className="absolute cv-openmic-reaction-float text-3xl"
            style={{
              left: `${10 + ((r.id * 37) % 80)}%`,
              bottom: '8%',
              animationDelay: `${i * 30}ms`,
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      <div className="relative p-6 sm:p-8 min-h-[320px] flex flex-col items-center justify-center text-center">
        {slot.isHighlighted && (
          <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-amber-300 bg-amber-500/15 border border-amber-500/40 px-2 py-1 rounded-full">
            <Crown size={11} /> Highlighted
          </div>
        )}
        <div className="cv-openmic-mic-pulse w-24 h-24 sm:w-32 sm:h-32 rounded-full inline-flex items-center justify-center mb-4 shadow-2xl"
             style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>
          <Mic size={42} className="text-white" />
        </div>
        <div className="text-xl sm:text-2xl font-semibold text-[var(--color-fg)]">{slot.performerUsername}</div>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1 italic">
          "{slot.performanceTitle}"
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--color-fg-faint)]">
          {slot.endsAt && <SlotCountdown endsAt={slot.endsAt} />}
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            👏 <span className="font-mono tabular-nums">{slot.applauseCount}</span>
          </span>
        </div>

        {/* LiveKit audio room — hidden visually but audio plays */}
        {livekitCreds && (
          <div style={{ height: 0, overflow: 'hidden' }}>
            <LiveKitRoom
              token={livekitCreds.token}
              serverUrl={livekitCreds.serverUrl}
              connect={true}
              audio={livekitCreds.canPublish}
              video={false}
              options={audioOnlyRoomOptions}
              data-lk-theme="default"
            >
              <RoomAudioRenderer />
              {amIPerformer && <PerformerMicHelper />}
            </LiveKitRoom>
          </div>
        )}

        {/* Performer indicator */}
        {amIPerformer && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 px-2 py-1 rounded-full">
            <Volume2 size={10} /> You're on the mic
          </div>
        )}

        {/* Reaction strip */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          {OPEN_MIC_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className="cv-press w-10 h-10 sm:w-11 sm:h-11 rounded-full inline-flex items-center justify-center text-xl bg-[var(--color-surface-2)] hover:bg-amber-500/20 border border-[var(--color-line)] hover:border-amber-400 transition-colors"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SlotCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return <span className="text-[var(--color-warning-fg)]">time's up</span>
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const r = sec % 60
  return <span className="font-mono tabular-nums">{min}:{r.toString().padStart(2, '0')}</span>
}

function PerformerMicHelper() {
  const { localParticipant } = useLocalParticipant()
  useEffect(() => {
    // Ensure mic is enabled when performer joins.
    localParticipant?.setMicrophoneEnabled(true).catch(() => {})
  }, [localParticipant])
  return null
}

/* ─────────────────────────────────────────────────────────────
   McQueueSidebar — privileged bio list + assign next.
───────────────────────────────────────────────────────────── */
function McQueueSidebar({
  entries, onNext, onKick, onBan,
}: {
  entries: OpenMicQueueEntryPrivate[]
  onNext: (entryId: string) => void
  onKick: (uid: string) => void
  onBan: (uid: string) => void
}) {
  return (
    <aside className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-300 inline-flex items-center gap-1.5">
        <Hand size={12} /> Queue (private)
      </div>
      <p className="text-[10px] text-[var(--color-fg-mute)] leading-snug">
        Audience bios visible to you only. Tap "Next on mic" to put them on the stage.
      </p>
      {entries.length === 0 && (
        <p className="text-[11px] text-[var(--color-fg-faint)] py-3 text-center">No hands raised yet.</p>
      )}
      {entries.map((e) => (
        <div key={e.id} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-300/80 font-bold tabular-nums">
            #{e.position}
            <span className="text-[var(--color-fg-mute)]">·</span>
            <span className="text-[var(--color-fg)]">{e.realName}</span>
            <span className="text-[var(--color-fg-mute)]">({e.username})</span>
          </div>
          <div className="text-[10px] text-[var(--color-fg-dim)]">
            Age {e.age}{e.gender ? ` · ${e.gender}` : ''}
          </div>
          <div className="text-xs text-[var(--color-fg)] italic">"{e.performanceTitle}"</div>
          <div className="flex flex-wrap gap-1 pt-1">
            <button
              onClick={() => onNext(e.id)}
              className="text-[10px] h-6 px-2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400 hover:bg-amber-500/40 inline-flex items-center gap-1"
            >
              <ChevronUp size={10} /> Next on mic
            </button>
            <button
              onClick={() => onKick(e.userId)}
              className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
            >
              kick
            </button>
            <button
              onClick={() => onBan(e.userId)}
              className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger-fg)]"
            >
              ban
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}

/* ─────────────────────────────────────────────────────────────
   AudienceSidebar — queue badge + raise hand + history.
───────────────────────────────────────────────────────────── */
function AudienceSidebar({
  pendingQueueCount, amINominated, set, onRaiseHand, onWithdraw, recentSlots,
}: {
  pendingQueueCount: number
  amINominated: boolean
  set: { status: string } | null
  onRaiseHand: (name: string, age: number, gender: string, title: string) => void
  onWithdraw: () => void
  recentSlots: { id: string; performerUsername: string; performanceTitle: string; applauseCount: number; isHighlighted: boolean }[]
}) {
  const [showForm, setShowForm] = useState(false)
  const setActive = set && set.status !== 'ended'

  return (
    <aside className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-fg-faint)] inline-flex items-center gap-1.5 mb-1.5">
          <Hand size={12} /> Queue
        </div>
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--color-fg)] font-medium">
              {pendingQueueCount} {pendingQueueCount === 1 ? 'hand' : 'hands'} raised
            </div>
            <div className="text-[10px] text-[var(--color-fg-mute)] mt-0.5">
              MC picks the next performer
            </div>
          </div>
          {setActive ? (
            amINominated ? (
              <button
                onClick={onWithdraw}
                className="text-[11px] h-7 px-2.5 rounded-full bg-[var(--color-surface-3)] text-[var(--color-warning-fg)] border border-[var(--color-line)]"
              >
                Withdraw
              </button>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="text-[11px] h-7 px-2.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400 inline-flex items-center gap-1"
              >
                <Hand size={10} /> Raise hand
              </button>
            )
          ) : (
            <span className="text-[10px] text-[var(--color-fg-mute)]">Set closed</span>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-fg-faint)] inline-flex items-center gap-1.5 mb-1.5">
          <Shield size={12} /> Recent performances
        </div>
        <div className="space-y-1.5">
          {recentSlots.length === 0 && (
            <p className="text-[11px] text-[var(--color-fg-mute)] text-center py-3">
              No history yet — first performance coming up.
            </p>
          )}
          {recentSlots.map((s) => (
            <div key={s.id} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5 text-xs">
              <div className="font-medium text-[var(--color-fg)] inline-flex items-center gap-1.5">
                {s.isHighlighted && <Crown size={10} className="text-amber-300" />}
                {s.performerUsername}
              </div>
              <div className="text-[10px] text-[var(--color-fg-dim)] italic mt-0.5">"{s.performanceTitle}"</div>
              <div className="text-[10px] text-[var(--color-fg-mute)] mt-0.5 inline-flex items-center gap-1">
                👏 <span className="tabular-nums">{s.applauseCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <RaiseHandForm
          onSubmit={(n, a, g, t) => { onRaiseHand(n, a, g, t); setShowForm(false) }}
          onClose={() => setShowForm(false)}
        />
      )}
    </aside>
  )
}

function RaiseHandForm({
  onSubmit, onClose,
}: {
  onSubmit: (name: string, age: number, gender: string, title: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<OpenMicGender>('')
  const [title, setTitle] = useState('')
  const can = name.trim().length > 0 && Number(age) >= 13 && Number(age) <= 120 && title.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl max-h-[88vh] overflow-y-auto">
        <header className="p-4 border-b border-[var(--color-line)] sticky top-0 bg-[var(--color-surface-1)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Hand size={14} className="text-amber-300" /> Raise hand to perform
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            Your real name, age, and gender are visible <strong>only to the MC</strong>. Audience sees your username + performance title once you're on stage.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Real name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none text-sm"
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
                className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as OpenMicGender)}
                className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none text-sm"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Performance title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Stand-up bit, song, poem, story…"
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-amber-400 outline-none text-sm"
            />
            <div className="text-[10px] text-[var(--color-fg-mute)] text-right mt-0.5">{title.length}/80</div>
          </div>
        </div>
        <footer className="p-4 border-t border-[var(--color-line)] sticky bottom-0 bg-[var(--color-surface-1)]">
          <Button
            fullWidth
            variant="primary"
            disabled={!can}
            onClick={() => onSubmit(name.trim(), Number(age), gender || 'other', title.trim())}
            leftIcon={<Hand size={14} />}
          >
            Submit
          </Button>
        </footer>
      </div>
    </div>
  )
}

// Defensive — keep void-references so unused imports don't warn out
void Loader2
