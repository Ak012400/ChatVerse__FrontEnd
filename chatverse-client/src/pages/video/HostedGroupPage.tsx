import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video as VideoIcon, Plus, LogIn, Loader2, Users,
  Mic, MicOff, VideoOff, PhoneOff, Copy, Check,
} from 'lucide-react'
import {
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import AllParticipantsGrid from '../../components/call/AllParticipantsGrid'
import DraggableSelfTile from '../../components/call/DraggableSelfTile'
import { groupRoomOptions } from '../../lib/livekitOptions'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

import { groupCallApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useActiveCallStore } from '../../stores/activeCallStore'
import { useCaptionsStore } from '../../stores/captionsStore'
import { useCaptionBroadcaster } from '../../hooks/useCaptionBroadcaster'
import { useCaptions, type CaptionLine } from '../../hooks/useCaptions'
import { useCaptionTTS } from '../../hooks/useCaptionTTS'
import { CaptionOverlay, CaptionsToggle, CaptionTTSToggle } from '../../components/call/CaptionOverlay'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import IconButton from '../../components/ui/IconButton'
import Badge from '../../components/ui/Badge'

type Connection = {
  token: string
  roomName: string
  serverUrl: string
}

export default function HostedGroupPage() {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const setCall = useActiveCallStore((s) => s.setCall)
  const endCall = useActiveCallStore((s) => s.endCall)
  const activeCall = useActiveCallStore((s) => s.call)

  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick')
  const [roomName, setRoomName] = useState('')
  const [maxParticipants, setMaxParticipants] = useState(10)
  const [loading, setLoading] = useState(false)
  const [conn, setConn] = useState<Connection | null>(null)

  // Promote into shared call shell so /profile / /chat don't drop the call.
  useEffect(() => {
    if (!conn) return
    setCall({
      kind: 'hosted',
      roomName: conn.roomName,
      token: conn.token,
      serverUrl: conn.serverUrl,
      returnPath: '/video/hosted',
      startedAt: Date.now(),
      roomOptions: groupRoomOptions,
      label: `Hosted · ${conn.roomName}`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.token])

  useEffect(() => {
    if (conn && activeCall == null) setConn(null)
  }, [activeCall, conn])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim()) return
    setLoading(true)
    try {
      const res = await groupCallApi.create(roomName.trim(), maxParticipants)
      const data = res.data.data
      setConn({ token: data.token, roomName: data.roomName, serverUrl: data.serverUrl })
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Failed to create room',
        message: err.response?.data?.error ?? 'Try again.',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim()) return
    setLoading(true)
    try {
      const res = await groupCallApi.token(roomName.trim())
      const data = res.data.data
      setConn({ token: data.token, roomName: data.roomName, serverUrl: data.serverUrl })
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Could not join',
        message: err.response?.data?.error ?? 'Room not found or full.',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  /* In-call. LiveKitRoom lives in AppLayout — we just render UI here. */
  if (conn) {
    return (
      <HostedGroupUI
        roomName={conn.roomName}
        onLeave={() => {
          endCall()
          setConn(null)
          navigate('/video')
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-md mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-4">
            <VideoIcon size={22} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Hosted group</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">
            Create a named room or join one by name.
          </p>
        </div>

        {mode === 'pick' && (
          <div className="grid grid-cols-1 gap-2.5">
            <button
              onClick={() => setMode('create')}
              className="p-4 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] flex items-center justify-center">
                  <Plus size={16} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Create a new room</p>
                  <p className="text-xs text-[var(--color-fg-faint)]">
                    Get a shareable name. Up to 50 participants.
                  </p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode('join')}
              className="p-4 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] flex items-center justify-center">
                  <LogIn size={16} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Join an existing room</p>
                  <p className="text-xs text-[var(--color-fg-faint)]">
                    Enter a room name you were given.
                  </p>
                </div>
              </div>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form
            onSubmit={handleCreate}
            className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 space-y-3"
          >
            <Input
              label="Room name"
              placeholder="friday-hangout"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              hint="Letters, numbers, dashes. A short suffix will be added for uniqueness."
            />
            <Input
              label="Max participants"
              type="number"
              min={2}
              max={50}
              value={String(maxParticipants)}
              onChange={(e) => setMaxParticipants(Math.max(2, Math.min(50, Number(e.target.value) || 10)))}
            />
            <Button type="submit" fullWidth size="lg" loading={loading} leftIcon={<Plus size={15} />}>
              Create &amp; join
            </Button>
            <button
              type="button"
              onClick={() => setMode('pick')}
              className="block mx-auto text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              ← Back
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form
            onSubmit={handleJoin}
            className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 space-y-3"
          >
            <Input
              label="Room name"
              placeholder="gc-friday-hangout-a1b2c3"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              hint="Paste the full room name (with the suffix)."
            />
            <Button type="submit" fullWidth size="lg" loading={loading} leftIcon={<LogIn size={15} />}>
              Join room
            </Button>
            <button
              type="button"
              onClick={() => setMode('pick')}
              className="block mx-auto text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
            >
              ← Back
            </button>
          </form>
        )}

        <button
          onClick={() => navigate('/video')}
          className="block mx-auto mt-6 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
        >
          ← Pick a different mode
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   In-call UI — shows participant grid + share-room banner.
───────────────────────────────────────────────────────────── */
function HostedGroupUI({
  roomName,
  onLeave,
}: {
  roomName: string
  onLeave: () => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  // See RandomGroupPage for the rationale — withPlaceholder ensures every
  // connected participant gets a grid tile even before/without a camera
  // publish. Otherwise the grid swaps participants in and out depending
  // on whose publish handshake completes first, which feels broken.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const selfTrack = tracks.find((t) => t.participant.isLocal)
  const remoteTracks = tracks.filter((t) => !t.participant.isLocal)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [copied, setCopied] = useState(false)

  // Captions + TTS wire-up — same hooks as DirectCallPage.
  const { showToast } = useToastStore()
  const selfId = useAuthStore((s) => s.user?.userId)
  const captionsEnabled = useCaptionsStore((s) => s.enabled)
  const setCaptionsEnabled = useCaptionsStore((s) => s.setEnabled)
  const spokenLang = useCaptionsStore((s) => s.spokenLang)
  const preferredLang = useCaptionsStore((s) => s.preferredLang)
  const ttsEnabled = useCaptionsStore((s) => s.ttsEnabled)
  const setTtsEnabled = useCaptionsStore((s) => s.setTtsEnabled)
  // Local self-caption echo so the speaker sees their own words.
  const [selfCaption, setSelfCaption] = useState<CaptionLine | null>(null)
  const selfClearTimerRef = useRef<number | null>(null)
  const broadcaster = useCaptionBroadcaster({
    roomName,
    enabled: captionsEnabled,
    speakLang: spokenLang,
    onUnsupported: () => {
      showToast({ type: 'warning', title: 'Captions unavailable', message: 'Your browser does not support live speech recognition.', duration: 3500 })
      setCaptionsEnabled(false)
    },
    onPermissionDenied: () => {
      showToast({ type: 'warning', title: 'Mic access denied', message: 'Captions need mic permission.', duration: 4000 })
      setCaptionsEnabled(false)
    },
    onLocalCaption: (text, isFinal) => {
      setSelfCaption({
        speakerId: selfId || 'self',
        speakerName: 'You',
        sourceLang: spokenLang.split('-')[0].toLowerCase(),
        originalText: text, text, isFinal, at: Date.now(),
      })
      if (selfClearTimerRef.current) window.clearTimeout(selfClearTimerRef.current)
      selfClearTimerRef.current = window.setTimeout(() => setSelfCaption(null), 5000)
    },
  })
  const { lines: remoteCaptionLines } = useCaptions({ roomName, preferredLang, enabled: captionsEnabled })
  const captionLines: CaptionLine[] = selfCaption ? [...remoteCaptionLines, selfCaption] : remoteCaptionLines
  useCaptionTTS({ lines: remoteCaptionLines, preferredLang, enabled: captionsEnabled && ttsEnabled, selfId })

  const toggleMic = async () => {
    const next = !micOn
    await localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }

  const toggleCam = async () => {
    const next = !camOn
    await localParticipant.setCameraEnabled(next)
    setCamOn(next)
  }

  const leave = async () => {
    await room.disconnect()
    onLeave()
  }

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(roomName)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative h-full bg-black text-white">
      <header className="absolute top-0 inset-x-0 z-20 px-3 md:px-5 py-2 md:py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2.5">
          <Users size={14} className="text-white/70" />
          <span className="text-xs font-medium tabular-nums">{participants.length}</span>
          <Badge tone="success" size="sm" dot>Live</Badge>
        </div>
        <button
          onClick={copyName}
          className="flex items-center gap-1.5 text-[10px] font-mono text-white/60 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
          title="Copy room name"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span className="hidden sm:inline text-xs">{roomName}</span>
          <span className="sm:hidden">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </header>

      {/* Desktop: cap container width + clamp each tile to aspect-video
          so a portrait-camera peer letter-boxes instead of stretching.
          Uses AllParticipantsGrid (custom CSS grid) so EVERY participant
          is always visible — LiveKit's GridLayout has a focus-mode that
          could hide tiles after a tap. */}
      <div className="h-full pt-10 pb-20 md:pt-12 md:pb-22 lg:pt-14 lg:pb-24 lg:px-6">
        {tracks.length > 0 ? (
          <div className="relative h-full w-full lg:max-w-6xl lg:mx-auto">
            <AllParticipantsGrid tracks={remoteTracks} />
            {selfTrack && <DraggableSelfTile track={selfTrack} />}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-white/40" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {captionsEnabled && (
          <CaptionOverlay
            lines={captionLines}
            preferredLang={preferredLang}
            className="bottom-20"
            enabled={captionsEnabled}
            listening={broadcaster.listening}
            micMuted={!micOn}
          />
        )}
      </div>

      <div className="absolute bottom-0 inset-x-0 z-30 px-3 md:px-5 pb-4 md:pb-5 pt-8 md:pt-12 flex items-center justify-center gap-2 flex-wrap bg-gradient-to-t from-black/85 to-transparent">
        <IconButton
          variant="subtle"
          size="lg"
          onClick={toggleMic}
          className={!micOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''}
          aria-label={micOn ? 'Mute' : 'Unmute'}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </IconButton>
        <IconButton
          variant="subtle"
          size="lg"
          onClick={toggleCam}
          className={!camOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''}
          aria-label={camOn ? 'Stop camera' : 'Start camera'}
        >
          {camOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
        </IconButton>
        {broadcaster.isSupported && (
          <>
            <CaptionsToggle
              enabled={captionsEnabled}
              onToggle={() => setCaptionsEnabled(!captionsEnabled)}
              listening={broadcaster.listening}
              spokenLang={spokenLang.split('-')[0]}
            />
            <CaptionTTSToggle
              enabled={ttsEnabled}
              captionsOn={captionsEnabled}
              onToggle={() => setTtsEnabled(!ttsEnabled)}
            />
          </>
        )}
        <button
          onClick={leave}
          className="h-11 px-5 rounded-md text-sm font-medium bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <PhoneOff size={15} />
          Leave
        </button>
      </div>
    </div>
  )
}
