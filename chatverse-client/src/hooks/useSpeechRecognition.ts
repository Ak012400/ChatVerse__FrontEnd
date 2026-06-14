import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Web Speech API wrapper for live mic-to-text transcription.
 *
 * Runs entirely in the browser — no audio leaves the device. Designed
 * for the live-captions feature: caller asks for transcription in their
 * spoken language; we emit interim phrases (typed-as-spoken feel) plus
 * a final pass on each natural pause.
 *
 * Browser support reality:
 *   • Chrome / Edge / Opera (Chromium)  → full support, Hindi + 50+ langs
 *   • Safari 14.5+ (macOS/iOS)          → supported via webkitSpeechRecognition
 *   • Firefox                           → not supported (returns isSupported=false)
 *
 * The `isSupported` flag lets the caller hide caption UI gracefully on
 * unsupported browsers without throwing.
 *
 * Lifecycle:
 *   1. consumer toggles `enabled` true
 *   2. hook starts recognition with the configured language
 *   3. onInterim / onFinal fire as phrases come in
 *   4. consumer toggles enabled false → recognition stops cleanly
 *
 * Edge cases handled:
 *   • Recognition has built-in auto-stop after silence; we restart it
 *     automatically while still enabled (continuous mode is buggy on
 *     Chrome — it sometimes stops at sentence boundaries anyway).
 *   • Permission denied → onError fires, hook self-disables.
 *   • Page hidden (tab switch) → keep going if possible; browser may
 *     suspend audio context, in which case the next phrase resumes us.
 */

// Minimal subset of the SpeechRecognition interface we actually use.
// Avoids pulling in the full DOM lib type, which conflicts in some
// strict TypeScript configs.
interface SRWindow extends Window {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

export type SpeechLang =
  | 'en-US' | 'en-IN' | 'en-GB'
  | 'hi-IN' | 'ta-IN' | 'te-IN' | 'bn-IN' | 'mr-IN' | 'kn-IN' | 'ml-IN' | 'gu-IN' | 'pa-IN' | 'ur-PK'
  | 'ar-SA' | 'es-ES' | 'fr-FR' | 'de-DE' | 'ja-JP' | 'zh-CN' | 'ko-KR' | 'ru-RU' | 'pt-BR' | 'it-IT'

export function useSpeechRecognition(opts: {
  enabled: boolean
  lang: SpeechLang
  /** Called on every partial recognition result (typed-as-spoken). */
  onInterim?: (text: string) => void
  /** Called when the recogniser commits a final phrase. */
  onFinal?: (text: string) => void
  /** Surfaced for "mic blocked" / "no support" toasts. */
  onError?: (kind: 'permission' | 'unsupported' | 'network' | 'unknown', message: string) => void
}) {
  const { enabled, lang, onInterim, onFinal, onError } = opts

  // We keep the latest callbacks in refs so the recogniser lifecycle
  // effect doesn't re-run every time the parent rebinds an arrow fn.
  const onInterimRef = useRef(onInterim)
  const onFinalRef = useRef(onFinal)
  const onErrorRef = useRef(onError)
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const w = typeof window !== 'undefined' ? (window as SRWindow) : undefined
  const SR = w?.SpeechRecognition ?? w?.webkitSpeechRecognition
  const isSupported = !!SR

  const recognitionRef = useRef<any>(null)
  const wantingRef = useRef(false)  // tracks user intent across auto-restarts
  const [listening, setListening] = useState(false)

  const stop = useCallback(() => {
    wantingRef.current = false
    setListening(false)
    try { recognitionRef.current?.stop?.() } catch { /* ignore */ }
    recognitionRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) { stop(); return }
    if (!isSupported) {
      console.warn('[captions] SpeechRecognition not supported in this browser')
      onErrorRef.current?.('unsupported', 'Speech recognition not available in this browser')
      return
    }

    console.log('[captions] starting SR', { lang })
    wantingRef.current = true

    const rec = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e: any) => {
      // Web Speech reports a transcript array that grows over the
      // session; we only care about the latest result index.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = (r[0]?.transcript ?? '').trim()
        if (!text) continue
        if (r.isFinal) {
          console.log('[captions] final:', text)
          onFinalRef.current?.(text)
        } else {
          // Interim logs are noisy — keep them minimal.
          onInterimRef.current?.(text)
        }
      }
    }

    rec.onstart = () => {
      console.log('[captions] SR onstart fired')
      setListening(true)
    }

    rec.onerror = (e: any) => {
      const code = e?.error ?? 'unknown'
      console.warn('[captions] SR error:', code, e?.message ?? '')
      const kind: 'permission' | 'network' | 'unknown' =
        code === 'not-allowed' || code === 'service-not-allowed' ? 'permission'
        : code === 'network' ? 'network'
        : 'unknown'
      // Tell the caller about EVERY error type, not just permission /
      // network. Common silent killers in Brave/Safari:
      //   • 'audio-capture' — mic device blocked at OS level
      //   • 'aborted'       — another caller cancelled the recogniser
      //   • 'no-speech'     — too long silent; benign, will auto-restart
      onErrorRef.current?.(kind, code)
      // Don't kill the recogniser on benign errors. Only 'permission'
      // and 'audio-capture' mean the user must do something.
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        wantingRef.current = false
      }
    }

    rec.onend = () => {
      console.log('[captions] SR onend')
      setListening(false)
      // Browser's idle auto-stop kicks in after long silences — restart
      // if the user is still intending to listen. A short timeout
      // smooths over rapid stop/start jitter.
      if (wantingRef.current) {
        window.setTimeout(() => {
          if (!wantingRef.current) return
          try {
            rec.start()
            setListening(true)
          } catch (err: any) {
            console.warn('[captions] restart failed:', err?.name, err?.message)
          }
        }, 250)
      }
    }

    recognitionRef.current = rec
    try {
      rec.start()
      // Note: don't set listening=true here — wait for onstart to
      // confirm. Otherwise we'd lie about state if start() silently
      // failed somewhere downstream.
    } catch (err: any) {
      console.warn('[captions] initial start() threw:', err?.name, err?.message)
      // start() can throw InvalidStateError if called too quickly
      // after a previous stop. Schedule a one-shot retry.
      window.setTimeout(() => {
        if (!wantingRef.current) return
        try {
          rec.start()
        } catch (err2: any) {
          console.warn('[captions] retry start() failed:', err2?.name, err2?.message)
          // Surface to caller so the UI can show "permission needed".
          onErrorRef.current?.('unknown', `start failed: ${err2?.message ?? err2?.name ?? 'unknown'}`)
        }
      }, 300)
    }

    return () => {
      wantingRef.current = false
      try { rec.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      setListening(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lang, isSupported])

  return { isSupported, listening, stop }
}
