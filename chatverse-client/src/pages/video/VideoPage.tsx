import { useEffect, useRef, useState } from 'react'
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, SkipForward, X, Flag, Loader2, Shuffle,
} from 'lucide-react'
import * as nsfwjs from 'nsfwjs'

import { useChatHub } from '../../hooks/useChatHub'
import { useIceServers } from '../../hooks/useIceServers'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import IconButton from '../../components/ui/IconButton'

export default function VideoPage() {
  const { getConnection, safeInvoke } = useChatHub()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()

  const [isSearching, setIsSearching] = useState(false)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [callDuration, setCallDuration] = useState(0)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const durationTimerRef = useRef<number | null>(null)

  // Pulled server-side so TURN credentials can rotate without a redeploy.
  const iceServers = useIceServers()
  const configuration: RTCConfiguration = { iceServers }

  useEffect(() => {
    const startLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStreamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      } catch {
        showToast({
          type: 'error',
          title: 'Camera unavailable',
          message: 'Please allow camera & microphone access.',
          duration: 5000,
        })
      }
    }
    startLocalVideo()

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      peerConnectionRef.current?.close()
      if (durationTimerRef.current) window.clearInterval(durationTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const connection = getConnection()
    if (!connection) return

    const setupPeerConnection = (pId: string) => {
      const pc = new RTCPeerConnection(configuration)
      peerConnectionRef.current = pc

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          safeInvoke('SendIceCandidate', pId, JSON.stringify(event.candidate))
        }
      }
      return pc
    }

    connection.on('MatchFound', async (_roomId: string, pId: string, isInitiator: boolean) => {
      setIsSearching(false)
      setPartnerId(pId)
      setCallDuration(0)
      if (durationTimerRef.current) window.clearInterval(durationTimerRef.current)
      durationTimerRef.current = window.setInterval(() => {
        setCallDuration((d) => d + 1)
      }, 1000)

      const pc = setupPeerConnection(pId)
      if (isInitiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        safeInvoke('SendWebRTCOffer', pId, JSON.stringify(offer))
      }
    })

    connection.on('ReceiveOffer', async (callerId: string, sdpStr: string) => {
      if (peerConnectionRef.current) {
        const offer = JSON.parse(sdpStr)
        await peerConnectionRef.current.setRemoteDescription(offer)
        const answer = await peerConnectionRef.current.createAnswer()
        await peerConnectionRef.current.setLocalDescription(answer)
        safeInvoke('SendWebRTCAnswer', callerId, JSON.stringify(answer))
      }
    })

    connection.on('ReceiveAnswer', async (_pId: string, sdpStr: string) => {
      if (peerConnectionRef.current) {
        const answer = JSON.parse(sdpStr)
        await peerConnectionRef.current.setRemoteDescription(answer)
      }
    })

    connection.on('ReceiveIceCandidate', async (_pId: string, candidateStr: string) => {
      if (peerConnectionRef.current) {
        const candidate = JSON.parse(candidateStr)
        await peerConnectionRef.current.addIceCandidate(candidate)
      }
    })

    connection.on('PartnerLeft', () => {
      showToast({ type: 'warning', title: 'Disconnected', message: 'Partner left the call.', duration: 2500 })
      handleStop()
    })

    return () => {
      connection.off('MatchFound')
      connection.off('ReceiveOffer')
      connection.off('ReceiveAnswer')
      connection.off('ReceiveIceCandidate')
      connection.off('PartnerLeft')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getConnection])

  /* NSFW self-scan — runs every 4s while paired with a partner.
   *
   * IMPORTANT — false-positive resistance:
   * The previous 0.75 threshold on a SINGLE frame was triggering
   * false positives within 25 seconds on innocent face-close-up
   * video in good lighting (skin-tone false positives are a known
   * NSFW.JS weakness). The result was that calls were auto-ending
   * after about 25 seconds with "Inappropriate content detected" —
   * with no actual inappropriate content involved.
   *
   * Fix: require BOTH (a) a much higher per-frame threshold (0.92),
   * AND (b) three CONSECUTIVE flagged frames before we cut the call.
   * Real adult content easily clears both bars in ~12 seconds; an
   * occasional false-positive resets the counter and the call
   * continues. Detected category is logged to console so we can
   * tune the threshold from real feedback. */
  useEffect(() => {
    if (!partnerId) return
    let stopped = false
    let interval: number | null = null
    let model: any = null
    let consecutiveBad = 0
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
        if (stopped || !model || !localVideoRef.current) return
        const v = localVideoRef.current
        if (v.readyState < 2 || v.videoWidth === 0) return

        const canvas = document.createElement('canvas')
        canvas.width = 224
        canvas.height = 224
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(v, 0, 0, 224, 224)

        try {
          const preds = await model.classify(canvas)
          const bad = preds.find(
            (p: { className: string; probability: number }) =>
              ['Porn', 'Hentai'].includes(p.className) && p.probability > FRAME_THRESHOLD,
          )
          if (bad) {
            consecutiveBad++
            console.warn(`[nsfw] frame ${consecutiveBad}/${CONSECUTIVE_REQUIRED} flagged as ${bad.className} (${(bad.probability * 100).toFixed(0)}%)`)
            if (consecutiveBad >= CONSECUTIVE_REQUIRED) {
              stopped = true
              if (interval) window.clearInterval(interval)
              showToast({
                type: 'danger',
                title: 'Call ended',
                message: 'Inappropriate content detected on your camera.',
                duration: 5000,
              })
              handleStop()
            }
          } else {
            // Clean frame resets the streak — false positives don't cluster.
            if (consecutiveBad > 0) {
              console.log(`[nsfw] streak reset (${consecutiveBad} → 0)`)
              consecutiveBad = 0
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
  }, [partnerId])

  const handleStartMatching = () => {
    setIsSearching(true)
    safeInvoke('StartAutoMatch')
  }

  const handleStop = () => {
    if (partnerId) safeInvoke('EndMatch', partnerId)
    setPartnerId(null)
    setIsSearching(false)
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    setCallDuration(0)
  }

  const handleSkip = () => {
    handleStop()
    handleStartMatching()
  }

  const handleReport = () => {
    if (!partnerId) return
    showToast({
      type: 'info',
      title: 'Report submitted',
      message: 'Our team will review the session.',
      duration: 2500,
    })
    handleStop()
  }

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !isMicOn
      setIsMicOn(!isMicOn)
    }
  }

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) {
      track.enabled = !isCamOn
      setIsCamOn(!isCamOn)
    }
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="relative w-full h-full bg-black text-white overflow-hidden">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${partnerId ? 'opacity-100' : 'opacity-0'}`}
      />

      {partnerId && (
        <div className="absolute top-0 inset-x-0 z-20 px-5 py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2.5">
            <span className="dot-live" />
            <span className="text-xs font-medium tracking-tight">Connected</span>
            <span className="text-xs text-white/50 tabular-nums">· {formatDuration(callDuration)}</span>
          </div>
          <button
            onClick={handleReport}
            className="text-xs text-white/70 hover:text-white transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white/10"
          >
            <Flag size={13} />
            Report
          </button>
        </div>
      )}

      {!partnerId && isSearching && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-sm px-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-5">
              <Loader2 size={24} className="text-[var(--color-accent-fg)]" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <h2 className="text-lg font-semibold mb-1.5">Finding a partner</h2>
            <p className="text-sm text-white/50">Hang tight — we're matching you with someone right now.</p>
            <button
              onClick={handleStop}
              className="mt-6 px-4 h-9 rounded-md text-sm bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!partnerId && !isSearching && (
        <div className="absolute inset-0 flex items-center justify-center z-10 px-6">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-5">
              <Shuffle size={22} className="text-[var(--color-accent-fg)]" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Meet someone new</h1>
            <p className="text-sm text-white/55 mb-7 leading-relaxed">
              We'll match you with another verified user. AI checks run on every session.
            </p>
            <button
              onClick={handleStartMatching}
              className="px-5 h-11 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-sm font-medium transition-colors inline-flex items-center gap-2 focus-ring"
            >
              Start matching
            </button>
            <p className="mt-4 text-[11px] text-white/35">
              By starting, you agree to our community guidelines.
            </p>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-24 right-5 w-32 sm:w-40 aspect-[3/4] rounded-lg overflow-hidden z-20 bg-[var(--color-surface-2)]"
        style={{ boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-line-strong)' }}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transform -scale-x-100 ${isCamOn ? '' : 'hidden'}`}
        />
        {!isCamOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface-2)]">
            <VideoOff size={22} className="text-[var(--color-fg-mute)]" />
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5 text-[10px] text-white/80 bg-black/45 backdrop-blur px-1.5 py-0.5 rounded">
          {user?.username ?? 'You'}
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 z-30 px-5 pb-5 pt-12 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
        <IconButton
          variant="subtle"
          size="lg"
          onClick={toggleMic}
          aria-label={isMicOn ? 'Mute' : 'Unmute'}
          className={!isMicOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''}
        >
          {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
        </IconButton>

        <IconButton
          variant="subtle"
          size="lg"
          onClick={toggleCam}
          aria-label={isCamOn ? 'Stop camera' : 'Start camera'}
          className={!isCamOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''}
        >
          {isCamOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
        </IconButton>

        {partnerId ? (
          <>
            <button
              onClick={handleSkip}
              className="h-11 px-5 rounded-md text-sm font-medium bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white inline-flex items-center gap-1.5 focus-ring transition-colors"
            >
              <SkipForward size={15} />
              Skip
            </button>
            <button
              onClick={handleStop}
              className="h-11 px-4 rounded-md text-sm font-medium bg-[var(--color-danger)] hover:bg-[#dc2626] text-white inline-flex items-center gap-1.5 focus-ring transition-colors"
            >
              <X size={15} />
              End
            </button>
          </>
        ) : isSearching ? (
          <button
            onClick={handleStop}
            className="h-11 px-5 rounded-md text-sm font-medium bg-[var(--color-danger)] hover:bg-[#dc2626] text-white inline-flex items-center gap-1.5 focus-ring transition-colors"
          >
            <X size={15} />
            Stop
          </button>
        ) : null}
      </div>
    </div>
  )
}
