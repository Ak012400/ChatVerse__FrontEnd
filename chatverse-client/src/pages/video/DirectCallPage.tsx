import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PhoneCall, PhoneOff, UserPlus, X, Mic, MicOff,
  Video as VideoIcon, VideoOff, Loader2,
} from 'lucide-react'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  RoomAudioRenderer,
  useRoomContext,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

import { directCallApi } from '../../api'
import { useChatHub } from '../../hooks/useChatHub'
import { useToastStore } from '../../stores/toastStore'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Input from '../../components/ui/Input'

type CallState =
  | { kind: 'idle' }
  | { kind: 'inviting'; targetUserId: string; inviteId?: string; roomName?: string }
  | { kind: 'incoming'; inviteId: string; callerId: string; callerName: string; roomName: string; message?: string }
  | { kind: 'connecting'; roomName: string }
  | { kind: 'in-call'; roomName: string; token: string; serverUrl: string }

export default function DirectCallPage() {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const { getConnection, safeInvoke } = useChatHub()

  const [state, setState] = useState<CallState>({ kind: 'idle' })
  const [targetInput, setTargetInput] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')

  /* Wire up hub events */
  useEffect(() => {
    const conn = getConnection()
    if (!conn) return

    const onIncomingCall = (payload: {
      inviteId: string
      callerId: string
      callerName: string
      roomName: string
      message?: string
    }) => {
      // Only show modal if we're not busy with another call.
      setState((prev) =>
        prev.kind === 'idle' ? { kind: 'incoming', ...payload } : prev,
      )
    }

    const onCallAccepted = async (payload: { inviteId: string; roomName: string }) => {
      // Both caller and callee land here. Fetch our token, switch to in-call.
      try {
        setState({ kind: 'connecting', roomName: payload.roomName })
        const res = await directCallApi.token(payload.roomName)
        const data = res.data.data
        setState({
          kind: 'in-call',
          roomName: data.roomName,
          token: data.token,
          serverUrl: data.serverUrl,
        })
      } catch {
        showToast({
          type: 'error',
          title: 'Could not start call',
          message: 'Token fetch failed. Try again.',
          duration: 3000,
        })
        setState({ kind: 'idle' })
      }
    }

    const onCallDeclined = (payload: { inviteId: string }) => {
      showToast({
        type: 'info',
        title: 'Call declined',
        message: 'The other side declined the call.',
        duration: 2500,
      })
      setState({ kind: 'idle' })
    }

    const onCallError = (payload: { inviteId: string; reason: string }) => {
      const msg =
        payload.reason === 'expired_or_invalid'
          ? 'Invite expired.'
          : payload.reason === 'not_invited'
            ? 'You weren\'t the recipient of this invite.'
            : 'Invite failed.'
      showToast({ type: 'warning', title: 'Call invite', message: msg, duration: 3000 })
      setState({ kind: 'idle' })
    }

    const onInviteSent = (payload: { inviteId: string; targetUserId: string; roomName: string }) => {
      setState({
        kind: 'inviting',
        targetUserId: payload.targetUserId,
        inviteId: payload.inviteId,
        roomName: payload.roomName,
      })
    }

    conn.on('IncomingCall', onIncomingCall)
    conn.on('CallAccepted', onCallAccepted)
    conn.on('CallDeclined', onCallDeclined)
    conn.on('CallError', onCallError)
    conn.on('CallInviteSent', onInviteSent)

    return () => {
      conn.off('IncomingCall', onIncomingCall)
      conn.off('CallAccepted', onCallAccepted)
      conn.off('CallDeclined', onCallDeclined)
      conn.off('CallError', onCallError)
      conn.off('CallInviteSent', onInviteSent)
    }
  }, [getConnection, showToast])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetInput.trim()) return
    await safeInvoke('InviteToCall', targetInput.trim(), inviteMessage || null)
  }

  const handleAccept = async () => {
    if (state.kind !== 'incoming') return
    await safeInvoke('AcceptCall', state.inviteId)
  }

  const handleDecline = async () => {
    if (state.kind !== 'incoming') return
    await safeInvoke('DeclineCall', state.inviteId)
    setState({ kind: 'idle' })
  }

  const handleHangUpInvite = async () => {
    setState({ kind: 'idle' })
  }

  const handleEndCall = () => {
    setState({ kind: 'idle' })
  }

  /* In-call: render LiveKit room */
  if (state.kind === 'in-call') {
    return (
      <LiveKitRoom
        token={state.token}
        serverUrl={state.serverUrl}
        video
        audio
        connect
        onDisconnected={handleEndCall}
        data-lk-theme="default"
        style={{ height: '100%', background: 'var(--color-bg)' }}
      >
        <RoomAudioRenderer />
        <DirectCallUI roomName={state.roomName} onLeave={handleEndCall} />
      </LiveKitRoom>
    )
  }

  /* Connecting screen */
  if (state.kind === 'connecting') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg)] gap-3">
        <Loader2 size={22} className="text-[var(--color-accent-fg)]" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-sm text-[var(--color-fg-dim)]">Connecting to call…</p>
      </div>
    )
  }

  /* Idle / inviting / incoming — all share the lobby canvas */
  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-md mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-4">
            <UserPlus size={22} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct call</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">
            Invite someone to a private 1-on-1.
          </p>
        </div>

        {state.kind === 'inviting' ? (
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 text-center">
            <Loader2 size={20} className="mx-auto text-[var(--color-accent-fg)] mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-sm font-medium mb-1">Ringing…</p>
            <p className="text-xs text-[var(--color-fg-faint)] mb-4">
              Invite sent. Waiting for them to accept (60s).
            </p>
            <Button variant="subtle" size="sm" onClick={handleHangUpInvite}>
              Cancel
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleInvite}
            className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 space-y-3"
          >
            <Input
              label="User ID"
              placeholder="Paste the user's id"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              hint="You'll get a UI search field later — for now paste the recipient's UUID."
            />
            <Input
              label="Message (optional)"
              placeholder="Hey, got a sec?"
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              size="lg"
              leftIcon={<PhoneCall size={15} />}
              disabled={!targetInput.trim()}
            >
              Ring them
            </Button>
          </form>
        )}

        <button
          onClick={() => navigate('/video')}
          className="block mx-auto mt-6 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
        >
          ← Pick a different mode
        </button>
      </div>

      {/* Incoming call modal — overlays the page */}
      {state.kind === 'incoming' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-lg p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] mb-4 animate-pulse">
                <PhoneCall size={22} className="text-[var(--color-accent-fg)]" />
              </div>
              <p className="text-sm text-[var(--color-fg-faint)]">Incoming call from</p>
              <p className="text-lg font-semibold tracking-tight mt-1">
                {state.callerName}
              </p>
              {state.message && (
                <p className="text-xs text-[var(--color-fg-dim)] mt-2 italic">
                  &ldquo;{state.message}&rdquo;
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleDecline}
                className="h-11 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] hover:bg-[var(--color-surface-3)] text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <X size={15} />
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="h-11 rounded-md bg-[var(--color-success)] hover:bg-[#16a34a] text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <PhoneCall size={15} />
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   In-call view for direct 1-on-1 — minimal controls.
───────────────────────────────────────────────────────────── */
function DirectCallUI({
  roomName,
  onLeave,
}: {
  roomName: string
  onLeave: () => void
}) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const tracks = useTracks([Track.Source.Camera])
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

  const leave = async () => {
    await room.disconnect()
    onLeave()
    navigate('/video')
  }

  return (
    <div className="relative h-full bg-black text-white">
      <header className="absolute top-0 inset-x-0 z-20 px-5 py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <div className="text-xs font-medium tracking-tight">Direct call</div>
        <div className="text-[10px] text-white/40 font-mono">{roomName}</div>
      </header>

      <div className="h-full pt-14 pb-24">
        {tracks.length > 0 ? (
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-white/40" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>

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
          End call
        </button>
      </div>
    </div>
  )
}
