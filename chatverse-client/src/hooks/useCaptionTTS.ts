import { useEffect, useRef } from 'react'
import type { CaptionLine } from './useCaptions'

/**
 * Listener-side text-to-speech for live captions.
 *
 * Pipeline recap:
 *   speaker mic → Web Speech STT → SignalR broadcast → useCaptions
 *   → translated final line → THIS hook → SpeechSynthesis utterance
 *
 * Why we only TTS FINAL lines (not interims):
 *   • Interims rewrite themselves rapidly. Speaking them produces a
 *     stuttery "the-the-the cat-the-cat sat" effect.
 *   • Finals are stable and almost always already translated by the
 *     time they reach us.
 *
 * Dedupe key:
 *   We use `${speakerId}-${at}-${textHash}` so the same final phrase
 *   (translation upgrade, network retry, etc.) is never spoken twice.
 *   The set is capped at 200 entries — enough for any reasonable call
 *   length without leaking memory.
 *
 * Voice selection:
 *   Web Speech exposes voices via `speechSynthesis.getVoices()` but the
 *   list often loads asynchronously after `voiceschanged` fires. We do
 *   a best-effort lookup at speak-time and fall back to letting the
 *   browser pick by language. Quality varies wildly across OSes — that
 *   is a known Web Speech limitation, not a bug we can fix here.
 */

/** Map an ISO short code ('hi') to a sensible BCP-47 tag for TTS ('hi-IN'). */
const BCP47_BY_SHORT: Record<string, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  ur: 'ur-PK',
  ar: 'ar-SA',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  ru: 'ru-RU',
  pt: 'pt-BR',
  it: 'it-IT',
}

function pickVoice(targetLang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const short = targetLang.split('-')[0].toLowerCase()
  const full = (BCP47_BY_SHORT[short] ?? targetLang).toLowerCase()
  // Prefer an exact full-tag match, then language family, then English fallback.
  return (
    voices.find((v) => v.lang.toLowerCase() === full) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(short + '-')) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  )
}

export function useCaptionTTS(opts: {
  lines: CaptionLine[]
  /** Listener's preferred language (ISO short, e.g. 'hi'). */
  preferredLang: string
  /** Master toggle. When false, in-flight utterances are cancelled. */
  enabled: boolean
  /** Local user's id — so we never speak our OWN voice back at us. */
  selfId?: string
  /** Speaking rate; default 1.05 nudges it slightly faster than default
   *  so subtitles don't pile up during fast conversation. */
  rate?: number
}) {
  const { lines, preferredLang, enabled, selfId, rate = 1.05 } = opts

  const spokenRef = useRef<Set<string>>(new Set())
  const lastVoicesLoadRef = useRef(false)

  // Kick the voices list load — on some browsers (Chrome) the first call
  // returns [] and `voiceschanged` fires shortly after.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (lastVoicesLoadRef.current) return
    lastVoicesLoadRef.current = true
    window.speechSynthesis.getVoices()
    const onVoices = () => window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', onVoices)
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices)
    }
  }, [])

  // Master kill switch — when the user toggles TTS off mid-utterance we
  // immediately stop, not waiting for the current sentence to finish.
  useEffect(() => {
    if (!enabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const targetShort = (preferredLang || 'en').toLowerCase()
    const targetFull = BCP47_BY_SHORT[targetShort] ?? preferredLang
    const voice = pickVoice(preferredLang)

    for (const line of lines) {
      // Skip non-final, mid-translation, and own-voice lines.
      if (!line.isFinal) continue
      if (line.pendingTranslation) continue
      if (selfId && line.speakerId === selfId) continue
      if (!line.text || line.text.trim().length === 0) continue

      const key = `${line.speakerId}-${line.at}-${line.text.length}-${line.text.slice(0, 24)}`
      if (spokenRef.current.has(key)) continue
      spokenRef.current.add(key)

      // Keep the dedupe set small — older entries are unlikely to repeat.
      if (spokenRef.current.size > 200) {
        const first = spokenRef.current.values().next().value
        if (first) spokenRef.current.delete(first)
      }

      try {
        const u = new SpeechSynthesisUtterance(line.text)
        u.lang = targetFull
        u.rate = rate
        u.pitch = 1
        u.volume = 1
        if (voice) u.voice = voice
        window.speechSynthesis.speak(u)
      } catch {
        /* ignore — TTS is best-effort */
      }
    }
  }, [lines, enabled, preferredLang, selfId, rate])

  // Stop everything on unmount (leaving the call).
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])
}
