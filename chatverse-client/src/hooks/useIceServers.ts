import { useEffect, useState } from 'react'
import { iceApi } from '../api'

/**
 * Module-level cache so the second video page mount doesn't refetch
 * — ICE config rarely changes between sessions, and a stale TURN
 * credential will surface as a failed connection (which we already
 * handle with retry/skip).
 */
let cached: RTCIceServer[] | null = null
let inflight: Promise<RTCIceServer[]> | null = null

const FALLBACK_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

async function load(): Promise<RTCIceServer[]> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = iceApi
    .get()
    .then((r) => {
      const list = (r.data.data?.iceServers ?? []) as RTCIceServer[]
      cached = list.length > 0 ? list : FALLBACK_STUN
      return cached
    })
    .catch(() => {
      cached = FALLBACK_STUN
      return cached
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * Returns the ICE servers list for RTCPeerConnection. Always returns
 * something usable — falls back to Google STUN if the backend call
 * fails, so a network blip doesn't kill outbound video.
 */
export function useIceServers(): RTCIceServer[] {
  const [servers, setServers] = useState<RTCIceServer[]>(cached ?? FALLBACK_STUN)

  useEffect(() => {
    let cancelled = false
    if (!cached) {
      load().then((list) => {
        if (!cancelled) setServers(list)
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  return servers
}
