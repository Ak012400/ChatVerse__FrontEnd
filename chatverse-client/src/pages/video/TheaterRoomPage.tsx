import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Monitor, MonitorOff, Mic, MicOff, VideoOff, Video as VideoIcon,
  PhoneOff, Users, Loader2, AlertTriangle, Info,
  Globe, Search, ExternalLink, RefreshCw, X, Copy, Check,
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
import { useYouTubeSync, youtubeVideoIdFromEmbedUrl } from '../../hooks/useYouTubeSync'
import * as signalR from '@microsoft/signalr'

/**
 * Theater (Watch Party) — dual-mode edition.
 *
 * Two ways to watch together, picked by the host:
 *
 *   1. CO-BROWSE  — host pastes a URL (YouTube / Vimeo / Twitch /
 *      direct .mp4). The URL is SignalR-synced and each viewer loads
 *      the same page in their own iframe. Best quality per viewer
 *      (direct CDN), but each iframe plays independently → mild
 *      timing drift between viewers.
 *
 *   2. SCREEN SHARE — host streams their desktop pixels through
 *      LiveKit. Everyone sees the EXACT same frame in lock-step.
 *      Works for Netflix/Prime/Hotstar (and anything else that
 *      blocks iframe embedding). Quality limited by host upload.
 *
 * The mode itself is broadcast through `BroadcastTheaterState`, so
 * when the host toggles, every participant flips at the same time —
 * no one ends up looking at the wrong UI.
 *
 * Late-joiner support: server caches `{ mode, url }` in Redis for
 * 15 min and replays it on `JoinTheaterRoom`.
 *
 * Trust model unchanged: this room is private + invite-only, no
 * automated moderation, whoever picks the content owns the consequences.
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

type TheaterMode = 'cobrowse' | 'screenshare'

interface SharedState {
  mode: TheaterMode
  url: string | null
  hostName: string | null
  at: number
}

/**
 * Two flavours of quick source:
 *
 *   kind: 'iframe'   — known to allow embedding (the URL goes straight
 *                      into the broadcast → both viewers load it).
 *
 *   kind: 'external' — homepage / search-page that blocks iframe
 *                      embedding via X-Frame-Options. We OPEN IT IN A
 *                      NEW TAB so the host can find a video, copy the
 *                      URL, and paste it into the address bar above.
 *                      Trying to iframe these gives "refused to connect".
 */
type QuickSource =
  | { kind: 'iframe'; label: string; url: string; hint?: string }
  | { kind: 'external'; label: string; url: string; hint?: string }

const QUICK_SOURCES: QuickSource[] = [
  // The only true iframe-friendly free movie/series site on the list.
  { kind: 'iframe', label: 'Archive.org', url: 'https://archive.org/details/movies', hint: 'Free public-domain films — works inside the room' },
  // External searchers — opens in a new tab so the host can find a video,
  // then paste the URL back into the address bar.
  { kind: 'external', label: 'Search YouTube ↗', url: 'https://www.youtube.com/', hint: "YouTube's homepage blocks iframes — search here, then paste the video URL above" },
  { kind: 'external', label: 'Search Vimeo ↗', url: 'https://vimeo.com/', hint: 'Find a Vimeo video, paste its URL above' },
  { kind: 'external', label: 'Search Twitch ↗', url: 'https://www.twitch.tv/directory', hint: 'Pick a channel, paste its URL above' },
]

/** Sample URLs that ARE iframe-friendly — one-click paste to demo it. */
const SAMPLE_EMBEDS: { label: string; url: string }[] = [
  // Big Buck Bunny — license-clean, every YouTube watch-party demo uses it.
  { label: 'Try YouTube demo', url: 'https://www.youtube.com/watch?v=YE7VzlLtp-4' },
]

