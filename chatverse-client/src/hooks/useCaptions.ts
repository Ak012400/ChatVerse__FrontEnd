import { useCallback, useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatHub } from './useChatHub'
import { translateApi } from '../api'

/**
 * One displayed caption line.
 *
 * `text` is what we render — either the source phrase verbatim (when
 * source ≡ target language) or the translated version. `originalText`
 * is kept around so the listener can hover/long-press to see the
 * untranslated original — useful when translation drift is suspected.
 */
export interface CaptionLine {
  speakerId: string
  speakerName: string
  /** Source language code (ISO short, e.g. 'hi', 'en'). */
  sourceLang: string
  originalText: string
  text: string
  isFinal: boolean
  /** True if the line is still being translated (placeholder shown). */
  pendingTranslation?: boolean
  at: number
}

/**
 * Hook that wires the live-caption side channel into a caller's UI.
 *
 * Responsibilities:
 *   1. Join the SignalR `caption:{roomName}` group via the existing
 *      ChatHub connection (one hub, multiple side channels — no new
 *      WebSocket overhead).
 *   2. Receive "IncomingCaption" events fanned from other participants.
 *   3. Translate to the local user's preferred lang when source ≠ target.
 *   4. Maintain a small rolling buffer of recent lines (per speaker we
 *      replace the in-flight interim with the next interim, then the
 *      final replaces both — same flow YouTube auto-captions use).
 *
 * Performance + cost guards:
 *   • Local LRU cache keyed by `{originalText}|{targetLang}` so the
 *     same phrase doesn't re-call the backend even within one session.
 *   • Backend translate endpoint also has Redis cache, so a cold miss
 *     here may still be a cache hit there.
 *   • Translation is fired only for FINAL phrases — interims are
 *     rendered as-is in the source language to keep the conversation
 *     feeling live. Translating every interim would 10× our Groq spend.
 */
export function useCaptions(opts: {
  /** LiveKit room name — defines the caption group on the server. */
  roomName: string | null
  /** ISO short code: 'en', 'hi', 'fr', etc. Display target. */
  preferredLang: string
  /** Caller's intent — when false we silently leave the group. */
  enabled: boolean
}) {
  const { roomName, preferredLang, enabled } = opts

  const { getConnection, safeInvoke, isConnected } = useChatHub()
  const [lines, setLines] = useState<CaptionLine[]>([])
  const [error, setError] = useState<string | null>(null)

  // ── LRU cache for translation results (in-memory only — clears on
  //    refresh). Keeps the last 500 entries; tiny memory footprint and
  //    enough headroom for an hour-long call.
  const cacheRef = useRef<Map<string, string>>(new Map())
  const cacheGetSet = (key: string, value?: string): string | undefined => {
    const map = cacheRef.current
    if (value !== undefined) {
      map.delete(key)
      map.set(key, value)
      if (map.size > 500) {
        const first = map.keys().next().value
        if (first) map.delete(first)
      }
      return value
    }
    const hit = map.get(key)
    if (hit !== undefined) {
      // Touch LRU order
      map.delete(key)
      map.set(key, hit)
    }
    return hit
  }

  /**
   * Translate (or short-circuit) for a single incoming phrase, then
   * upsert into the lines state. Per-speaker rule: a new interim
   * replaces the previous interim from that speaker; a final replaces
   * any pending interim AND becomes the speaker's most recent final.
   */
  const ingestCaption = useCallback(async (payload: {
    speakerId: string
    speakerName: string
    text: string
    sourceLang: string
    isFinal: boolean
    at: string | number
  }) => {
    const source = (payload.sourceLang || 'en').toLowerCase()
    const target = (preferredLang || 'en').toLowerCase()
    const atMs = typeof payload.at === 'number' ? payload.at : Date.parse(payload.at) || Date.now()

    const sameLang = source.startsWith(target) || target.startsWith(source)

    // Interim path — never translate, just show source verbatim.
    if (!payload.isFinal) {
      upsert(setLines, {
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        sourceLang: source,
        originalText: payload.text,
        text: payload.text,
        isFinal: false,
        pendingTranslation: !sameLang, // signals UI to dim slightly
        at: atMs,
      })
      return
    }

    // Final path — show source first as a placeholder, then upgrade
    // to the translation once it lands. Saves the user waiting on a
    // blank line while Groq thinks.
    if (sameLang) {
      upsert(setLines, {
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        sourceLang: source,
        originalText: payload.text,
        text: payload.text,
        isFinal: true,
        at: atMs,
      })
      return
    }

    const cacheKey = `${payload.text}|${target}`
    const cached = cacheGetSet(cacheKey)
    if (cached) {
      upsert(setLines, {
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        sourceLang: source,
        originalText: payload.text,
        text: cached,
        isFinal: true,
        at: atMs,
      })
      return
    }

    // Optimistic placeholder while we wait for Groq.
    upsert(setLines, {
      speakerId: payload.speakerId,
      speakerName: payload.speakerName,
      sourceLang: source,
      originalText: payload.text,
      text: payload.text,
      isFinal: true,
      pendingTranslation: true,
      at: atMs,
    })

    try {
      const res = await translateApi.text(payload.text, target)
      const translated = res.data?.data?.translated ?? payload.text
      cacheGetSet(cacheKey, translated)
      upsert(setLines, {
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        sourceLang: source,
        originalText: payload.text,
        text: translated,
        isFinal: true,
        pendingTranslation: false,
        at: atMs,
      })
    } catch {
      // Leave the source-language placeholder in place — better than
      // erasing the line entirely.
      upsert(setLines, {
        speakerId: payload.speakerId,
        speakerName: payload.speakerName,
        sourceLang: source,
        originalText: payload.text,
        text: payload.text,
        isFinal: true,
        pendingTranslation: false,
        at: atMs,
      })
    }
  }, [preferredLang])

  // ── Wire the SignalR listener + group join/leave lifecycle.
  useEffect(() => {
    if (!enabled || !roomName) return
    const conn = getConnection()
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) {
      // Hub not yet up — the parent likely will re-render once it is,
      // and this effect re-runs. Be patient instead of erroring.
      return
    }

    const handler = (payload: any) => {
      if (payload?.speakerId && payload?.text) void ingestCaption(payload)
    }
    conn.on('IncomingCaption', handler)
    safeInvoke('JoinCaptionRoom', roomName).catch(() => setError('Failed to join caption group'))

    return () => {
      try { conn.off('IncomingCaption', handler) } catch { /* ignore */ }
      safeInvoke('LeaveCaptionRoom', roomName).catch(() => { /* best-effort */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomName, isConnected(), ingestCaption])

  const clear = useCallback(() => setLines([]), [])
  return { lines, clear, error }
}

/**
 * Per-speaker upsert: at most ONE active line per speaker. The new
 * payload replaces their previous line (interim or final). Old lines
 * from other speakers are bumped down the list but kept (max 8 lines
 * total visible at once — older entries fall off the bottom).
 */
function upsert(setLines: React.Dispatch<React.SetStateAction<CaptionLine[]>>, next: CaptionLine) {
  setLines((prev) => {
    const withoutSpeaker = prev.filter((l) => l.speakerId !== next.speakerId)
    return [...withoutSpeaker, next].slice(-8)
  })
}
