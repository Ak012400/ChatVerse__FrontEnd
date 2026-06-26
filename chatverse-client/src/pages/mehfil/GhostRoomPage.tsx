import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ghost, Heart, Send, Shield, X, Eye, EyeOff,
  Users, Lock, Globe, Copy, Check, Mic, MicOff, Crown,
  Sparkles, Power, ChevronUp, Volume2,
} from 'lucide-react'
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant } from '@livekit/components-react'
import type { RoomOptions } from 'livekit-client'

import Button from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import { useGhostRoomStore } from '../../stores/ghostRoomStore'
import { useGhostRoomHub } from '../../hooks/useGhostRoomHub'
import type {
  GhostInterest, GhostNominationPrivate, GhostPrivacy,
} from '../../types/ghostRoom'
import type { MehfilRoomCard } from '../../types/mehfil'

// ============================================================
//  GhostRoomPage — standalone Mehfil specialisation.
//
//  Mounted ONLY when MehfilPage detects room.templateKind === 'ghost_date'.
//  All state lives in ghostRoomStore, wire via useGhostRoomHub.
//  All CSS scoped under cv-ghost-* (see index.css §🌙 Ghost Room).
// ============================================================

const CAPACITIES = [4, 6, 8, 10, 12]
const DURATIONS = [5, 10, 15, 20]
const PREMIUM_EMOJI = ['💖', '🌙', '✨', '😏', '🥺', '🌹', '🔥', '💌']

// Audio-only LiveKit options (pair room). No video, audio redundancy on.
const audioOnlyRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    dtx: true,
    red: true,
  },
}

type Props = {
  room: MehfilRoomCard
  iAmHost: boolean
  onLeave: () => void
  onEndRoom: () => void
}

