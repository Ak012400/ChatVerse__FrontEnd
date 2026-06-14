import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Monitor, MonitorOff, Mic, MicOff, VideoOff, Video as VideoIcon,
  PhoneOff, Users, Loader2, AlertTriangle, Info,
} from 'lucide-react'
import {
  LiveKitRoom, GridLayout, ParticipantTile, useTracks,
  useLocalParticipant, useParticipants, RoomAudioRenderer, useRoomContext,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

import { theaterApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'

/**
 * Theater (Watch Party) room — up to 10 people share one user's screen
 * over LiveKit. Any participant can claim the "screen-share" track by
 * tapping "Share screen"; turning it off frees the slot for someone
 * else to take a turn.
 *
 * Layout philosophy:
 *   • Centre stage = the live screen-share (whoever is sharing). If
 *     nobody is sharing yet, a placeholder card explains how to start.
 *   • Bottom strip = small webcam tiles of every participant so the
 *     room still feels social — half the fun of a watch party is
 *     seeing reactions in real time.
 *
 * Mobile:
 *   getDisplayMedia() doesn't exist on mobile Safari/Chrome — phone
 *   browsers can VIEW a shared screen but can't initiate one. We
 *   detect this and hide the "Share screen" button, so phone users
 *   land naturally as viewers.
 *
 * Copyright disclaimer:
 *   Live disclaimer banner reminds users that streaming copyrighted
 *   content (movies, paid sports streams, etc.) without authorisation
 *   is illegal. ChatVerse just provides the canvas.
 */
export default function TheaterRoomPage() {
  const { roomName } = useParams<{ roomName: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()

  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Acquire token via /api/theater/token. Single round-trip on mount;
  // server enforces the 10-participant cap and rejects with 409 when
  // full.
  useEffect(() => {
    if (!roomName) return
    let cancelled = false
    setJoining(true)
    theaterApi
      .join(roomName)
      .then((res) => {
        if (cancelled) return
        setToken(res.data.data.token)
        setServerUrl(res.data.data.serverUrl)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.data?.error ?? 'Could not join theater'
        setJoinError(msg)
        showToast({ type: 'danger', title: 'Join failed', message: msg, duration: 3500 })
      })
      .finally(() => { if (!cancelled) setJoining(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName])

  if (!roomName) {
    return (
      <FullPageStatus icon={<AlertTriangle size={20} className="text-[var(--color-danger-fg)]" />}>
        Invalid room
      </FullPageStatus>
    )
  }
  if (joining) {
    return (
      <FullPageStatus icon={<Loader2 size={20} className="animate-spin" />}>
        Joining theater…
      </FullPageStatus>
    )
  }
  if (joinError || !token || !serverUrl) {
    return (
      <FullPageStatus icon={<AlertTriangle size={20} className="text-[var(--color-danger-fg)]" />}>
        <p className="mb-3">{joinError ?? 'Theater unavailable'}</p>
        <button
          onClick={() => navigate('/video')}
          className="px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs"
        >
          Back to video
        </button>
      </FullPageStatus>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video
      onDisconnected={() => navigate('/video')}
      data-lk-theme="default"
      className="h-full bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col"
    >
      <RoomAudioRenderer />
      <TheaterUI roomName={roomName} />
    </LiveKitRoom>
  )
}

/**
 * Inner UI that consumes the LiveKit context. Split out from the
 * outer wrapper so all the hooks run inside the connected room.
 */
function TheaterUI({ roomName }: { roomName: string }) {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()

  // Track lists. We pull screen-share separately from camera so we can
  // render the screen big and cams small — that's the whole point of a
  // watch party.
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true })
  const cameraTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
  ])

  const someoneSharing = screenTracks.length > 0
  const primaryScreen = screenTracks[0] ?? null

  // Detect mobile — getDisplayMedia is undefined on phone browsers.
  const canShareScreen = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return !!(navigator.mediaDevices && typeof (navigator.mediaDevices as any).getDisplayMedia === 'function')
  }, [])

  const isMyScreenSharing = localParticipant.isScreenShareEnabled

  const toggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isMyScreenSharing)
    } catch (err: any) {
      // User cancelled the chooser is the most common case — be quiet
      // about it.
      if (err?.name !== 'NotAllowedError') {
        showToast({
          type: 'danger',
          title: 'Screen share failed',
          message: err?.message ?? 'Try again',
          duration: 3000,
        })
      }
    }
  }

  // ── Disclaimer banner: dismiss persists per device ───────────
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return !localStorage.getItem('chatverse:theater:disclaimerDismissed') }
    catch { return true }
  })
  const dismissDisclaimer = () => {
    setShowDisclaimer(false)
    try { localStorage.setItem('chatverse:theater:disclaimerDismissed', '1') } catch { /* ignore */ }
  }

  const handleLeave = async () => {
    try { await theaterApi.end(roomName).catch(() => {}) } finally { navigate('/video') }
  }

  return (
    <>
      {/* Header */}
      <header className="shrink-0 h-12 px-3 sm:px-5 border-b border-[var(--color-line)] flex items-center gap-3 bg-[var(--color-surface-1)]">
        <span className="w-7 h-7 rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] inline-flex items-center justify-center shrink-0">
          <Monitor size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">Theater · {roomName.replace('th-', '')}</p>
          <p className="text-[11px] text-[var(--color-fg-mute)] flex items-center gap-1.5">
            <Users size={10} /> {participants.length}/10 watching
          </p>
        </div>
        <button
          onClick={handleLeave}
          className="h-8 px-3 rounded-md text-xs bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5"
          title="Leave theater"
        >
          <PhoneOff size={12} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </header>

      {/* Copyright disclaimer — one-time, dismissible */}
      {showDisclaimer && (
        <div className="shrink-0 px-3 sm:px-5 py-2 bg-[var(--color-warning-soft)] border-b border-[var(--color-warning-border)] flex items-start gap-2 text-[11px] text-[var(--color-warning-fg)]">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            Only share content you have the right to broadcast. Streaming
            copyrighted movies / paid sports without a licence is illegal.
            ChatVerse just provides the canvas — what's on screen is your
            responsibility.
          </span>
          <button
            onClick={dismissDisclaimer}
            className="shrink-0 px-2 text-[var(--color-warning-fg)] hover:text-[var(--color-fg)]"
            title="Got it"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Centre stage */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 sm:p-3 overflow-hidden">
        <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-[var(--color-line)] bg-black flex items-center justify-center">
          {someoneSharing && primaryScreen ? (
            <ParticipantTile trackRef={primaryScreen} className="w-full h-full" />
          ) : (
            <div className="text-center px-6 py-10 text-[var(--color-fg-mute)]">
              <Monitor size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium text-[var(--color-fg)]">No one is sharing yet</p>
              <p className="text-xs mt-1">
                {canShareScreen
                  ? 'Tap "Share screen" below to start the watch party.'
                  : 'Phone browsers can only view — ask a desktop user to share.'}
              </p>
            </div>
          )}
        </div>

        {/* Participant strip — small cam tiles so people still feel
            social during the watch party. Scrolls horizontally if you
            have many participants. */}
        {cameraTracks.length > 0 && (
          <div className="shrink-0 h-24 flex gap-2 overflow-x-auto pb-1">
            {cameraTracks.map((trackRef, i) => (
              <div
                key={trackRef.participant.identity + i}
                className="shrink-0 w-32 h-full rounded-md overflow-hidden border border-[var(--color-line)] bg-black"
              >
                <ParticipantTile trackRef={trackRef} className="w-full h-full" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Control bar */}
      <ControlBar
        canShareScreen={canShareScreen}
        isMyScreenSharing={isMyScreenSharing}
        onToggleScreenShare={toggleScreenShare}
      />
    </>
  )
}

function ControlBar({
  canShareScreen,
  isMyScreenSharing,
  onToggleScreenShare,
}: {
  canShareScreen: boolean
  isMyScreenSharing: boolean
  onToggleScreenShare: () => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

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

  return (
    <div className="shrink-0 h-14 px-3 border-t border-[var(--color-line)] flex items-center justify-center gap-2 bg-[var(--color-surface-1)]">
      <button
        onClick={toggleMic}
        className={[
          'w-10 h-10 rounded-full inline-flex items-center justify-center transition-colors',
          micOn
            ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]'
            : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={micOn ? 'Mute mic' : 'Unmute mic'}
      >
        {micOn ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      <button
        onClick={toggleCam}
        className={[
          'w-10 h-10 rounded-full inline-flex items-center justify-center transition-colors',
          camOn
            ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]'
            : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
      >
        {camOn ? <VideoIcon size={16} /> : <VideoOff size={16} />}
      </button>
      {canShareScreen && (
        <button
          onClick={onToggleScreenShare}
          className={[
            'h-10 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold transition-colors',
            isMyScreenSharing
              ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]',
          ].join(' ')}
          aria-label={isMyScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {isMyScreenSharing ? <MonitorOff size={14} /> : <Monitor size={14} />}
          <span>{isMyScreenSharing ? 'Stop sharing' : 'Share screen'}</span>
        </button>
      )}
    </div>
  )
}

function FullPageStatus({
  icon, children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-dim)] gap-3">
      {icon}
      <div className="text-center">{children}</div>
    </div>
  )
}
