import { useCallback, useState } from 'react'
import api from '../api/client'

interface TranslationState {
  loading: boolean
  translated?: string
  error?: string
}

/**
 * Per-message translation cache. Keyed by message ID so each rendered
 * message owns its own translation state — clicking translate on one
 * message does not affect any other.
 *
 * The state is intentionally kept in component memory rather than a
 * global Zustand store: translations are ephemeral and re-mounting the
 * room should clear them. If the user wants to keep a translation
 * visible across navigations, they can re-click translate (cheap, our
 * Groq quota easily handles repeated requests).
 *
 * Detection of the target language is the caller's responsibility — we
 * just take whatever the caller asks for and pass it to the backend
 * /api/translate endpoint. The default `navigator.language` works for
 * English/Hindi; users can change it via the i18n switcher.
 */
export function useTranslation() {
  const [byId, setById] = useState<Record<string, TranslationState>>({})

  const translate = useCallback(async (messageId: string, text: string, targetLang: string) => {
    if (!text.trim()) return
    setById((m) => ({ ...m, [messageId]: { loading: true } }))
    try {
      const res = await api.post<{ data: { translated: string } }>(
        '/translate',
        { text, targetLang },
      )
      const translated = res.data?.data?.translated
      if (!translated) throw new Error('empty')
      setById((m) => ({ ...m, [messageId]: { loading: false, translated } }))
    } catch (err: any) {
      setById((m) => ({
        ...m,
        [messageId]: { loading: false, error: 'Translation failed' },
      }))
    }
  }, [])

  const clear = useCallback((messageId: string) => {
    setById((m) => {
      const next = { ...m }
      delete next[messageId]
      return next
    })
  }, [])

  const get = useCallback(
    (messageId: string): TranslationState | undefined => byId[messageId],
    [byId],
  )

  return { translate, clear, get }
}

/**
 * Returns the user's preferred 2-letter language code derived from
 * either an explicit i18next language setting or the browser locale.
 * Falls back to "en" if neither is parseable.
 */
export function preferredLanguageCode(): string {
  // i18next persists its selection under this localStorage key.
  const i18nNext = localStorage.getItem('i18nextLng')
  const raw = i18nNext || navigator.language || 'en'
  const lower = raw.toLowerCase().split('-')[0]
  // Restrict to the codes the backend handles.
  const supported = new Set([
    'en', 'hi', 'ta', 'te', 'bn', 'mr', 'kn', 'ml', 'gu', 'pa',
    'ur', 'ar', 'es', 'fr', 'de', 'ja', 'zh', 'ko', 'ru', 'pt', 'it',
  ])
  return supported.has(lower) ? lower : 'en'
}

/**
 * Heuristic language detection — based on Unicode block ranges in the
 * text. Quick and library-free; enough to decide whether to SHOW a
 * translate icon vs hide it.
 *
 * Returns null if the text is too ambiguous to classify (very short,
 * pure emoji, etc.) — the caller can decide whether to still show
 * translate as a fallback.
 */
export function detectLanguage(text: string): string | null {
  if (!text || text.trim().length < 4) return null
  const sample = text.slice(0, 200)
  // Devanagari (Hindi, Marathi, Sanskrit, etc.)
  if (/[ऀ-ॿ]/.test(sample)) return 'hi'
  // Bengali
  if (/[ঀ-৿]/.test(sample)) return 'bn'
  // Tamil
  if (/[஀-௿]/.test(sample)) return 'ta'
  // Telugu
  if (/[ఀ-౿]/.test(sample)) return 'te'
  // Kannada
  if (/[ಀ-೿]/.test(sample)) return 'kn'
  // Malayalam
  if (/[ഀ-ൿ]/.test(sample)) return 'ml'
  // Gujarati
  if (/[઀-૿]/.test(sample)) return 'gu'
  // Punjabi (Gurmukhi)
  if (/[਀-੿]/.test(sample)) return 'pa'
  // Urdu / Arabic
  if (/[؀-ۿ]/.test(sample)) return 'ar'
  // CJK — treat as ja/zh/ko, default zh
  if (/[一-鿿]/.test(sample)) return 'zh'
  // Hiragana / Katakana → Japanese
  if (/[぀-ヿ]/.test(sample)) return 'ja'
  // Hangul → Korean
  if (/[가-힯]/.test(sample)) return 'ko'
  // Cyrillic → Russian (best-effort)
  if (/[Ѐ-ӿ]/.test(sample)) return 'ru'
  // Default to English for Latin scripts — not always right (could be
  // Spanish, French, etc.) but the user can still click translate
  // manually if they want.
  return 'en'
}