function TheaterUI({ roomName }: { roomName: string }) {
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const { getConnection, safeInvoke, isConnected } = useChatHub()

  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true })
  const primaryScreen = screenTracks[0] ?? null

  // Default to co-browse — that's what the user wanted as the headline
  // feature. Screen-share is the "fallback for Netflix" path.
  const [shared, setShared] = useState<SharedState>({
    mode: 'cobrowse', url: null, hostName: null, at: Date.now(),
  })
  const [urlInput, setUrlInput] = useState('')
  const [iframeError, setIframeError] = useState<'unknown' | 'blocked' | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const ytContainerRef = useRef<HTMLDivElement | null>(null)
  const loadTimerRef = useRef<number | null>(null)

  // YouTube videoId is extracted from our normalised embed URL. When
  // present we render the YT IFrame Player API (full play/pause/seek
  // sync) instead of the dumb iframe. Falls through to plain iframe
  // for non-YouTube URLs.
  const ytVideoId = shared.mode === 'cobrowse'
    ? youtubeVideoIdFromEmbedUrl(shared.url)
    : null
  useYouTubeSync({
    roomName,
    videoId: ytVideoId,
    containerRef: ytContainerRef,
    enabled: shared.mode === 'cobrowse' && !!ytVideoId,
  })

  // ── Join the SignalR theater group + subscribe to state changes.
  useEffect(() => {
    const conn = getConnection()
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return

    const handler = (payload: { mode: string; url?: string | null; hostName?: string | null; at?: string | number }) => {
      const mode: TheaterMode = payload.mode === 'screenshare' ? 'screenshare' : 'cobrowse'
      const atMs = typeof payload.at === 'number' ? payload.at : (payload.at ? Date.parse(payload.at) : Date.now())
      setShared({
        mode,
        url: payload.url ?? null,
        hostName: payload.hostName ?? null,
        at: atMs,
      })
      if (mode === 'cobrowse' && payload.url) setUrlInput(payload.url)
      setIframeError(null)
    }

    conn.on('TheaterStateChanged', handler)
    safeInvoke('JoinTheaterRoom', roomName).catch(() => {
      showToast({ type: 'warning', title: 'Sync offline', message: 'Mode sync unavailable — try refreshing.', duration: 3000 })
    })

    return () => {
      try { conn.off('TheaterStateChanged', handler) } catch { /* ignore */ }
      safeInvoke('LeaveTheaterRoom', roomName).catch(() => { /* best effort */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, isConnected()])

  // ── Iframe load detection (co-browse only).
  useEffect(() => {
    if (shared.mode !== 'cobrowse' || !shared.url) return
    setIframeError(null)
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current)
    loadTimerRef.current = window.setTimeout(() => {
      setIframeError((prev) => prev ?? 'unknown')
    }, 6000)
    return () => {
      if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current)
    }
  }, [shared.mode, shared.url])

  const onIframeLoad = () => {
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current)
      loadTimerRef.current = null
    }
  }

  /** Normalise embed-friendly patterns. */
  const normaliseUrl = (raw: string): string => {
    let url = raw.trim()
    if (!url) return ''
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    const ytWatch = url.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/)([\w-]{11})/)
    if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}?autoplay=1`
    const vimeo = url.match(/vimeo\.com\/(\d+)/)
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`
    const twitch = url.match(/^https?:\/\/(?:www\.)?twitch\.tv\/([\w-]+)(?:\/|$)/)
    if (twitch && !twitch[1].startsWith('videos')) {
      const parent = window.location.hostname || 'localhost'
      return `https://player.twitch.tv/?channel=${twitch[1]}&parent=${parent}`
    }
    return url
  }

  /** Broadcast just a URL (mode stays as-is, defaults to cobrowse). */
  const broadcastUrl = async (raw: string) => {
    const url = normaliseUrl(raw)
    if (!url) return
    try {
      await safeInvoke('BroadcastTheaterState', roomName, 'cobrowse', url)
    } catch {
      showToast({ type: 'danger', title: 'Sync failed', message: 'Could not broadcast the URL.', duration: 2500 })
    }
  }

  /** Switch mode — broadcasts to everyone so the UI flips in unison. */
  const switchMode = async (nextMode: TheaterMode) => {
    try {
      // Preserve URL when switching modes so a host can flip to
      // screen-share to deal with a Netflix link then flip back.
      await safeInvoke('BroadcastTheaterState', roomName, nextMode, nextMode === 'cobrowse' ? shared.url : null)
    } catch {
      showToast({ type: 'danger', title: 'Sync failed', message: 'Could not switch mode.', duration: 2500 })
    }
  }

  const onSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    broadcastUrl(urlInput)
  }

  // ── "Copy room ID" — host shares this with friends to invite them.
  //    Without this they had to fish the slug out of the URL bar.
  const [copied, setCopied] = useState(false)
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomName)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      showToast({ type: 'warning', title: 'Copy failed', message: roomName, duration: 3000 })
    }
  }

  // ── Disclaimer banner
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

  // ── Screen-share helpers (only meaningful in screenshare mode)
  const canShareScreen = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return !!(navigator.mediaDevices && typeof (navigator.mediaDevices as any).getDisplayMedia === 'function')
  }, [])
  const isMyScreenSharing = localParticipant.isScreenShareEnabled
  const toggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isMyScreenSharing)
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        showToast({ type: 'danger', title: 'Screen share failed', message: err?.message ?? 'Try again', duration: 3000 })
      }
    }
  }

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
            {shared.hostName && <span className="ml-2 truncate">· {shared.hostName}'s pick</span>}
          </p>
        </div>

        {/* Mode pill toggle — synced for everyone */}
        <div className="hidden sm:inline-flex rounded-full bg-[var(--color-surface-2)] p-0.5 text-[11px] font-semibold">
          <ModeButton active={shared.mode === 'cobrowse'} onClick={() => switchMode('cobrowse')}>
            <Globe size={11} /> Co-browse
          </ModeButton>
          <ModeButton active={shared.mode === 'screenshare'} onClick={() => switchMode('screenshare')}>
            <Monitor size={11} /> Screen share
          </ModeButton>
        </div>

        {/* Copy room ID — invitees paste this on the video lobby's
            "Join by ID" entry, or click a shared link. */}
        <button
          onClick={copyRoomId}
          className="hidden sm:inline-flex h-8 px-3 rounded-md text-xs items-center gap-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] transition-colors"
          title="Copy room ID — share with friends to invite them"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span className="font-mono">{copied ? 'Copied' : 'Room ID'}</span>
        </button>

        <button
          onClick={handleLeave}
          className="h-8 px-3 rounded-md text-xs bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] text-white inline-flex items-center gap-1.5"
          title="Leave theater"
        >
          <PhoneOff size={12} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </header>

      {/* Mobile mode pill — header was getting too cramped on phone */}
      <div className="sm:hidden shrink-0 px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] flex justify-center">
        <div className="inline-flex rounded-full bg-[var(--color-surface-2)] p-0.5 text-[11px] font-semibold">
          <ModeButton active={shared.mode === 'cobrowse'} onClick={() => switchMode('cobrowse')}>
            <Globe size={11} /> Co-browse
          </ModeButton>
          <ModeButton active={shared.mode === 'screenshare'} onClick={() => switchMode('screenshare')}>
            <Monitor size={11} /> Screen
          </ModeButton>
        </div>
      </div>

      {/* Disclaimer */}
      {showDisclaimer && (
        <div className="shrink-0 px-3 sm:px-5 py-2 bg-[var(--color-warning-soft)] border-b border-[var(--color-warning-border)] flex items-start gap-2 text-[11px] text-[var(--color-warning-fg)]">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            Private room — no automated moderation runs on whatever's on screen.
            The person picking the content is responsible for it.
          </span>
          <button onClick={dismissDisclaimer} className="shrink-0 px-2 text-[var(--color-warning-fg)] hover:text-[var(--color-fg)]" title="Got it" aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Co-browse address bar — only in cobrowse mode */}
      {shared.mode === 'cobrowse' && (
        <>
          <form onSubmit={onSubmitUrl} className="shrink-0 px-3 sm:px-5 py-2 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] flex items-center gap-2">
            <Globe size={14} className="text-[var(--color-fg-mute)] shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a YouTube / Vimeo / Twitch / direct video URL…"
              className="flex-1 h-9 px-3 rounded-md text-sm bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-line-strong)] text-[var(--color-fg)] placeholder-[var(--color-fg-mute)]"
            />
            <button type="submit" className="h-9 px-3 rounded-md text-xs font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] inline-flex items-center gap-1.5">
              <Search size={12} />
              <span>Play for all</span>
            </button>
          </form>

          <div className="shrink-0 px-3 sm:px-5 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)] font-semibold shrink-0">Sources:</span>
            {QUICK_SOURCES.map((src) => {
              if (src.kind === 'iframe') {
                // Loads inside the room — broadcast to all.
                return (
                  <button
                    key={src.url}
                    type="button"
                    onClick={() => { setUrlInput(src.url); broadcastUrl(src.url) }}
                    title={src.hint}
                    className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent)]/30 text-[var(--color-accent-fg)] inline-flex items-center gap-1 transition-colors"
                  >
                    <Globe size={10} />
                    {src.label}
                  </button>
                )
              }
              // External — opens in a new tab so the host can browse / search,
              // then come back and paste a video URL into the address bar.
              return (
                <a
                  key={src.url}
                  href={src.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={src.hint}
                  className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] inline-flex items-center gap-1 transition-colors"
                >
                  <ExternalLink size={10} />
                  {src.label}
                </a>
              )
            })}
            <span className="shrink-0 w-px h-4 bg-[var(--color-line)] mx-1" />
            {SAMPLE_EMBEDS.map((src) => (
              <button
                key={src.url}
                type="button"
                onClick={() => { setUrlInput(src.url); broadcastUrl(src.url) }}
                title="Demo URL — proves the room is wired up"
                className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium bg-[var(--color-success-soft,rgba(34,197,94,0.12))] hover:bg-[rgba(34,197,94,0.22)] text-[var(--color-success-fg,#22c55e)] transition-colors"
              >
                ▶ {src.label}
              </button>
            ))}
          </div>

          {/* One-line explainer so users don't waste 5 minutes wondering
              why "youtube.com" itself wouldn't load inside the iframe. */}
          <div className="shrink-0 px-3 sm:px-5 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] text-[10px] text-[var(--color-fg-mute)] leading-snug">
            <Info size={10} className="inline -mt-px mr-1" />
            Homepages of YouTube / Netflix / Prime block iframe embedding (browser security).
            Open them in a new tab, copy a <b>specific video URL</b>, and paste above — or use{' '}
            <b>Screen share</b> mode for sites that block.
          </div>
        </>
      )}

      {/* Centre stage */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 sm:p-3 overflow-hidden">
        <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-[var(--color-line)] bg-black flex items-center justify-center relative">
          {shared.mode === 'cobrowse' ? (
            shared.url ? (
              <>
                {ytVideoId ? (
                  // YouTube IFrame API mount — the hook attaches the
                  // player here and broadcasts play/pause/seek through
                  // SignalR. Sub-second sync across all viewers.
                  <div ref={ytContainerRef} className="w-full h-full" />
                ) : (
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
                )}
                {ytVideoId && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold tracking-wide inline-flex items-center gap-1 shadow-lg">
                    ▶ YT Synced
                  </span>
                )}
                {iframeError && !ytVideoId && (
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-black/85 text-white text-xs flex items-center gap-2">
                    <AlertTriangle size={14} className="text-[var(--color-warning-fg)] shrink-0" />
                    <span className="flex-1 leading-snug">
                      Looks like this site blocks embedded viewing. Switch to <b>Screen share</b> mode
                      (top right) — host opens it normally, everyone watches their screen.
                    </span>
                    <a href={shared.url} target="_blank" rel="noreferrer" className="shrink-0 px-2 py-1 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[11px] inline-flex items-center gap-1">
                      <ExternalLink size={11} /> Open
                    </a>
                    <button onClick={() => setIframeError(null)} className="shrink-0 px-1 text-white/70 hover:text-white" aria-label="Dismiss">
                      <X size={12} />
                    </button>
                  </div>
                )}
                {!ytVideoId && (
                  <button
                    onClick={() => { if (iframeRef.current) iframeRef.current.src = shared.url! }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white inline-flex items-center justify-center"
                    title="Reload"
                  >
                    <RefreshCw size={13} />
                  </button>
                )}
              </>
            ) : (
              <EmptyStage
                title="Nothing playing yet"
                body="Paste a video URL above or hit a quick-source to start the party. Everyone in the room loads the same page in their own browser."
              />
            )
          ) : (
            // SCREEN SHARE MODE
            primaryScreen ? (
              <ParticipantTile trackRef={primaryScreen} className="w-full h-full" />
            ) : (
              <EmptyStage
                title="No one is sharing yet"
                body={canShareScreen
                  ? 'Tap "Share screen" below to start the watch party. Use this for Netflix / Prime / Hotstar / anything that blocks iframe embedding.'
                  : 'Phone browsers can only view a screen share — ask a desktop user to start it.'}
              />
            )
          )}
        </div>

        {/* Webcam strip */}
        {cameraTracks.length > 0 && (
          <div className="shrink-0 h-20 flex gap-2 overflow-x-auto pb-1">
            {cameraTracks.map((trackRef, i) => (
              <div key={trackRef.participant.identity + i} className="shrink-0 w-28 h-full rounded-md overflow-hidden border border-[var(--color-line)] bg-black">
                <ParticipantTile trackRef={trackRef} className="w-full h-full" />
              </div>
            ))}
          </div>
        )}
      </div>

      <ControlBar
        mode={shared.mode}
        canShareScreen={canShareScreen}
        isMyScreenSharing={isMyScreenSharing}
        onToggleScreenShare={toggleScreenShare}
      />
    </>
  )
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-7 px-2.5 rounded-full inline-flex items-center gap-1 transition-colors',
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function EmptyStage({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center px-6 py-10 text-[var(--color-fg-mute)]">
      <Monitor size={32} className="mx-auto mb-3 opacity-50" />
      <p className="text-sm font-medium text-[var(--color-fg)]">{title}</p>
      <p className="text-xs mt-1 max-w-sm mx-auto">{body}</p>
    </div>
  )
}

function ControlBar({
  mode,
  canShareScreen,
  isMyScreenSharing,
  onToggleScreenShare,
}: {
  mode: TheaterMode
  canShareScreen: boolean
  isMyScreenSharing: boolean
  onToggleScreenShare: () => void
}) {
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

      {/* Share-screen button only appears in screen-share mode AND when
          the device supports getDisplayMedia (no mobile init). */}
      {mode === 'screenshare' && canShareScreen && (
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

function FullPageStatus({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-sm text-[var(--color-fg-dim)] gap-3">
      {icon}
      <div className="text-center">{children}</div>
    </div>
  )
}
