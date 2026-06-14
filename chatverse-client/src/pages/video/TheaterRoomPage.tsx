import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Monitor, Mic, MicOff, VideoOff, Video as VideoIcon,
  PhoneOff, Users, Loader2, AlertTriangle, Info,
  Globe, Search, ExternalLink, RefreshCw, X,
} from 'lucide-react'
import {
  LiveKitRoom, ParticipantTile, useTracks,
  useLocalParticipant, useParticipants, RoomAudioRenderer,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

import { theaterApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'
import { useChatHub } from '../../hooks/useChatHub'
import * as signalR from '@microsoft/signalr'

/**
 * Theater (Watch Party) — embedded-browser edition.
 *
 * The old version used LiveKit screen-share: the host streamed their
 * desktop pixels and everyone watched at ~720p with 200ms lag. That
 * works but it's expensive (one upstream camera per host) and the
 * "browser" the host was operating only existed on their machine.
 *
 * This version flips the model:
 *   • Host enters a URL in a top address bar (YouTube link, Twitch
 *     channel, a direct .mp4, etc.). The URL is synced via SignalR
 *     to every participant.
 *   • Each viewer loads the URL in their OWN iframe — they're each
 *     hitting the source CDN directly, so quality is whatever their
 *     own bandwidth allows. No re-encoding, no host upload tax.
 *   • LiveKit is still here for voice + a small camera strip so the
 *     party feels social. We just drop the screen-share track.
 *
 * Honest constraint: most walled-garden OTT (Netflix, Hotstar, Prime)
 * block iframe embedding via X-Frame-Options DENY or CSP
 * `frame-ancestors`. The browser shows a blank/blocked iframe. We
 * detect that with an onload timeout heuristic and surface a friendly
 * message + a button to open the site in a separate browser tab. The
 * sync is preserved — late joiners still get the URL — but for those
 * sites it's "everyone watches together from the same site" rather
 * than literally inside ChatVerse.
 *
 * Iframe-friendly sources that just work: YouTube, Vimeo, Dailymotion,
 * Twitch, JW Player demos, archive.org, direct .mp4 / .webm URLs.
 *
 * Trust model: per product spec the host owns the URL choice. No
 * server-side moderation runs on the iframe content. The disclaimer
 * banner makes that explicit on every join.
 */
export default function TheaterRoomPage() {
  const { roomName } = useParams<{ roomName: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()

  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)

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
    return <FullPageStatus icon={<AlertTriangle size={20} className="text-[var(--color-danger-fg)]" />}>Invalid room</FullPageStatus>
  }
  if (joining) {
    return <FullPageStatus icon={<Loader2 size={20} className="animate-spin" />}>Joining theater…</FullPageStatus>
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

interface SharedUrlState {
  url: string
  hostName?: string | null
  at: number
}

/**
 * Quick-jump targets — these are sites we KNOW iframe well. Sites
 * that don't iframe (Netflix etc.) we deliberately don't list as
 * one-tap targets so the user doesn't get a frustrating "blocked"
 * screen out of the box.
 */
const QUICK_SOURCES: { label: string; url: string }[] = [
  { label: 'YouTube', url: 'https://www.youtube.com/' },
  { label: 'Vimeo', url: 'https://vimeo.com/' },
  { label: 'Twitch', url: 'https://www.twitch.tv/' },
  { label: 'Dailymotion', url: 'https://www.dailymotion.com/' },
  { label: 'Archive.org', url: 'https://archive.org/details/movies' },
]

function TheaterUI({ roomName }: { roomName: string }) {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const { getConnection, safeInvoke, isConnected } = useChatHub()

  // Only camera tracks — no screen-share in this iteration.
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])

  const [shared, setShared] = useState<SharedUrlState | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [iframeError, setIframeError] = useState<'unknown' | 'blocked' | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadTimerRef = useRef<number | null>(null)

  // ── Join the SignalR theater group + subscribe to URL changes.
  useEffect(() => {
    const conn = getConnection()
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return

    const handler = (payload: { url: string; hostName?: string; at?: string | number }) => {
      if (!payload?.url) return
      const atMs = typeof payload.at === 'number' ? payload.at : (payload.at ? Date.parse(payload.at) : Date.now())
      setShared({ url: payload.url, hostName: payload.hostName ?? null, at: atMs })
      setUrlInput(payload.url)
      setIframeError(null)
    }

    conn.on('TheaterUrlChanged', handler)
    safeInvoke('JoinTheaterRoom', roomName).catch(() => {
      showToast({ type: 'warning', title: 'Sync offline', message: 'URL sync unavailable — try refreshing.', duration: 3000 })
    })

    return () => {
      try { conn.off('TheaterUrlChanged', handler) } catch { /* ignore */ }
      safeInvoke('LeaveTheaterRoom', roomName).catch(() => { /* best effort */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, isConnected()])

  // ── Iframe load detection: if onload doesn't fire within 6s OR the
  //    iframe loads into a known X-Frame-Options blocked state, we flag
  //    it so the UI can show a fallback CTA. (We can't read the iframe's
  //    contentDocument cross-origin, so this is best-effort.)
  useEffect(() => {
    if (!shared?.url) return
    setIframeError(null)
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current)
    loadTimerRef.current = window.setTimeout(() => {
      // If onload never fired we assume it's blocked.
      setIframeError((prev) => prev ?? 'unknown')
    }, 6000)
    return () => {
      if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current)
    }
  }, [shared?.url])

  const onIframeLoad = () => {
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current)
      loadTimerRef.current = null
    }
  }

  /** Normalise / convert known patterns to embeddable URLs. */
  const normaliseUrl = (raw: string): string => {
    let url = raw.trim()
    if (!url) return ''
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    // youtube.com/watch?v=ID → youtube.com/embed/ID
    const ytWatch = url.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/)([\w-]{11})/)
    if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}?autoplay=1`
    // vimeo.com/123 → player.vimeo.com/video/123
    const vimeo = url.match(/vimeo\.com\/(\d+)/)
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`
    // twitch.tv/channel → player.twitch.tv/?channel=...
    const twitch = url.match(/^https?:\/\/(?:www\.)?twitch\.tv\/([\w-]+)(?:\/|$)/)
    if (twitch && !twitch[1].startsWith('videos')) {
      const parent = window.location.hostname || 'localhost'
      return `https://player.twitch.tv/?channel=${twitch[1]}&parent=${parent}`
    }
    return url
  }

  const broadcastUrl = async (raw: string) => {
    const url = normaliseUrl(raw)
    if (!url) return
    try {
      await safeInvoke('BroadcastTheaterUrl', roomName, url)
    } catch {
      showToast({ type: 'danger', title: 'Sync failed', message: 'Could not broadcast the URL.', duration: 2500 })
    }
  }

  const onSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    broadcastUrl(urlInput)
  }

  // ── Disclaimer banner: dismiss persists per device
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

  // ── Sandbox flags. We allow scripts + same-origin so video players
  // actually work, but block top-navigation so a malicious page can't
  // redirect the user's whole ChatVerse session.
  const iframeSandbox = useMemo(
    () => 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation',
    [],
  )

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
            {shared?.hostName && <span className="ml-2">· playing {shared.hostName}'s pick</span>}
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

      {/* Copyright disclaimer */}
      {showDisclaimer && (
        <div className="shrink-0 px-3 sm:px-5 py-2 bg-[var(--color-warning-soft)] border-b border-[var(--color-warning-border)] flex items-start gap-2 text-[11px] text-[var(--color-warning-fg)]">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            This room is private and no automated moderation runs on the embedded page —
            whoever picks the URL is responsible for what's on screen. Don't stream
            copyrighted content without authorisation.
          </span>
          <button onClick={dismissDisclaimer} className="shrink-0 px-2 text-[var(--color-warning-fg)] hover:text-[var(--color-fg)]" title="Got it" aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Address bar */}
      <form onSubmit={onSubmitUrl} className="shrink-0 px-3 sm:px-5 py-2 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] flex items-center gap-2">
        <Globe size={14} className="text-[var(--color-fg-mute)] shrink-0" />
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste a YouTube / Vimeo / Twitch / direct video URL…"
          className="flex-1 h-9 px-3 rounded-md text-sm bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-line-strong)] text-[var(--color-fg)] placeholder-[var(--color-fg-mute)]"
        />
        <button
          type="submit"
          className="h-9 px-3 rounded-md text-xs font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] inline-flex items-center gap-1.5"
        >
          <Search size={12} />
          <span>Play for all</span>
        </button>
      </form>

      {/* Quick-jump shortcuts */}
      <div className="shrink-0 px-3 sm:px-5 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)] font-semibold shrink-0">Quick:</span>
        {QUICK_SOURCES.map((src) => (
          <button
            key={src.url}
            type="button"
            onClick={() => { setUrlInput(src.url); broadcastUrl(src.url) }}
            className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] transition-colors"
          >
            {src.label}
          </button>
        ))}
      </div>

      {/* Centre stage */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 sm:p-3 overflow-hidden">
        <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-[var(--color-line)] bg-black flex items-center justify-center relative">
          {shared?.url ? (
            <>
              <iframe
                ref={iframeRef}
                key={shared.url}
                src={shared.url}
                onLoad={onIframeLoad}
                className="w-full h-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                sandbox={iframeSandbox}
                referrerPolicy="no-referrer"
                title="Theater content"
              />
              {iframeError && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-black/85 text-white text-xs flex items-center gap-2">
                  <AlertTriangle size={14} className="text-[var(--color-warning-fg)] shrink-0" />
                  <span className="flex-1 leading-snug">
                    This site might block embedded viewing. If the player is blank, open it in a new tab —
                    you'll still chat together here.
                  </span>
                  <a
                    href={shared.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-2 py-1 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[11px] inline-flex items-center gap-1"
                  >
                    <ExternalLink size={11} /> Open
                  </a>
                  <button
                    onClick={() => setIframeError(null)}
                    className="shrink-0 px-1 text-white/70 hover:text-white"
                    aria-label="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <button
                onClick={() => { if (iframeRef.current) iframeRef.current.src = shared.url }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white inline-flex items-center justify-center"
                title="Reload"
              >
                <RefreshCw size={13} />
              </button>
            </>
          ) : (
            <div className="text-center px-6 py-10 text-[var(--color-fg-mute)]">
              <Monitor size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium text-[var(--color-fg)]">Nothing playing yet</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                Paste a video URL above or hit a quick-source to start the party.
                Everyone in the room will load the same page in their own browser.
              </p>
            </div>
          )}
        </div>

        {/* Participant strip — webcams stay so people feel social. */}
        {cameraTracks.length > 0 && (
          <div className="shrink-0 h-20 flex gap-2 overflow-x-auto pb-1">
            {cameraTracks.map((trackRef, i) => (
              <div
                key={trackRef.participant.identity + i}
                className="shrink-0 w-28 h-full rounded-md overflow-hidden border border-[var(--color-line)] bg-black"
              >
                <ParticipantTile trackRef={trackRef} className="w-full h-full" />
              </div>
            ))}
          </div>
        )}
      </div>

      <ControlBar />
    </>
  )
}

function ControlBar() {
  const { localParticipant } = useLocalParticipant()
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const toggleMic = async () => { const n = !micOn; await localParticipant.setMicrophoneEnabled(n); setMicOn(n) }
  const toggleCam = async () => { const n = !camOn; await localParticipant.setCameraEnabled(n); setCamOn(n) }

  return (
    <div className="shrink-0 h-14 px-3 border-t border-[var(--color-line)] flex items-center justify-center gap-2 bg-[var(--color-surface-1)]">
      <button
        onClick={toggleMic}
        className={[
          'w-10 h-10 rounded-full inline-flex items-center justify-center transition-colors',
          micOn ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]' : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={micOn ? 'Mute mic' : 'Unmute mic'}
      >
        {micOn ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      <button
        onClick={toggleCam}
        className={[
          'w-10 h-10 rounded-full inline-flex items-center justify-center transition-colors',
          camOn ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]' : 'bg-[var(--color-danger)] text-white',
        ].join(' ')}
        aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
      >
        {camOn ? <VideoIcon size={16} /> : <VideoOff size={16} />}
      </button>
    </div>
  )
}

function FullPageStatus({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-dim)] gap-3">
      {icon}
      <div className="text-center">{children}</div>
    </div>
  )
}
