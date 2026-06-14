import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  Users, Flag, Loader2, Sparkles, ShieldAlert,
} from 'lucide-react'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useMaybeParticipantContext,
  RoomAudioRenderer,
  useRoomContext,
  ConnectionStateToast,
} from '@livekit/components-react'
import { groupRoomOptions } from '../../lib/livekitOptions'
import { Track } from 'livekit-client'
import * as nsfwjs from 'nsfwjs'
import '@livekit/components-styles'

import { randomGroupApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useCaptionsStore } from '../../stores/captionsStore'
import { useCaptionBroadcaster } from '../../hooks/useCaptionBroadcaster'
import { useCaptions } from '../../hooks/useCaptions'
import { useCaptionTTS } from '../../hooks/useCaptionTTS'
import { CaptionOverlay, CaptionsToggle, CaptionTTSToggle } from '../../components/call/CaptionOverlay'
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
            <div className="mb-4 px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)] text-[var(--color-danger-fg)] text-xs">
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
      options={groupRoomOptions}
      onDisconnected={handleLeave}
      data-lk-theme="default"
      style={{ height: '100%', background: 'var(--color-bg)' }}
    >
      <RoomAudioRenderer />
      {/* Built-in banner for connecting/reconnecting states — users
          SEE the recovery instead of assuming the call died. */}
      <ConnectionStateToast />
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
  // ⚠ CRITICAL: `withPlaceholder: true` MUST be set so that every connected
  //   participant gets a tile in the grid even if they haven't published a
  //   camera track yet (still negotiating, camera off, mic-only). Without
  //   it, useTracks only returns tiles for participants who have ALREADY
  //   published a Camera source — which is why callers/callees saw either
  //   their own video, the other person's, or nothing depending on the
  //   exact moment the publish completed. `onlySubscribed: false` makes
  //   sure unsubscribed-but-published streams also surface.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)

  // Live captions wire-up — same hooks as DirectCallPage. Uses the
  // LiveKit `roomName` as the SignalR caption group key so every
  // participant who joins the same random group also joins the same
  // captions channel automatically.
  const captionsEnabled = useCaptionsStore((s) => s.enabled)
  const setCaptionsEnabled = useCaptionsStore((s) => s.setEnabled)
  const spokenLang = useCaptionsStore((s) => s.spokenLang)
  const preferredLang = useCaptionsStore((s) => s.preferredLang)
  const ttsEnabled = useCaptionsStore((s) => s.ttsEnabled)
  const setTtsEnabled = useCaptionsStore((s) => s.setTtsEnabled)
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
  })
  const { lines: captionLines } = useCaptions({ roomName, preferredLang, enabled: captionsEnabled })
  useCaptionTTS({ lines: captionLines, preferredLang, enabled: captionsEnabled && ttsEnabled, selfId: currentUserId })

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
      <header className="absolute top-0 inset-x-0 z-20 px-3 md:px-5 py-2 md:py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2.5">
          <Users size={14} className="text-white/70" />
          <span className="text-xs font-medium tracking-tight">
            {participants.length}/{maxParticipants}
          </span>
          <Badge tone="success" size="sm" dot>Live</Badge>
        </div>
        <div className="text-[10px] text-white/40 font-mono tracking-tight hidden sm:inline">{roomName}</div>
      </header>

      {/* Participant grid — desktop caps tile size so portrait-mobile
          peers don't blow up across half the viewport. Each tile is
          aspect-video on lg+ and contained (object-contain) so portrait
          video sits letter-boxed inside instead of overflowing. */}
      <div className="flex-1 pt-10 pb-20 md:pt-12 md:pb-22 lg:pt-14 lg:pb-24 lg:px-6">
        {tracks.length > 0 ? (
          <div className="h-full w-full lg:max-w-6xl lg:mx-auto">
            <GridLayout
              tracks={tracks}
              style={{
                height: '100%',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                gap: '4px',
                padding: '4px',
              }}
              className="[&_.lk-participant-tile]:lg:aspect-video [&_.lk-participant-tile]:lg:max-h-[320px] [&_.lk-participant-tile_video]:lg:!object-contain [&_.lk-participant-tile]:lg:bg-black/60 [&_.lk-participant-tile]:lg:rounded-md"
            >
              <ParticipantTileWithReport
                currentUserId={currentUserId}
                onReport={reportPeer}
              />
            </GridLayout>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-white/40" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {captionsEnabled && captionLines.length > 0 && (
          <CaptionOverlay
            lines={captionLines}
            preferredLang={preferredLang}
            className="bottom-20"
          />
        )}
      </div>

      {/* Controls */}
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

// ──────────────────────────────────────────────────────────────
// ParticipantTileWithReport
// Wraps LiveKit's default ParticipantTile with a small "report"
// overlay button that lets one participant flag another for review.
// We deliberately use the default tile underneath so we get all the
// stock behaviour (mute indicator, focus styles, screenshare handling)
// for free, and only paint the report button on top.
// ──────────────────────────────────────────────────────────────
function ParticipantTileWithReport({
  currentUserId,
  onReport,
}: {
  currentUserId: string
  onReport: (violatorUserId: string) => void
}) {
  // GridLayout wraps each rendered tile in a ParticipantContext, so we
  // can pull the current participant out via the maybe-context hook
  // without throwing if (somehow) the context isn't there.
  const participant = useMaybeParticipantContext()
  const isSelf = participant?.identity === currentUserId

  return (
    <div className="relative h-full">
      <ParticipantTile />
      {!isSelf && participant && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReport(participant.identity)
          }}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-black/60 hover:bg-[var(--color-danger)] text-white backdrop-blur-sm transition-colors"
          aria-label={`Report ${participant.name ?? participant.identity}`}
        >
          <ShieldAlert size={11} />
          Report
        </button>
      )}
    </div>
  )
}
