import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  Users, Flag, Loader2, Sparkles,
} from 'lucide-react'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useParticipants,
  RoomAudioRenderer,
  useRoomContext,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import * as nsfwjs from 'nsfwjs'
import '@livekit/components-styles'

import { randomGroupApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Badge from '../../components/ui/Badge'

type JoinData = {
  token: string
  roomName: string
  serverUrl: string
  count: number
  maxParticipants: number
}

export default function RandomGroupPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [joinData, setJoinData] = useState<JoinData | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    setIsJoining(true)
    setError(null)
    try {
      const res = await randomGroupApi.join()
      setJoinData(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not join a group right now.')
    } finally {
      setIsJoining(false)
    }
  }

  const handleLeave = async () => {
    if (joinData) {
      try {
        await randomGroupApi.leave(joinData.roomName)
      } catch {
        /* best effort */
      }
    }
    setJoinData(null)
  }

  /* Pre-join screen */
  if (!joinData) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
        <div className="max-w-md mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-5">
            <Users size={22} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Random group chat</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mb-6 leading-relaxed">
            Drop into an active group of strangers. Cap is 6 — quality stays high
            and everyone's camera is AI-monitored.
          </p>

          <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-[var(--color-accent-fg)]" />
              <span className="text-xs font-medium text-[var(--color-fg)]">
                How safety works
              </span>
            </div>
            <ul className="text-xs text-[var(--color-fg-dim)] space-y-1.5 leading-relaxed">
              <li>Your camera is scanned locally — no frames sent anywhere.</li>
              <li>NSFW detection auto-removes you and reduces your trust score.</li>
              <li>You can report anyone in the room with one tap.</li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)] text-[#fca5a5] text-xs">
              {error}
            </div>
          )}

          <Button size="lg" fullWidth onClick={handleJoin} loading={isJoining}>
            {isJoining ? 'Finding a group…' : 'Join a random group'}
          </Button>

          <button
            onClick={() => navigate('/video')}
            className="mt-3 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
          >
            ← Pick a different mode
          </button>
        </div>
      </div>
    )
  }

  /* In-call screen */
  return (
    <LiveKitRoom
      token={joinData.token}
      serverUrl={joinData.serverUrl}
      video
      audio
      connect
      onDisconnected={handleLeave}
      data-lk-theme="default"
      style={{ height: '100%', background: 'var(--color-bg)' }}
    >
      <RoomAudioRenderer />
      <GroupRoomUI
        roomName={joinData.roomName}
        maxParticipants={joinData.maxParticipants}
        onLeave={handleLeave}
        currentUserId={user?.userId ?? ''}
      />
    </LiveKitRoom>
  )
}

