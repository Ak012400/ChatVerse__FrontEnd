import { useCallback, useRef } from 'react'
import { useChatHub } from './useChatHub'
import { useSpeechRecognition, type SpeechLang } from './useSpeechRecognition'

/**
 * Speaker side of live captions: runs Web Speech on the local mic and
 * forwards recognised phrases to the SignalR caption group so other
 * participants can render + translate them.
 *
 * Design choice: we emit interim phrases through SignalR too (not just
 * finals) so receivers get a "typing-as-you-speak" feel. But to keep
 * the wire chatty-but-not-spammy, interim sends are debounced —
 * we collapse multiple rapid interims into one outgoing message every
 * 250ms. Finals are sent immediately because they're rare and they're
 * the ones that actually drive the translation cache.
 */
export function useCaptionBroadcaster(opts: {
  /** LiveKit room name — must match the JoinCaptionRoom group. */
  roomName: string | null
  /** Toggle from the call UI. */
  enabled: boolean
  /** Speaker's spoken language (full BCP-47, e.g. 'hi-IN'). */
  speakLang: SpeechLang
  onUnsupported?: () => void
  onPermissionDenied?: () => void
}) {
  const { roomName, enabled, speakLang, onUnsupported, onPermissionDenied } = opts
  const { safeInvoke } = useChatHub()

  // Source language as a short ISO code, derived from the BCP-47 tag.
  const sourceShort = speakLang.split('-')[0].toLowerCase()

  // ── Interim debounce. We hold the latest interim string in a ref
  //    and flush it at most every INTERIM_INTERVAL ms.
  const INTERIM_INTERVAL = 250
  const lastInterimSentRef = useRef<number>(0)
  const pendingInterimRef = useRef<string | null>(null)
  const interimTimerRef = useRef<number | null>(null)

  const flushInterim = useCallback(() => {
    if (!roomName) return
    const text = pendingInterimRef.current
    pendingInterimRef.current = null
    interimTimerRef.current = null
    if (!text) return
    lastInterimSentRef.current = Date.now()
    safeInvoke('BroadcastCaption', roomName, text, sourceShort, false)
      .catch(() => { /* network blips are OK to drop on interim */ })
  }, [roomName, sourceShort, safeInvoke])

  const onInterim = useCallback((text: string) => {
    if (!roomName) return
    pendingInterimRef.current = text
    const since = Date.now() - lastInterimSentRef.current
    if (since >= INTERIM_INTERVAL) {
      flushInterim()
    } else if (interimTimerRef.current === null) {
      interimTimerRef.current = window.setTimeout(flushInterim, INTERIM_INTERVAL - since)
    }
  }, [roomName, flushInterim])

  const onFinal = useCallback((text: string) => {
    if (!roomName) return
    // Cancel any pending interim — the final supersedes it.
    if (interimTimerRef.current !== null) {
      window.clearTimeout(interimTimerRef.current)
      interimTimerRef.current = null
    }
    pendingInterimRef.current = null
    safeInvoke('BroadcastCaption', roomName, text, sourceShort, true)
      .catch(() => { /* network blip — receivers may miss this phrase */ })
  }, [roomName, sourceShort, safeInvoke])

  const onError = useCallback((kind: 'permission' | 'unsupported' | 'network' | 'unknown') => {
    if (kind === 'unsupported') onUnsupported?.()
    if (kind === 'permission') onPermissionDenied?.()
  }, [onUnsupported, onPermissionDenied])

  const { isSupported, listening } = useSpeechRecognition({
    enabled: enabled && !!roomName,
    lang: speakLang,
    onInterim,
    onFinal,
    onError,
  })

  return { isSupported, listening }
}
