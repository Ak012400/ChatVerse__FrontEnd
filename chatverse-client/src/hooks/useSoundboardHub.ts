import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'

// ============================================================
//  useSoundboardHub — connects to /hubs/soundboard for one scope.
//
//  Unlike the daily-feature hubs (Persona, Confessions, etc.), the
//  soundboard is bursty: a user opens a Theater room, taps "applause",
//  then maybe nothing for 10 min. So we keep the connection cheap and
//  scope-local. The hook joins the specific scope's SignalR group on
//  mount, plays incoming sounds, and leaves the group on unmount.
//
//  Audio playback:
//    Every SoundPlayed event spawns a fresh <audio> via cloneNode so
//    rapid-fire taps don't cut each other off mid-play. We honour an
//    optional muteSelf flag — usually you DON'T want to hear your own
//    button-press locally because the same sound will arrive back via
//    the server push moments later (echo). The page chooses.
//
//  Files:
//    Expected to live in `public/sounds/{soundId}.mp3`. The 8 ids are
//    listed in SOUNDS below. Drop-in mp3 assets at any time — the
//    paths are stable.
// ============================================================

export type SoundId =
  | 'laugh' | 'gasp' | 'drumroll' | 'applause'
  | 'fail'  | 'suspense' | 'oooh' | 'heartbeat'

export const SOUNDS: { id: SoundId; emoji: string; label: string }[] = [
  { id: 'laugh',     emoji: '😂', label: 'Laugh'    },
  { id: 'gasp',      emoji: '😮', label: 'Gasp'     },
  { id: 'drumroll',  emoji: '🥁', label: 'Drumroll' },
  { id: 'applause',  emoji: '👏', label: 'Applause' },
  { id: 'fail',      emoji: '📉', label: 'Fail'     },
  { id: 'suspense',  emoji: '🎬', label: 'Suspense' },
  { id: 'oooh',      emoji: '😏', label: 'Oooh'     },
  { id: 'heartbeat', emoji: '💓', label: 'Heartbeat'},
]

export type SoundboardScope = 'theater' | 'pyaar-live' | 'mehfil' | 'video'

export type SoundPlayedEvent = {
  soundId: SoundId
  byUserId: string
  byUsername: string
  atUtc: string
  scope: SoundboardScope
  scopeId: string
}

type Options = {
  scope: SoundboardScope
  scopeId: string | null | undefined
  /** Pass false when the page hasn't fully entered the room yet. */
  enabled?: boolean
  /** Optional callback fired right before audio plays — useful for a
   *  floating "X tapped Applause" toast / animation in the room UI. */
  onSoundPlayed?: (evt: SoundPlayedEvent) => void
}

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/soundboard'

// ─── Module-level singleton connection so the same browser tab only
//   opens ONE websocket regardless of how many rooms / scopes mount
//   the hook (e.g. a Theater room + a Mehfil tab side-by-side, or the
//   user navigating between rooms without unmounting AppLayout).
const sharedConnRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnPromiseRef: { current: Promise<void> | null } = { current: null }
const listeners = new Set<(e: SoundPlayedEvent) => void>()

// Audio cache: one base element per sound, cloned on each play so
// overlapping plays don't trample each other.
const audioCache = new Map<SoundId, HTMLAudioElement>()
function getAudio(id: SoundId): HTMLAudioElement {
  let el = audioCache.get(id)
  if (!el) {
    el = new Audio(`/sounds/${id}.mp3`)
    el.preload = 'auto'
    audioCache.set(id, el)
  }
  return el
}

function playLocal(id: SoundId, volume = 0.7) {
  const base = getAudio(id)
  const clone = base.cloneNode(true) as HTMLAudioElement
  clone.volume = volume
  clone.play().catch(() => {
    /* autoplay block — user hasn't gestured yet. Browser will allow on
       next user gesture. Silent failure is fine. */
  })
}

export function useSoundboardHub({ scope, scopeId, enabled = true, onSoundPlayed }: Options) {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const myUserId = useAuthStore((s) => s.user?.userId)
  const myUserIdRef = useRef<string | undefined>(myUserId)
  myUserIdRef.current = myUserId

  // Keep callback fresh without re-subscribing.
  const onSoundPlayedRef = useRef(onSoundPlayed)
  onSoundPlayedRef.current = onSoundPlayed

  // ─── Connect (once per tab) ───────────────────────────────
  useEffect(() => {
    if (!enabled || !token || !scopeId) return
    let cancelled = false

    const ensureConnected = async () => {
      if (sharedConnRef.current?.state === signalR.HubConnectionState.Connected) return
      if (sharedConnPromiseRef.current) return sharedConnPromiseRef.current

      const hub = new signalR.HubConnectionBuilder()
        .withUrl(`${HUB_URL}?access_token=${token}`, {
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect()
        .build()

      hub.on('SoundPlayed', (payload: SoundPlayedEvent) => {
        // Fan to all currently-mounted scope subscribers. Each subscriber
        // decides whether the payload matches its scope.
        for (const fn of listeners) fn(payload)
      })

      hub.onclose(() => {
        sharedConnRef.current = null
        sharedConnPromiseRef.current = null
      })

      const startPromise = hub.start().then(() => {
        sharedConnRef.current = hub
      }).catch((err) => {
        sharedConnPromiseRef.current = null
        throw err
      })
      sharedConnPromiseRef.current = startPromise
      return startPromise
    }

    let joined = false
    ;(async () => {
      try {
        await ensureConnected()
        if (cancelled) return
        await sharedConnRef.current?.invoke('JoinScope', scope, scopeId)
        joined = true
      } catch (err) {
        // Silent — soundboard is bonus polish, not core. Don't toast.
        console.warn('[soundboard] join failed', err)
      }
    })()

    // Local subscriber: filter to this scope + dispatch to the page +
    // play audio (unless it's our own tap — see playSound below for
    // local-echo handling).
    const sub = (e: SoundPlayedEvent) => {
      if (e.scope !== scope || e.scopeId !== scopeId) return
      onSoundPlayedRef.current?.(e)
      // Server-side echo of our own tap arrives back; skip local play to
      // avoid double-trigger (we already played locally on tap).
      if (e.byUserId && myUserIdRef.current && e.byUserId === myUserIdRef.current) return
      playLocal(e.soundId)
    }
    listeners.add(sub)

    return () => {
      cancelled = true
      listeners.delete(sub)
      if (joined && sharedConnRef.current?.state === signalR.HubConnectionState.Connected) {
        sharedConnRef.current.invoke('LeaveScope', scope, scopeId).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, scope, scopeId])

  /** Tap-fire a sound. Plays locally immediately for snappy feedback,
   *  then asks the server to fan to everyone else. */
  const playSound = useCallback(async (soundId: SoundId) => {
    if (!enabled || !scopeId) return
    playLocal(soundId)
    try {
      await sharedConnRef.current?.invoke('PlaySound', scope, scopeId, soundId)
    } catch (err: any) {
      // Most likely the rate-limit guard, but the server doesn't bubble
      // that as an exception (silent drop). So any error here is a
      // genuine wire problem — surface once, lightly.
      const msg = String(err?.message ?? '')
      if (msg.length > 0) {
        showToast({
          type: 'warning',
          title: 'Sound not sent',
          message: msg.includes('Unknown') ? 'Unsupported sound.' : 'Try again.',
          duration: 2000,
        })
      }
    }
  }, [enabled, scope, scopeId, showToast])

  return { playSound }
}
