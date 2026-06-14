import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Maximize2 } from 'lucide-react'
import { useLocalParticipant, useRoomContext, useParticipants } from '@livekit/components-react'
import { useActiveCallStore } from '../../stores/activeCallStore'

/**
 * Floating mini-call widget — appears at the bottom-right of every
 * page WHEN there's an active call AND the user has navigated away
 * from the call's "home" route. Lets them keep mic / cam controls and
 * pop back to the full UI without dropping the connection.
 *
 * Must be rendered INSIDE the LiveKitRoom mount (in AppLayout) so the
 * useRoomContext / useLocalParticipant hooks resolve.
 */
export default function FloatingCallWidget() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const call = useActiveCallStore((s) => s.call)
  const endCall = useActiveCallStore((s) => s.endCall)

  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [seconds, setSeconds] = useState(0)

  // Wall-clock timer so users can see they're still connected. Resets
  // whenever a new call starts (call.startedAt change).
  useEffect(() => {
    if (!call) return
    setSeconds(Math.floor((Date.now() - call.startedAt) / 1000))
    const t = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - call.startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(t)
  }, [call?.startedAt, call])

  // Keep our local toggle state in sync with the participant — covers
  // edge cases like another tab hanging up our mic via a different
  // event path.
  useEffect(() => {
    setMicOn(localParticipant.isMicrophoneEnabled)
    setCamOn(localParticipant.isCameraEnabled)
  }, [localParticipant.isMicrophoneEnabled, localParticipant.isCameraEnabled])

  if (!call) return null
  // We're already on the call page — let the page own the controls.
  if (pathname === call.returnPath) return null
  // Theater room is technically a call but its own page handles full
  // UX even when navigated away briefly; skip the floating widget
  // there to avoid double-stacked controls during transitions.

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
  const hangUp = async () => {
    try { await room.disconnect() } catch { /* ignore */ }
    endCall()
  }
  const returnToCall = () => navigate(call.returnPath)

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div
      className="fixed bottom-20 right-3 sm:bottom-5 sm:right-5 z-[100] flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 rounded-full pl-2 pr-1 py-1 shadow-2xl"
      role="region"
      aria-label="Active call controls"
    >
      <button
        onClick={returnToCall}
        className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full hover:bg-white/10 transition-colors text-white text-xs"
        title="Return to call"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-medium">{call.label ?? `${call.kind} call`}</span>
        <span className="font-mono text-[11px] text-white/70">{mm}:{ss}</span>
        <span className="text-[10px] text-white/50">· {participants.length}</span>
        <Maximize2 size={11} className="text-white/60" />
      </button>

      <button
        onClick={toggleMic}
        className={[
          'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors',
          micOn ? 'text-white hover:bg-white/15' : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={micOn ? 'Mute' : 'Unmute'}
        title={micOn ? 'Mute' : 'Unmute'}
      >
        {micOn ? <Mic size={14} /> : <MicOff size={14} />}
      </button>

      <button
        onClick={toggleCam}
        className={[
          'w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors',
          camOn ? 'text-white hover:bg-white/15' : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={camOn ? 'Camera off' : 'Camera on'}
        title={camOn ? 'Camera off' : 'Camera on'}
      >
        {camOn ? <VideoIcon size={14} /> : <VideoOff size={14} />}
      </button>

      <button
        onClick={hangUp}
        className="w-8 h-8 rounded-full bg-[var(--color-danger)] hover:bg-[#dc2626] text-white inline-flex items-center justify-center"
        aria-label="End call"
        title="End call"
      >
        <PhoneOff size={14} />
      </button>
    </div>
  )
}
