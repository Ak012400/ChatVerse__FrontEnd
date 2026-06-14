import { useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatHub } from './useChatHub'

/**
 * Real-time YouTube playback sync via the YouTube IFrame Player API
 * (which is free — no key, no quota, no signup).
 *
 * Flow:
 *   1. Inject https://www.youtube.com/iframe_api once per page lifetime.
 *   2. Create a YT.Player attached to a host <div> on demand.
 *   3. Listen to onStateChange — when the user clicks play / pause or
 *      scrubs, broadcast through SignalR via `BroadcastTheaterControl`.
 *   4. Listen for `TheaterControlChanged` and apply the inverse:
 *        play  → seekTo(position) + playVideo()
 *        pause → seekTo(position) + pauseVideo()
 *        seek  → seekTo(position)
 *        sync  → seekTo(position) ONLY if drift > 2.5s
 *   5. A heartbeat timer broadcasts "sync" every 10s so late-network
 *      drift gets pulled back into alignment.
 *
 * Echo guard:
 *   When we apply a remote control message we set `applyingRef = true`
 *   for ~600ms. Any onStateChange that fires inside that window is
 *   ignored, so a single user action doesn't ping-pong around the room
 *   forever.
 */

// Light type stubs — we don't want to pull @types/youtube into the
// project just for two methods. The actual YT global is anything-typed.
type YTPlayer = {
  destroy(): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
}
type YTConstructor = {
  Player: new (
    id: string | HTMLElement,
    opts: {
      videoId: string
      playerVars?: Record<string, any>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onStateChange?: (e: { target: YTPlayer; data: number }) => void
      }
    },
  ) => YTPlayer
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5; UNSTARTED: -1 }
}

declare global {
  interface Window {
    YT?: YTConstructor
    onYouTubeIframeAPIReady?: () => void
    __cv_yt_api_loading?: boolean
    __cv_yt_api_ready?: boolean
    __cv_yt_api_callbacks?: Array<() => void>
  }
}

const DRIFT_THRESHOLD_SECONDS = 2.5
const HEARTBEAT_INTERVAL_MS = 10_000
const ECHO_GUARD_MS = 600

/**
 * Load the IFrame API once, then resolve. Subsequent calls return
 * immediately. Safe to call from many hook instances.
 */
function loadYtApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && (window as any).YT.Player) return resolve()
    if (!window.__cv_yt_api_callbacks) window.__cv_yt_api_callbacks = []
    window.__cv_yt_api_callbacks.push(resolve)

    if (window.__cv_yt_api_loading) return
    window.__cv_yt_api_loading = true

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      window.__cv_yt_api_ready = true
      const cbs = window.__cv_yt_api_callbacks ?? []
      window.__cv_yt_api_callbacks = []
      for (const cb of cbs) cb()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    document.head.appendChild(tag)
  })
}

/** Pull the videoId out of a youtube.com/embed/ID?... URL. */
export function youtubeVideoIdFromEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/youtube\.com\/embed\/([\w-]{11})/)
  return m ? m[1] : null
}

export function useYouTubeSync(opts: {
  roomName: string
  /** Video ID extracted from the synced URL — null if not a YouTube URL. */
  videoId: string | null
  /** Mount point for the YT.Player. Caller controls layout. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Toggle. When false the hook is fully inert. */
  enabled: boolean
}) {
  const { roomName, videoId, containerRef, enabled } = opts
  const { getConnection, safeInvoke, isConnected } = useChatHub()

  const playerRef = useRef<YTPlayer | null>(null)
  const applyingRef = useRef<boolean>(false)
  const heartbeatTimerRef = useRef<number | null>(null)

  // ── Build / tear down the player whenever the videoId changes.
  useEffect(() => {
    if (!enabled || !videoId || !containerRef.current) return
    let cancelled = false

    ;(async () => {
      await loadYtApi()
      if (cancelled || !containerRef.current || !window.YT) return

      // Wipe any previous mount node before creating a new player —
      // YT.Player replaces the div with an iframe, so on every new
      // videoId we need a fresh empty container.
      containerRef.current.innerHTML = ''
      const mount = document.createElement('div')
      mount.id = `yt-player-${Date.now()}`
      containerRef.current.appendChild(mount)

      playerRef.current = new window.YT.Player(mount, {
        videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => { /* no-op — initial play handled by autoplay */ },
          onStateChange: (e) => {
            if (applyingRef.current) return // suppress our own apply
            const state = e.data
            const PLAYING = 1
            const PAUSED = 2
            try {
              const t = e.target.getCurrentTime()
              if (state === PLAYING) {
                safeInvoke('BroadcastTheaterControl', roomName, 'play', t).catch(() => {})
              } else if (state === PAUSED) {
                safeInvoke('BroadcastTheaterControl', roomName, 'pause', t).catch(() => {})
              }
            } catch { /* ignore */ }
          },
        },
      })
    })()

    return () => {
      cancelled = true
      try { playerRef.current?.destroy() } catch { /* ignore */ }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoId])

  // ── Subscribe to remote control events.
  useEffect(() => {
    if (!enabled || !videoId) return
    const conn = getConnection()
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return

    const handler = (payload: { action: string; position: number }) => {
      const p = playerRef.current
      if (!p) return
      const targetTime = Math.max(0, payload.position ?? 0)

      applyingRef.current = true
      try {
        switch (payload.action) {
          case 'play':
            p.seekTo(targetTime, true)
            p.playVideo()
            break
          case 'pause':
            p.seekTo(targetTime, true)
            p.pauseVideo()
            break
          case 'seek':
            p.seekTo(targetTime, true)
            break
          case 'sync': {
            // Only correct drift when it's noticeable — small jitter
            // gets smoothed by the YT player itself.
            const local = p.getCurrentTime()
            if (Math.abs(local - targetTime) > DRIFT_THRESHOLD_SECONDS) {
              p.seekTo(targetTime, true)
            }
            break
          }
        }
      } catch { /* ignore */ }
      window.setTimeout(() => { applyingRef.current = false }, ECHO_GUARD_MS)
    }

    conn.on('TheaterControlChanged', handler)
    return () => {
      try { conn.off('TheaterControlChanged', handler) } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoId, isConnected()])

  // ── Heartbeat: every 10s broadcast current position as a "sync"
  //    event so any viewer who has drifted gets pulled back. Only
  //    the user who is currently playing emits — paused viewers
  //    don't need to broadcast nothing-changed messages.
  useEffect(() => {
    if (!enabled || !videoId) return
    heartbeatTimerRef.current = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        if (p.getPlayerState() === 1 /* PLAYING */) {
          const t = p.getCurrentTime()
          safeInvoke('BroadcastTheaterControl', roomName, 'sync', t).catch(() => {})
        }
      } catch { /* ignore */ }
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoId, roomName])
}
