import { useEffect, useState } from 'react'
import { presenceApi } from '../api'

/**
 * Polls /api/presence/stats every `intervalMs` (default 30s) and returns
 * the live global online count + per-room counts for any room slugs
 * passed in. Cheap on the server (SCARD over a Redis Set), and the
 * endpoint is anonymous-safe so even the landing page can use it.
 *
 * Returns `null` until the first successful response so callers can
 * show a skeleton instead of a flash-of-zero.
 */
export function usePresence(roomSlugs: string[] = [], intervalMs = 30_000) {
  const [stats, setStats] = useState<{
    globalOnline: number
    byRoom: Record<string, number>
  } | null>(null)

  // Stringify slugs once so we don't re-fire the effect on every render
  // when the parent passes a fresh array literal.
  const slugsKey = roomSlugs.join(',')

  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const r = await presenceApi.stats(slugsKey ? slugsKey.split(',') : undefined)
        if (cancelled) return
        const data = r.data?.data
        if (data) setStats({ globalOnline: data.globalOnline ?? 0, byRoom: data.byRoom ?? {} })
      } catch {
        /* swallow — presence is non-critical */
      }
    }

    fetchOnce()
    const id = setInterval(fetchOnce, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [slugsKey, intervalMs])

  return stats
}