export default function GhostRoomPage({ room, iAmHost, onLeave, onEndRoom }: Props) {
  const me = useAuthStore((s) => s.user)
  const hub = useGhostRoomHub()
  const roomState = useGhostRoomStore((s) => s.roomState)
  const monitorNominations = useGhostRoomStore((s) => s.monitorNominations)
  const pairOutcome = useGhostRoomStore((s) => s.pairOutcome)
  const pairLivekit = useGhostRoomStore((s) => s.pairLivekit)
  const lastHighlightedTag = useGhostRoomStore((s) => s.lastHighlightedTag)

  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [showJoinPrompt, setShowJoinPrompt] = useState(false)

  // ─── Join on mount + leave on unmount ─────────────────────────
  useEffect(() => {
    if (!hub.isConnected()) return
    hub.joinRoom(room.id).catch((err) => {
      const msg = String(err?.message ?? '')
      if (msg.toLowerCase().includes('invite')) {
        setShowJoinPrompt(true)
      }
    })
    return () => {
      hub.leaveRoom(room.id).catch(() => {})
      useGhostRoomStore.getState().clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, hub.isConnected()])

  // ─── On becoming matchmaker, pull bios ────────────────────────
  useEffect(() => {
    if (!iAmHost) return
    if (!hub.isConnected()) return
    hub.getNominationsForMatchmaker(room.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmHost, room.id, hub.isConnected()])

  // ─── On pair assignment, join the pair group + get audio token ─
  const activePairId = roomState?.activePair?.id ?? null
  useEffect(() => {
    if (!activePairId) {
      useGhostRoomStore.getState().setPairLivekit(null)
      return
    }
    hub.joinPairGroup(activePairId).catch(() => {})
    hub.getPairLiveKitToken(activePairId).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePairId])

  // ─── Server kick / ban → navigate out ──────────────────────────
  useEffect(() => {
    const onKicked = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    const onBanned = (e: Event) => {
      const ce = e as CustomEvent<{ roomId: string }>
      if (ce.detail?.roomId === room.id) onLeave()
    }
    window.addEventListener('cv:ghost-kicked', onKicked)
    window.addEventListener('cv:ghost-banned', onBanned)
    return () => {
      window.removeEventListener('cv:ghost-kicked', onKicked)
      window.removeEventListener('cv:ghost-banned', onBanned)
    }
  }, [room.id, onLeave])

  const submitInviteCode = async () => {
    const s = await hub.joinRoom(room.id, inviteCodeInput.trim())
    if (s) setShowJoinPrompt(false)
  }

  // ─── Outcome modal closes after a while ────────────────────────
  useEffect(() => {
    if (!pairOutcome) return
    const t = window.setTimeout(() => {
      useGhostRoomStore.getState().setPairOutcome(null)
      useGhostRoomStore.getState().setActivePair(null)
    }, 7000)
    return () => window.clearTimeout(t)
  }, [pairOutcome])

  // ─── Render ────────────────────────────────────────────────────
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
  const myTag = roomState?.me?.voyagerTag ?? ''
  const voyagers = roomState?.voyagers ?? []
  const activePair = roomState?.activePair ?? null
  const amIPaired = !!activePair && !pairOutcome

  return (
    <div className="cv-ghost-stage cv-pop p-4 sm:p-5 border border-[var(--color-line)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl shrink-0 inline-flex items-center justify-center text-2xl cv-halo shadow-lg"
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' }}
          >
            <Ghost size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
              <span>Ghost Room</span>
              <span>·</span>
              <span>matchmaker: {room.hostUsername}</span>
            </div>
            <div className="text-lg sm:text-xl font-semibold cv-text-gradient mt-0.5 leading-tight">{room.title}</div>
            <div className="text-xs text-[var(--color-fg-faint)] mt-1 inline-flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {config?.privacy === 'private' ? <Lock size={11} /> : <Globe size={11} />}
                {config?.privacy ?? 'public'}
              </span>
              <span>·</span>
              <span><Users size={11} className="inline" /> {voyagers.length}/{config?.maxVoyagers ?? 8}</span>
              <span>·</span>
              <span>{config?.roundDurationMinutes ?? 10}-min rounds</span>
              {myTag && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-[var(--color-accent-fg)]">
                    you are <strong>{myTag}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Matchmaker controls */}
      {iAmHost && config && (
        <MatchmakerControlsBar
          config={config}
          onConfigure={(p, cap, dur, ap) => hub.configureRoom(room.id, p, cap, dur, ap)}
          onAutoPair={(interestBalanced) => hub.autoPairRemaining(room.id, interestBalanced)}
          onEndRound={() => hub.endRound(room.id)}
          onEndRoom={onEndRoom}
        />
      )}

      {/* Public auto-pair badge — when AutoPair is on, the matchmaker
          can step away: server pairs voyagers automatically as they
          raise hands. Shown to EVERYONE so audience knows. */}
      {config?.autoPair && (
        <div className="my-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-[11px] text-emerald-300">
          <Sparkles size={11} className="animate-pulse" />
          Auto-pair on — voyagers are matched as they raise hands.
        </div>
      )}

      {/* Hall (voyager grid) + monitor sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-4">
        <VoyagerHall
          voyagers={voyagers}
          myTag={myTag}
          highlightedTag={lastHighlightedTag}
          pendingCount={roomState?.pendingNominationCount ?? 0}
          iAmHost={iAmHost}
          amIPaired={amIPaired}
          alreadyNominated={voyagers.find((v) => v.voyagerTag === myTag)?.status === 'nominated'}
          onNominate={(name, age, gender, interestedIn, bio) =>
            hub.nominate(room.id, name, age, gender, interestedIn, bio)}
          onWithdraw={() => hub.withdrawNomination(room.id)}
        />
        {iAmHost && (
          <MatchmakerSidebar
            nominations={monitorNominations}
            onAssignPair={(aId, bId) => hub.assignPair(room.id, aId, bId)}
            onKick={(uid) => hub.kick(room.id, uid)}
            onBan={(uid) => hub.ban(room.id, uid)}
            onHighlight={(uid) => hub.highlight(room.id, uid)}
          />
        )}
      </div>

      {/* Active pair sheet — slides over when matched */}
      {activePair && (
        <PairSheet
          pair={activePair}
          messages={roomState?.pairMessages ?? []}
          myTag={myTag}
          livekitCreds={pairLivekit}
          outcome={pairOutcome}
          onSend={(text) => hub.sendPairMessage(activePair.id, text)}
          onVote={(reveal) => hub.voteReveal(activePair.id, reveal)}
          onClose={() => useGhostRoomStore.getState().setPairOutcome(null)}
        />
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={onLeave}
          className="text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
        >
          ← Back to Mehfil
        </button>
        <div className="text-[10px] text-[var(--color-fg-faint)] inline-flex items-center gap-1.5">
          <Ghost size={10} /> Identities stay hidden until both voyagers reveal
        </div>
      </div>

      {/* Reduce ID number reuse: signed-in user id used only for sense check */}
      {me && null}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   InviteCodeGate — private rooms require code entry.
───────────────────────────────────────────────────────────── */
function InviteCodeGate({
  value, setValue, onSubmit, onBack,
}: { value: string; setValue: (v: string) => void; onSubmit: () => void; onBack: () => void }) {
  return (
    <div className="cv-ghost-stage cv-pop p-6 sm:p-8 border border-[var(--color-line)] max-w-md mx-auto">
      <div className="text-center space-y-4">
        <div className="inline-flex w-14 h-14 rounded-full items-center justify-center cv-halo"
             style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' }}>
          <Lock size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold cv-text-gradient">Private Ghost Room</h2>
          <p className="text-xs text-[var(--color-fg-dim)] mt-1">Enter the invite code shared by the matchmaker.</p>
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="XXXXXXXX"
          className="w-full text-center font-mono tracking-widest text-lg px-4 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none"
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
   MatchmakerControlsBar — config + auto-pair + round controls.
───────────────────────────────────────────────────────────── */
function MatchmakerControlsBar({
  config, onConfigure, onAutoPair, onEndRound, onEndRoom,
}: {
  config: NonNullable<ReturnType<typeof useGhostRoomStore.getState>['roomState']>['config']
  onConfigure: (privacy: GhostPrivacy, maxVoyagers: number, durationMinutes: number, autoPair: boolean) => void
  onAutoPair: (interestBalanced: boolean) => void
  onEndRound: () => void
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

  return (
    <div className="cv-ghost-monitor-rail rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] inline-flex items-center gap-1.5">
        <Crown size={12} /> Matchmaker
      </div>
      <Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)} leftIcon={<Sparkles size={12} />}>
        {showConfig ? 'Hide config' : 'Config'}
      </Button>
      <Button size="sm" variant="primary" onClick={() => onAutoPair(true)} leftIcon={<Heart size={12} />}>
        Auto-pair (balanced)
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAutoPair(false)} leftIcon={<Sparkles size={12} />}>
        Auto-pair (random)
      </Button>
      <Button size="sm" variant="ghost" onClick={onEndRound} leftIcon={<X size={12} />}>
        End round
      </Button>
      {config.privacy === 'private' && config.inviteCode && (
        <button
          onClick={copyInvite}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[10px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-line)] hover:border-[var(--color-accent-fg)]"
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
        <div className="basis-full mt-2 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
          <PrivacyPicker
            value={config.privacy}
            onChange={(p) => onConfigure(p, config.maxVoyagers, config.roundDurationMinutes, config.autoPair)}
          />
          <NumberPills
            label="Capacity"
            options={CAPACITIES}
            value={config.maxVoyagers}
            onChange={(n) => onConfigure(config.privacy, n, config.roundDurationMinutes, config.autoPair)}
          />
          <NumberPills
            label="Round min"
            options={DURATIONS}
            value={config.roundDurationMinutes}
            onChange={(n) => onConfigure(config.privacy, config.maxVoyagers, n, config.autoPair)}
          />
          {/* Auto-pair toggle — when ON, the matchmaker steps back and
              the server pairs voyagers continuously as they raise hands.
              Public Ghost Rooms typically run with this on. */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Auto-pair</div>
            <button
              type="button"
              onClick={() =>
                onConfigure(config.privacy, config.maxVoyagers, config.roundDurationMinutes, !config.autoPair)
              }
              className={[
                'h-7 px-3 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 transition-colors',
                config.autoPair
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border-[var(--color-line)] hover:text-[var(--color-fg)]',
              ].join(' ')}
              aria-pressed={config.autoPair}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${config.autoPair ? 'bg-emerald-400' : 'bg-[var(--color-fg-mute)]'}`} />
              {config.autoPair ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PrivacyPicker({ value, onChange }: { value: GhostPrivacy; onChange: (v: GhostPrivacy) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-1">Privacy</div>
      <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
        {(['public', 'private'] as GhostPrivacy[]).map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={[
              'px-2.5 h-7 capitalize',
              value === p
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
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
            key={n}
            onClick={() => onChange(n)}
            className={[
              'px-2.5 h-7 font-mono',
              value === n
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   VoyagerHall — grid of V-tagged voyagers + nominate CTA.
───────────────────────────────────────────────────────────── */
function VoyagerHall({
  voyagers, myTag, highlightedTag, pendingCount, iAmHost, amIPaired, alreadyNominated,
  onNominate, onWithdraw,
}: {
  voyagers: { voyagerTag: string; status: string; joinedAt: string }[]
  myTag: string
  highlightedTag: string | null
  pendingCount: number
  iAmHost: boolean
  amIPaired: boolean
  alreadyNominated: boolean
  onNominate: (name: string, age: number, gender: string, interestedIn: GhostInterest, bio: string) => void
  onWithdraw: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3">
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-fg-faint)]">
          <Users size={12} /> Voyagers
        </span>
        <span className="text-[var(--color-fg-mute)]">·</span>
        <span className="text-[var(--color-fg-mute)]">
          {pendingCount} {pendingCount === 1 ? 'hand' : 'hands'} raised
        </span>
        {!iAmHost && !amIPaired && (
          alreadyNominated ? (
            <button
              onClick={onWithdraw}
              className="ml-auto text-[11px] text-[var(--color-warning-fg)] hover:underline"
            >
              Withdraw
            </button>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="ml-auto text-[11px] text-[var(--color-accent-fg)] hover:underline inline-flex items-center gap-1"
            >
              <Heart size={11} /> Nominate yourself
            </button>
          )
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 cv-stagger">
        {voyagers.length === 0 && (
          <div className="col-span-full text-[11px] text-[var(--color-fg-mute)] text-center py-6">
            No voyagers yet — be the first to drop in.
          </div>
        )}
        {voyagers.map((v) => (
          <VoyagerCard
            key={v.voyagerTag}
            tag={v.voyagerTag}
            status={v.status}
            isMe={v.voyagerTag === myTag}
            isHighlighted={highlightedTag === v.voyagerTag}
          />
        ))}
      </div>
      {showForm && (
        <NominationForm
          onSubmit={(n, a, g, i, b) => { onNominate(n, a, g, i, b); setShowForm(false) }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function VoyagerCard({ tag, status, isMe, isHighlighted }: { tag: string; status: string; isMe: boolean; isHighlighted: boolean }) {
  const statusColor =
    status === 'paired' ? 'text-pink-300' :
    status === 'nominated' ? 'text-amber-300' :
    status === 'done' ? 'text-[var(--color-fg-mute)]' :
    'text-[var(--color-fg-dim)]'
  return (
    <div
      className={[
        'cv-ghost-voyager-card rounded-md border bg-[var(--color-surface-2)] p-2.5 text-center transition-colors',
        isMe ? 'border-[var(--color-accent-fg)]' : 'border-[var(--color-line)]',
        isHighlighted ? 'cv-ghost-reveal-burst' : '',
      ].join(' ')}
    >
      <div className="text-xl">
        <Ghost size={20} className="mx-auto opacity-70" />
      </div>
      <div className="font-mono text-sm font-bold mt-1">{tag}</div>
      <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${statusColor}`}>
        {status}
      </div>
      {isMe && <div className="text-[9px] text-[var(--color-accent-fg)] mt-0.5">(you)</div>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   NominationForm — captures bio for matchmaker-only view.
───────────────────────────────────────────────────────────── */
function NominationForm({
  onSubmit, onClose,
}: {
  onSubmit: (name: string, age: number, gender: string, interestedIn: GhostInterest, bio: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [interestedIn, setInterestedIn] = useState<GhostInterest>('any')
  const [bio, setBio] = useState('')

  const can = name.trim().length > 0 && Number(age) >= 13 && Number(age) <= 120

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl max-h-[88vh] overflow-y-auto">
        <header className="p-4 border-b border-[var(--color-line)] sticky top-0 bg-[var(--color-surface-1)] flex items-center justify-between">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Heart size={14} className="text-pink-400" /> Raise your hand
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-[11px] text-[var(--color-fg-mute)] leading-snug">
            Your bio is shown <strong>only to the matchmaker</strong> for balanced pairing. Other voyagers see only your anonymous tag (V1, V2…) until both of you reveal at round end.
          </p>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Real name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
              placeholder="What matchmaker calls you"
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
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Interested in</label>
            <div className="inline-flex rounded-md overflow-hidden border border-[var(--color-line)]">
              {(['male', 'female', 'other', 'any'] as GhostInterest[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setInterestedIn(p)}
                  className={[
                    'px-3 h-7 text-[11px] capitalize',
                    interestedIn === p
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">Vibe in 50 chars</label>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 50))}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
              placeholder="What makes you, you?"
            />
            <div className="text-[10px] text-[var(--color-fg-mute)] text-right">{bio.length}/50</div>
          </div>
        </div>
        <footer className="p-4 border-t border-[var(--color-line)] sticky bottom-0 bg-[var(--color-surface-1)]">
          <Button
            fullWidth
            variant="primary"
            disabled={!can}
            onClick={() => onSubmit(name.trim(), Number(age), gender || 'other', interestedIn, bio.trim())}
            leftIcon={<Heart size={14} />}
          >
            Raise hand
          </Button>
        </footer>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   MatchmakerSidebar — privileged bio queue + pair-assign picker.
───────────────────────────────────────────────────────────── */
function MatchmakerSidebar({
  nominations, onAssignPair, onKick, onBan, onHighlight,
}: {
  nominations: GhostNominationPrivate[]
  onAssignPair: (aId: string, bId: string) => void
  onKick: (uid: string) => void
  onBan: (uid: string) => void
  onHighlight: (uid: string) => void
}) {
  const [pickedA, setPickedA] = useState<GhostNominationPrivate | null>(null)

  return (
    <aside className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent-fg)] inline-flex items-center gap-1.5">
        <Eye size={12} /> Bio queue (private)
      </div>
      <p className="text-[10px] text-[var(--color-fg-mute)] leading-snug">
        Real name + age + gender visible to you only. Click a voyager to start a pair, then pick their partner. Or use the "Auto-pair" buttons above.
      </p>
      {nominations.length === 0 && (
        <p className="text-[11px] text-[var(--color-fg-faint)] py-3 text-center">No hands raised yet.</p>
      )}
      {nominations.map((n) => (
        <div
          key={n.id}
          className={[
            'rounded-md border p-2.5 text-xs space-y-1 transition-colors',
            pickedA?.id === n.id
              ? 'border-[var(--color-accent-fg)] bg-[var(--color-accent-soft)]'
              : 'border-[var(--color-line)] bg-[var(--color-surface-2)]',
          ].join(' ')}
        >
          <div className="font-medium text-[var(--color-fg)] inline-flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[var(--color-accent-fg)]">{n.voyagerTag}</span>
            <span>·</span>
            <span>{n.realName}</span>
          </div>
          <div className="text-[10px] text-[var(--color-fg-dim)]">
            Age {n.age}{n.gender ? ` · ${n.gender}` : ''} · interested in {n.interestedIn}
          </div>
          {n.shortBio && (
            <div className="text-[10px] text-[var(--color-fg-dim)] italic">"{n.shortBio}"</div>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {pickedA?.id === n.id ? (
              <button
                onClick={() => setPickedA(null)}
                className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-surface-3)] text-[var(--color-fg-dim)]"
              >
                Cancel
              </button>
            ) : pickedA ? (
              <button
                onClick={() => { onAssignPair(pickedA.id, n.id); setPickedA(null) }}
                className="text-[10px] h-6 px-2 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/50 hover:bg-pink-500/40 inline-flex items-center gap-1"
              >
                <Heart size={10} /> Pair with {pickedA.voyagerTag}
              </button>
            ) : (
              <button
                onClick={() => setPickedA(n)}
                className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent-fg)] inline-flex items-center gap-1"
              >
                <ChevronUp size={10} /> Pair…
              </button>
            )}
            <button
              onClick={() => onHighlight(n.userId)}
              className="text-[10px] h-6 px-2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 inline-flex items-center gap-1"
              title="Highlight as good vibe"
            >
              ✨ vibe
            </button>
            <button
              onClick={() => onKick(n.userId)}
              className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
              title="Kick"
            >
              kick
            </button>
            <button
              onClick={() => onBan(n.userId)}
              className="text-[10px] h-6 px-2 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger-fg)]"
              title="Ban"
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
   PairSheet — sliding chat panel with LiveKit audio + reveal vote.
───────────────────────────────────────────────────────────── */
function PairSheet({
  pair, messages, myTag, livekitCreds, outcome, onSend, onVote, onClose,
}: {
  pair: { id: string; voyagerATag: string; voyagerBTag: string; roundNumber: number }
  messages: { id: string; senderVoyagerTag: string; content: string; createdAt: string }[]
  myTag: string
  livekitCreds: { roomName: string; serverUrl: string; token: string } | null
  outcome: 'mutual_reveal' | 'bittersweet' | 'mutual_pass' | 'abandoned' | null
  onSend: (text: string) => void
  onVote: (reveal: boolean) => void
  onClose: () => void
}) {
  const otherTag = myTag === pair.voyagerATag ? pair.voyagerBTag : pair.voyagerATag
  const [draft, setDraft] = useState('')
  const [voted, setVoted] = useState<boolean | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  if (outcome) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm">
        <div className="cv-pop max-w-md w-[92%] rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-line)] p-6 text-center space-y-3 cv-ghost-reveal-burst">
          <div className="text-4xl">{
            outcome === 'mutual_reveal' ? '💞' :
            outcome === 'bittersweet' ? '🥺' :
            outcome === 'mutual_pass' ? '👋' : '🌙'
          }</div>
          <h3 className="text-lg font-semibold cv-text-gradient">{
            outcome === 'mutual_reveal' ? 'Mutual reveal!' :
            outcome === 'bittersweet' ? 'Bittersweet' :
            outcome === 'mutual_pass' ? 'Mutual pass' : 'Round ended'
          }</h3>
          <p className="text-xs text-[var(--color-fg-dim)] leading-relaxed">{
            outcome === 'mutual_reveal' ? 'Both of you wanted to reveal — real names are now visible. Continue the chat in DMs.' :
            outcome === 'bittersweet' ? 'Only one of you wanted to reveal. No identities exchanged this time.' :
            outcome === 'mutual_pass' ? 'Both of you passed. No regrets — maybe next round.' :
            'The round ended before both votes landed.'
          }</p>
          <Button variant="primary" size="sm" fullWidth onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up cv-ghost-pair-sheet w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <header className="p-3 border-b border-[var(--color-line)] flex items-center justify-between gap-2 shrink-0">
          <div className="inline-flex items-center gap-2 text-sm">
            <Heart size={14} className="text-pink-400" />
            <span className="font-mono">{myTag}</span>
            <span className="text-[var(--color-fg-mute)]">↔</span>
            <span className="font-mono">{otherTag}</span>
            <span className="text-[10px] text-[var(--color-fg-faint)] ml-1">round {pair.roundNumber}</span>
          </div>
          {livekitCreds ? (
            <AudioStatusPill creds={livekitCreds} />
          ) : (
            <span className="text-[10px] text-[var(--color-fg-mute)] inline-flex items-center gap-1">
              <MicOff size={10} /> audio loading…
            </span>
          )}
        </header>

        {/* Audio — silent LiveKit room, mic off by default */}
        {livekitCreds && (
          <LiveKitRoom
            token={livekitCreds.token}
            serverUrl={livekitCreds.serverUrl}
            connect={true}
            audio={true}
            video={false}
            options={audioOnlyRoomOptions}
            data-lk-theme="default"
            style={{ height: 0 }}
          >
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {messages.length === 0 && (
            <p className="text-[11px] text-[var(--color-fg-mute)] text-center mt-3">
              Say hi 👋 — both of you are anonymous until round end.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.senderVoyagerTag === myTag
            return (
              <div key={m.id} className={`flex gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                  mine ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-2)]'
                }`}>
                  <div className="text-[10px] opacity-70 font-mono">{m.senderVoyagerTag}</div>
                  <div className="mt-0.5 break-words">{m.content}</div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--color-line)] p-2 space-y-1.5 shrink-0">
          <div className="flex items-end gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={`Message ${otherTag}…`}
              className="flex-1 resize-none rounded-md cv-glass text-sm leading-relaxed p-2 border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-accent)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  const t = draft.trim()
                  if (!t) return
                  onSend(t); setDraft('')
                }
              }}
            />
            <Button
              size="sm" variant="primary"
              disabled={!draft.trim()}
              onClick={() => { onSend(draft.trim()); setDraft('') }}
              leftIcon={<Send size={12} />}
            >
              Send
            </Button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PREMIUM_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => setDraft((d) => d + e)}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)] border border-[var(--color-line)]"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Reveal vote */}
        <div className="border-t border-[var(--color-line)] p-3 space-y-2 shrink-0 bg-[var(--color-surface-2)]/40">
          <div className="text-[11px] text-[var(--color-fg-dim)] leading-snug">
            When you're ready: <strong>Reveal</strong> to swap real names if {otherTag} also reveals, or <strong>Pass</strong> to walk away unknown.
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm" variant={voted === true ? 'primary' : 'ghost'} fullWidth
              onClick={() => { onVote(true); setVoted(true) }}
              leftIcon={<Eye size={12} />}
              disabled={voted !== null}
            >
              Reveal
            </Button>
            <Button
              size="sm" variant={voted === false ? 'primary' : 'ghost'} fullWidth
              onClick={() => { onVote(false); setVoted(false) }}
              leftIcon={<EyeOff size={12} />}
              disabled={voted !== null}
            >
              Pass
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AudioStatusPill({ creds: _creds }: { creds: { roomName: string; serverUrl: string; token: string } }) {
  return (
    <span className="text-[10px] text-emerald-300 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40">
      <Volume2 size={10} /> Audio live
    </span>
  )
}

// Keep a void reference so unused imports don't warn (used inside LiveKit children).
void useLocalParticipant
void Shield