/* ─────────────────────────────────────────────────────────────
   Inner UI — runs inside the LiveKitRoom context.
───────────────────────────────────────────────────────────── */
function GroupRoomUI({
  roomName,
  maxParticipants,
  onLeave,
  currentUserId,
}: {
  roomName: string
  maxParticipants: number
  onLeave: () => Promise<void>
  currentUserId: string
}) {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare])

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)

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
    await onLeave()
    navigate('/video')
  }

  /* ─── NSFW self-scan loop — see VideoPage for false-positive rationale.
   * Same two-gate guard applied here: 0.92 per-frame threshold AND
   * three consecutive flagged frames before auto-removal. Without this
   * pair, innocent face video was being kicked at the ~25s mark in
   * production due to skin-tone false positives. */
  useEffect(() => {
    let stopped = false
    let interval: number | null = null
    let model: any = null
    let consecutiveBad = 0
    let lastBad: { className: string; probability: number } | null = null
    const FRAME_THRESHOLD = 0.92
    const CONSECUTIVE_REQUIRED = 3
    const SCAN_INTERVAL_MS = 4000

    const start = async () => {
      try {
        model = await nsfwjs.load()
      } catch (err) {
        console.warn('nsfwjs load failed — skipping self-scan', err)
        return
      }

      interval = window.setInterval(async () => {
        if (stopped || !model) return

        // Pull the local camera track and snapshot a frame.
        const cam = localParticipant.getTrackPublication(Track.Source.Camera)
        const videoEl: HTMLVideoElement | undefined =
          cam?.track?.attachedElements?.[0] as HTMLVideoElement | undefined
        if (!videoEl || videoEl.readyState < 2) return

        const canvas = document.createElement('canvas')
        canvas.width = 224
        canvas.height = 224
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(videoEl, 0, 0, 224, 224)

        try {
          const preds = await model.classify(canvas)
          const bad = preds.find(
            (p: { className: string; probability: number }) =>
              ['Porn', 'Hentai'].includes(p.className) && p.probability > FRAME_THRESHOLD,
          )
          if (bad) {
            consecutiveBad++
            lastBad = bad
            console.warn(`[nsfw] frame ${consecutiveBad}/${CONSECUTIVE_REQUIRED} flagged as ${bad.className} (${(bad.probability * 100).toFixed(0)}%)`)
            if (consecutiveBad >= CONSECUTIVE_REQUIRED) {
              stopped = true
              if (interval) window.clearInterval(interval)
              showToast({
                type: 'danger',
                title: 'Removed',
                message: 'Inappropriate content detected on your camera.',
                duration: 5000,
              })
              await randomGroupApi.report({
                roomName,
                violatorUserId: currentUserId,
                selfReport: true,
                label: lastBad!.className,
                confidence: lastBad!.probability,
              })
              await leave()
            }
          } else {
            if (consecutiveBad > 0) {
              console.log(`[nsfw] streak reset (${consecutiveBad} → 0)`)
              consecutiveBad = 0
              lastBad = null
            }
          }
        } catch {
          /* ignore individual frame errors */
        }
      }, SCAN_INTERVAL_MS)
    }

    start()
    return () => {
      stopped = true
      if (interval) window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant, roomName, currentUserId])

  /* ─── Peer report — flag for review, don't auto-kick ─── */
  const reportPeer = async (violatorUserId: string) => {
    try {
      await randomGroupApi.report({
        roomName,
        violatorUserId,
        selfReport: false,
      })
      showToast({
        type: 'info',
        title: 'Report submitted',
        message: 'Thanks — our team will review.',
        duration: 2500,
      })
    } catch {
      showToast({
        type: 'error',
        title: 'Report failed',
        message: 'Could not submit the report. Try again.',
        duration: 3000,
      })
    }
  }

  return (
    <div className="flex flex-col h-full bg-black text-white relative">
      {/* Header */}
      <header className="absolute top-0 inset-x-0 z-20 px-5 py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2.5">
          <Users size={14} className="text-white/70" />
          <span className="text-xs font-medium tracking-tight">
            {participants.length}/{maxParticipants}
          </span>
          <Badge tone="success" size="sm" dot>Live</Badge>
        </div>
        <div className="text-[10px] text-white/40 font-mono tracking-tight">{roomName}</div>
      </header>

      {/* Participant grid */}
      <div className="flex-1 pt-14 pb-24">
        {tracks.length > 0 ? (
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTileWithReport
              currentUserId={currentUserId}
              onReport={reportPeer}
            />
          </GridLayout>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-white/40" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 inset-x-0 z-30 px-5 pb-5 pt-12 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 to-transparent">
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
        <button
          onClick={leave}
          className="h-11 px-5 rounded-md text-sm font-medium bg-[var(--color-danger)] hover:bg-[#dc2626] text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <PhoneOff size={15} />
          Leave
        </button>
      </div>

      {/* Local-video hidden ref (we use LiveKit's tile) */}
      <video ref={localVideoRef} className="hidden" />
    </div>
  )
}

/* Wrapper tile that adds a small "Report" affordance on hover. */
function ParticipantTileWithReport({
  currentUserId,
  onReport,
}: {
  currentUserId: string
  onReport: (violatorUserId: string) => void
}) {
  // We render the default ParticipantTile but overlay our report button
  // using CSS — child gets the tile context via @livekit hooks
  // when used inside <GridLayout>.
  return (
    <div className="relative group">
      <ParticipantTile />
      <TileReportButton currentUserId={currentUserId} onReport={onReport} />
    </div>
  )
}

function TileReportButton({
  currentUserId,
  onReport,
}: {
  currentUserId: string
  onReport: (violatorUserId: string) => void
}) {
  // The participant identity is exposed via the data-lk-participant attribute
  // on the parent tile. Read it from the closest tile container.
  const ref = useRef<HTMLButtonElement | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const tile = ref.current.closest('[data-lk-participant]') as HTMLElement | null
    setTargetId(tile?.dataset.lkParticipant ?? null)
  }, [])

  if (!targetId || targetId === currentUserId) return null

  return (
    <button
      ref={ref}
      onClick={() => onReport(targetId)}
      className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity
        w-7 h-7 rounded-md bg-black/60 backdrop-blur text-white/80 hover:text-white inline-flex items-center justify-center"
      aria-label="Report participant"
      title="Report"
    >
      <Flag size={13} />
    </button>
  )
}
