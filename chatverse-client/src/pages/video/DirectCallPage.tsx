import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  PhoneCall, PhoneOff, UserPlus, X, Mic, MicOff,
  Video as VideoIcon, VideoOff, Loader2,
} from 'lucide-react'
import { CaptionOverlay, CaptionsToggle, CaptionTTSToggle } from '../../components/call/CaptionOverlay'
import { useCaptionBroadcaster } from '../../hooks/useCaptionBroadcaster'
import { useCaptions, type CaptionLine } from '../../hooks/useCaptions'
import { useCaptionTTS } from '../../hooks/useCaptionTTS'
import { useCaptionsStore } from '../../stores/captionsStore'
import { useAuthStore } from '../../stores/authStore'
import {
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/components-react'
import AllParticipantsGrid from '../../components/call/AllParticipantsGrid'
import DraggableSelfTile from '../../components/call/DraggableSelfTile'
// `RoomOptions` is exported as a TypeScript type only (not a runtime value),
// so it needs the inline `type` modifier or the bundler errors out with
// "is not exported by livekit-client". `ConnectionState` and `DisconnectReason`
// are real enums and can be imported normally.
import { Track, ConnectionState, DisconnectReason, type RoomOptions } from 'livekit-client'
import { oneOnOneRoomOptions } from '../../lib/livekitOptions'
import '@livekit/components-styles'

import { directCallApi, usersApi } from '../../api'
import { useChatHub } from '../../hooks/useChatHub'
import { useToastStore } from '../../stores/toastStore'
import { useActiveCallStore } from '../../stores/activeCallStore'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Input from '../../components/ui/Input'
import Avatar from '../../components/ui/Avatar'

interface UserSearchHit {
  userId: string
  username: string
  trustScore: number
  ageVerified: boolean
}

type CallState =
  | { kind: 'idle' }
  | { kind: 'inviting'; targetUserId: string; inviteId?: string; roomName?: string }
  | { kind: 'incoming'; inviteId: string; callerId: string; callerName: string; roomName: string; message?: string }
  | { kind: 'connecting'; roomName: string }
  | { kind: 'in-call'; roomName: string; token: string; serverUrl: string }

export default function DirectCallPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToastStore()
  const { getConnection, safeInvoke } = useChatHub()
  const setCall = useActiveCallStore((s) => s.setCall)
  const activeCall = useActiveCallStore((s) => s.call)
  const endCall = useActiveCallStore((s) => s.endCall)

  const [state, setState] = useState<CallState>({ kind: 'idle' })
  const [targetInput, setTargetInput] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [searchHits, setSearchHits] = useState<UserSearchHit[]>([])
  const [picked, setPicked] = useState<UserSearchHit | null>(null)
  const [searching, setSearching] = useState(false)

  // When the user clicked "Accept" in IncomingCallModal we navigate
  // here with state {roomName | autoJoinRoomName, ...}. Pick that up on
  // mount and jump straight into the connecting state — no manual
  // search step.
  //
  // We accept BOTH field names ("roomName" and "autoJoinRoomName") so
  // that nothing breaks if either the modal or this page is updated
  // out-of-step. Earlier the modal sent `roomName` while this page only
  // looked for `autoJoinRoomName`, and the receiver got stuck on the
  // join form — the caller worked because they were already on this
  // page when CallAccepted fired.
  useEffect(() => {
    const navState = (location.state as { autoJoinRoomName?: string; roomName?: string; peerName?: string } | null) ?? null
    const roomName = navState?.autoJoinRoomName ?? navState?.roomName
    if (!roomName) return

    let cancelled = false
    ;(async () => {
      try {
        setState({ kind: 'connecting', roomName })
        const r = await directCallApi.token(roomName)
        const data = r.data?.data
        if (cancelled) return
        if (!data?.token || !data?.serverUrl) throw new Error('empty token payload')
        setState({ kind: 'in-call', roomName, token: data.token, serverUrl: data.serverUrl })
      } catch {
        if (cancelled) return
        showToast({ type: 'error', title: 'Could not join', message: 'The call could not start. Please try again.', duration: 3000 })
        setState({ kind: 'idle' })
      }
    })()

    // Clear the location state so a hard refresh doesn't replay auto-join.
    window.history.replaceState({}, '')
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (picked) return
    if (!targetInput.trim() || targetInput.trim().length < 2) {
      setSearchHits([])
      return
    }
    const handle = window.setTimeout(async () => {
      setSearching(true)
      try {
        const res = await usersApi.search(targetInput.trim())
        setSearchHits(res.data.data?.results ?? [])
      } catch {
        setSearchHits([])
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => window.clearTimeout(handle)
  }, [targetInput, picked])

  useEffect(() => {
    const conn = getConnection()
    if (!conn) return

    const onIncomingCall = (payload: {
      inviteId: string; callerId: string; callerName: string; roomName: string; message?: string
    }) => {
      setState((prev) => prev.kind === 'idle' ? { kind: 'incoming', ...payload } : prev)
    }

    const onCallAccepted = async (payload: { inviteId: string; roomName: string }) => {
      try {
        setState({ kind: 'connecting', roomName: payload.roomName })
        const res = await directCallApi.token(payload.roomName)
        const data = res.data.data
        setState({ kind: 'in-call', roomName: data.roomName, token: data.token, serverUrl: data.serverUrl })
      } catch {
        showToast({ type: 'error', title: 'Could not start call', message: 'Token fetch failed. Try again.', duration: 3000 })
        setState({ kind: 'idle' })
      }
    }

    const onCallDeclined = (_payload: { inviteId: string }) => {
      showToast({ type: 'info', title: 'Call declined', message: 'The other side declined the call.', duration: 2500 })
      setState({ kind: 'idle' })
    }

    const onCallError = (payload: { inviteId: string; reason: string }) => {
      const msg =
        payload.reason === 'expired_or_invalid' ? 'Invite expired.'
        : payload.reason === 'not_invited' ? "You weren't the recipient of this invite."
        : 'Invite failed.'
      showToast({ type: 'warning', title: 'Call invite', message: msg, duration: 3000 })
      setState({ kind: 'idle' })
    }

    const onInviteSent = (payload: { inviteId: string; targetUserId: string; roomName: string }) => {
      setState({ kind: 'inviting', targetUserId: payload.targetUserId, inviteId: payload.inviteId, roomName: payload.roomName })
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
    const targetId = picked?.userId ?? targetInput.trim()
    if (!targetId) return
    await safeInvoke('InviteToCall', targetId, inviteMessage || null)
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

  const handleHangUpInvite = async () => { setState({ kind: 'idle' }) }
  const handleEndCall = () => { setState({ kind: 'idle' }) }

  // Track whether the user pressed "Leave" themselves vs LiveKit dropping
  // the connection without our say-so. We only collapse to idle on a
  // user-initiated leave OR on a final unrecoverable disconnect; LiveKit's
  // built-in auto-reconnect handles transient network blips silently.
  const userInitiatedLeaveRef = (typeof window !== 'undefined' ? (window as any).__cv_call_leave_ref ??= { current: false } : { current: false })

  // Shared resilience kit (see lib/livekitOptions.ts): adaptive
  // streaming, simulcast layers, RED audio redundancy, clean capture
  // and a persistent 60s reconnect policy — one-on-one profile spends
  // the bandwidth budget on quality (720p capture).
  const roomOptions: RoomOptions = oneOnOneRoomOptions

  // Map LiveKit's DisconnectReason enum to a friendly toast + decide whether
  // the call should truly end. Network blips don't reach this callback —
  // they fire onReconnecting / onReconnected instead.
  const handleDisconnected = (reason?: DisconnectReason) => {
    const reasonName = reason !== undefined ? DisconnectReason[reason] : 'unknown'
    console.log(`[direct-call] disconnected (reason=${reasonName}, userInitiated=${userInitiatedLeaveRef.current})`)

    // Only nag the user if it wasn't them who hung up.
    if (!userInitiatedLeaveRef.current) {
      const msg =
        reason === DisconnectReason.SERVER_SHUTDOWN ? 'Server restarted — please try the call again.'
        : reason === DisconnectReason.DUPLICATE_IDENTITY ? 'You joined this call from another tab. That session won.'
        : reason === DisconnectReason.PARTICIPANT_REMOVED ? 'You were removed from the call by a moderator.'
        : reason === DisconnectReason.ROOM_DELETED ? 'The call ended.'
        : 'The call connection was lost.'
      showToast({ type: 'info', title: 'Call ended', message: msg, duration: 3000 })
    }
    userInitiatedLeaveRef.current = false
    setState({ kind: 'idle' })
  }

  const handleReconnecting = () => {
    console.log('[direct-call] reconnecting…')
    showToast({ type: 'info', title: 'Reconnecting…', message: 'Network blip — hold on.', duration: 2000 })
  }
  const handleReconnected = () => {
    console.log('[direct-call] reconnected')
    showToast({ type: 'success', title: 'Reconnected', message: 'You\'re back in the call.', duration: 1500 })
  }

  // ── Persistent-call sync. Three orthogonal effects (push / restore /
  //    clear) keep `state` and the global activeCallStore aligned
  //    without racing each other on first join — see RandomGroupPage
  //    for the full rationale.
  const inCallToken = state.kind === 'in-call' ? state.token : null
  const hadActiveCallRef = useRef(false)

  // 1. Push: local in-call → global
  useEffect(() => {
    if (state.kind !== 'in-call') return
    setCall({
      kind: 'direct',
      roomName: state.roomName,
      token: state.token,
      serverUrl: state.serverUrl,
      returnPath: '/video/invite',
      startedAt: Date.now(),
      roomOptions,
      label: 'Direct call',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCallToken])

  // 2. Restore: global has a direct call but we're idle (page just
  //    re-mounted after navigation) → put state back in-call so the
  //    UI shows the call instead of the join form.
  useEffect(() => {
    if (activeCall?.kind === 'direct' && state.kind === 'idle') {
      setState({
        kind: 'in-call',
        roomName: activeCall.roomName,
        token: activeCall.token,
        serverUrl: activeCall.serverUrl,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.token])

  // 3. Clear: only if we've previously observed a non-null activeCall.
  //    Guards against the initial-render gap where state is "in-call"
  //    but activeCall hasn't updated yet — without this the user gets
  //    bounced to the idle screen on join.
  useEffect(() => {
    if (activeCall) {
      hadActiveCallRef.current = true
      return
    }
    if (hadActiveCallRef.current && state.kind === 'in-call') {
      hadActiveCallRef.current = false
      handleDisconnected(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall])

  if (state.kind === 'in-call') {
    return (
      <DirectCallUI
        roomName={state.roomName}
        onLeave={() => { userInitiatedLeaveRef.current = true; endCall(); handleEndCall() }}
        onReconnecting={handleReconnecting}
        onReconnected={handleReconnected}
      />
    )
  }

  if (state.kind === 'connecting') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg)] gap-3">
        <Loader2 size={22} className="text-[var(--color-accent-fg)]" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-sm text-[var(--color-fg-dim)]">Connecting to call…</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="max-w-md mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-line)] mb-4">
            <UserPlus size={22} className="text-[var(--color-accent-fg)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct call</h1>
          <p className="text-sm text-[var(--color-fg-faint)] mt-1">Invite someone to a private 1-on-1.</p>
        </div>

        {state.kind === 'inviting' ? (
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 text-center">
            <Loader2 size={20} className="mx-auto text-[var(--color-accent-fg)] mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-sm font-medium mb-1">Ringing…</p>
            <p className="text-xs text-[var(--color-fg-faint)] mb-4">Invite sent. Waiting for them to accept (60s).</p>
            <Button variant="subtle" size="sm" onClick={handleHangUpInvite}>Cancel</Button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-5 space-y-3">
            {picked ? (
              <div className="p-3 rounded-md bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] flex items-center gap-3">
                <Avatar name={picked.username} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-fg)]">{picked.username}</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)]">Trust {picked.trustScore}/100</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPicked(null); setTargetInput('') }}
                  className="text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] px-2 py-1 rounded-md hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  label="Recipient"
                  placeholder="Search by username…"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  hint="Start typing — we'll show matching usernames."
                  autoComplete="off"
                />
                {targetInput.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-[var(--color-surface-2)] border border-[var(--color-line)] rounded-md shadow-lg max-h-64 overflow-y-auto">
                    {searching ? (
                      <div className="p-3 text-xs text-[var(--color-fg-faint)] text-center">Searching…</div>
                    ) : searchHits.length === 0 ? (
                      <div className="p-3 text-xs text-[var(--color-fg-faint)] text-center">No matches. They might need to sign up first.</div>
                    ) : (
                      searchHits.map((hit) => (
                        <button
                          key={hit.userId}
                          type="button"
                          onClick={() => { setPicked(hit); setTargetInput(hit.username); setSearchHits([]) }}
                          className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-[var(--color-surface-3)] text-left transition-colors"
                        >
                          <Avatar name={hit.username} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{hit.username}</p>
                            <p className="text-[11px] text-[var(--color-fg-faint)]">
                              Trust {hit.trustScore}/100{hit.ageVerified && ' · Age verified'}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

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
              disabled={!picked && !targetInput.trim()}
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

      {state.kind === 'incoming' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-lg p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-accent-soft)] border border-[rgba(99,102,241,0.3)] mb-4 animate-pulse">
                <PhoneCall size={22} className="text-[var(--color-accent-fg)]" />
              </div>
              <p className="text-sm text-[var(--color-fg-faint)]">Incoming call from</p>
              <p className="text-lg font-semibold tracking-tight mt-1">{state.callerName}</p>
              {state.message && (
                <p className="text-xs text-[var(--color-fg-dim)] mt-2 italic">&ldquo;{state.message}&rdquo;</p>
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

function DirectCallUI({
  roomName,
  onLeave,
  onReconnecting,
  onReconnected,
}: {
  roomName: string
  onLeave: () => void
  onReconnecting?: () => void
  onReconnected?: () => void
}) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  // Same placeholder dance as RandomGroupPage — without `withPlaceholder`,
  // a participant who just joined but hasn't finished publishing their
  // camera yet would be invisible, so 1-on-1 calls flicker between
  // "only me", "only them", and "no one" until both publish handshakes
  // complete. `onlySubscribed: false` ensures published-but-not-yet-
  // subscribed tracks also appear.
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  )
  // Split: self goes into a draggable PiP, remote goes in the main grid.
  // localParticipant.identity matches the LiveKit participant identity
  // (which the server sets to the user's chatverse user id).
  const selfTrack = tracks.find((t) => t.participant.isLocal)
  const remoteTracks = tracks.filter((t) => !t.participant.isLocal)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [callSeconds, setCallSeconds] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)

  // Subscribe to room-level reconnect events so we can show a translucent
  // overlay rather than letting the user think the call has died.
  useEffect(() => {
    if (!room) return
    const handleReconnecting = () => { setIsReconnecting(true); onReconnecting?.() }
    const handleReconnected = () => { setIsReconnecting(false); onReconnected?.() }
    const handleStateChange = (state: ConnectionState) => {
      console.log(`[direct-call] connection state: ${state}`)
    }
    room.on('reconnecting', handleReconnecting)
    room.on('reconnected', handleReconnected)
    room.on('connectionStateChanged', handleStateChange)
    return () => {
      room.off('reconnecting', handleReconnecting)
      room.off('reconnected', handleReconnected)
      room.off('connectionStateChanged', handleStateChange)
    }
  }, [room, onReconnecting, onReconnected])

  // Wall-clock duration display so the user can see how long the call
  // has been running — also a useful sanity check if calls feel short.
  useEffect(() => {
    const t = window.setInterval(() => setCallSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  // ── Live captions (Phase A) ─────────────────────────────────
  //  Speaker side: Web Speech transcribes the local mic and forwards
  //  phrases via the SignalR caption group. Receiver side: listens to
  //  the same group and translates as needed for the local user's
  //  preferred language. Both sides run unconditionally — the only
  //  toggle is whether captions are enabled at all.
  const captionsEnabled = useCaptionsStore((s) => s.enabled)
  const setCaptionsEnabled = useCaptionsStore((s) => s.setEnabled)
  const spokenLang = useCaptionsStore((s) => s.spokenLang)
  const preferredLang = useCaptionsStore((s) => s.preferredLang)
  const ttsEnabled = useCaptionsStore((s) => s.ttsEnabled)
  const setTtsEnabled = useCaptionsStore((s) => s.setTtsEnabled)
  const selfId = useAuthStore((s) => s.user?.userId)
  const { showToast } = useToastStore()

  // Self-caption: speaker's own STT echo so they see their words on
  // screen too. Without this, a solo tester thinks captions are broken.
  // Auto-clears 5s after the last update so finals don't linger forever.
  const [selfCaption, setSelfCaption] = useState<CaptionLine | null>(null)
  const selfClearTimerRef = useRef<number | null>(null)

  const broadcaster = useCaptionBroadcaster({
    roomName,
    enabled: captionsEnabled,
    speakLang: spokenLang,
    onUnsupported: () => {
      showToast({
        type: 'warning',
        title: 'Captions unavailable',
        message: 'Your browser does not support live speech recognition.',
        duration: 3500,
      })
      setCaptionsEnabled(false)
    },
    onPermissionDenied: () => {
      showToast({
        type: 'warning',
        title: 'Microphone access denied',
        message: 'Captions need mic permission — re-grant in browser settings.',
        duration: 4000,
      })
      setCaptionsEnabled(false)
    },
    onLocalCaption: (text, isFinal) => {
      setSelfCaption({
        speakerId: selfId ?? 'self',
        speakerName: 'You',
        sourceLang: spokenLang.split('-')[0].toLowerCase(),
        originalText: text,
        text,
        isFinal,
        at: Date.now(),
      })
      if (selfClearTimerRef.current) window.clearTimeout(selfClearTimerRef.current)
      selfClearTimerRef.current = window.setTimeout(() => setSelfCaption(null), 5000)
    },
  })

  const { lines: remoteCaptionLines } = useCaptions({
    roomName,
    preferredLang,
    enabled: captionsEnabled,
  })

  // Merge remote + local so the overlay shows both sides of the
  // conversation in a single subtitle strip, newest at the bottom.
  const captionLines: CaptionLine[] = selfCaption
    ? [...remoteCaptionLines, selfCaption]
    : remoteCaptionLines

  // TTS — read incoming translated finals aloud. Driven directly off
  // the REMOTE lines only (self-TTS would echo the speaker's own voice).
  useCaptionTTS({
    lines: remoteCaptionLines,
    preferredLang,
    enabled: captionsEnabled && ttsEnabled,
    selfId,
  })

  const toggleMic = async () => { const n = !micOn; await localParticipant.setMicrophoneEnabled(n); setMicOn(n) }
  const toggleCam = async () => { const n = !camOn; await localParticipant.setCameraEnabled(n); setCamOn(n) }
  const leave = async () => { await room.disconnect(); onLeave(); navigate('/video') }

  const mm = String(Math.floor(callSeconds / 60)).padStart(2, '0')
  const ss = String(callSeconds % 60).padStart(2, '0')

  return (
    <div className="relative h-full bg-black text-white">
      <header className="absolute top-0 inset-x-0 z-20 px-5 py-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <div className="text-xs font-medium tracking-tight flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          Direct call · {mm}:{ss}
        </div>
        <div className="text-[10px] text-white/40 font-mono">{roomName}</div>
      </header>

      {/* Reconnecting overlay — appears during transient network blips
          (LiveKit auto-retries internally). Call DOES NOT end here. */}
      {isReconnecting && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
          <Loader2 size={28} className="text-white" style={{ animation: 'spin 1s linear infinite' }} />
          <p className="text-sm font-medium">Reconnecting…</p>
          <p className="text-[11px] text-white/60">Hold on, network blip — we&apos;ll be right back.</p>
        </div>
      )}

      <div className="relative h-full pt-14 pb-24">
        {tracks.length > 0 ? (
          // Desktop compaction: cap the tile area at ~max-w-4xl so a
          // portrait-camera peer doesn't blow up across half the screen.
          // Mobile keeps full-bleed for maximum face area.
          //
          // We split: REMOTE tracks go into the main grid, SELF goes
          // into a draggable PiP that floats in the corner — Google
          // Meet style. Self can be dragged anywhere inside the call
          // area but constrained to it (never escapes the canvas).
          <div className="relative h-full w-full mx-auto lg:max-w-4xl lg:px-4">
            <AllParticipantsGrid tracks={remoteTracks} />
            {selfTrack && <DraggableSelfTile track={selfTrack} />}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={20} className="text-white/40" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {/* Live caption overlay — also handles the empty-state pill
            ("Listening…" / mic-muted warning) so users get feedback
            the moment they toggle captions on, even before anyone has
            actually spoken. */}
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

      <div className="absolute bottom-0 inset-x-0 z-30 px-5 pb-5 pt-12 flex items-center justify-center gap-2 bg-gradient-to-t from-black/85 to-transparent">
        <IconButton variant="subtle" size="lg" onClick={toggleMic} className={!micOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''} aria-label={micOn ? 'Mute' : 'Unmute'}>
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </IconButton>
        <IconButton variant="subtle" size="lg" onClick={toggleCam} className={!camOn ? '!bg-[var(--color-danger)] !text-white !border-[var(--color-danger)]' : ''} aria-label={camOn ? 'Stop camera' : 'Start camera'}>
          {camOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
        </IconButton>
        {/* Live captions toggle — only renders when the browser
            actually supports SpeechRecognition. The hook returns
            isSupported=false on Firefox so we'd be teasing the user. */}
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
        <button onClick={leave} className="h-11 px-5 rounded-md text-sm font-medium bg-[var(--color-danger)] hover:bg-[#dc2626] text-white inline-flex items-center gap-1.5 transition-colors">
          <PhoneOff size={15} />
          End call
        </button>
      </div>
    </div>
  )
}
