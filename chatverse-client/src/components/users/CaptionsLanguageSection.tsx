import { Captions, Languages } from 'lucide-react'
import { useCaptionsStore } from '../../stores/captionsStore'
import type { SpeechLang } from '../../hooks/useSpeechRecognition'

/**
 * Profile settings widget for the live-captions feature.
 *
 *   • Spoken language — what the local mic will be transcribing.
 *     Defaults to en-IN; users picking a regional language get much
 *     higher accuracy than leaving it on a global English bucket.
 *
 *   • Preferred reading language — what incoming captions get
 *     translated INTO before they're shown on the overlay. Independent
 *     of the UI's i18n language because some users prefer captions in
 *     their native script even if they navigate the app in English.
 *
 * Both settings persist to localStorage via the zustand store; no
 * backend round-trip needed.
 */

const SPOKEN_OPTIONS: { code: SpeechLang; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'pa-IN', label: 'Punjabi' },
  { code: 'ur-PK', label: 'Urdu' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'zh-CN', label: 'Mandarin' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'pt-BR', label: 'Portuguese' },
  { code: 'it-IT', label: 'Italian' },
]

const READ_OPTIONS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Mandarin' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
]

export function CaptionsLanguageSection() {
  const spokenLang = useCaptionsStore((s) => s.spokenLang)
  const preferredLang = useCaptionsStore((s) => s.preferredLang)
  const setSpokenLang = useCaptionsStore((s) => s.setSpokenLang)
  const setPreferredLang = useCaptionsStore((s) => s.setPreferredLang)

  return (
    <section className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-4 sm:p-5">
      <header className="flex items-center gap-2 mb-3">
        <Captions size={14} className="text-[var(--color-accent-fg)]" />
        <h3 className="text-sm font-semibold">Live captions</h3>
      </header>
      <p className="text-[11px] text-[var(--color-fg-mute)] mb-4 leading-snug">
        Speech recognition runs entirely on your device. Translation is sent to a
        privacy-respecting AI provider (cached so the same phrase only goes once).
        Toggle captions inside any video call.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LangField
          label="I speak"
          icon={<Captions size={11} />}
          value={spokenLang}
          onChange={(v) => setSpokenLang(v as SpeechLang)}
          options={SPOKEN_OPTIONS}
        />
        <LangField
          label="Show captions in"
          icon={<Languages size={11} />}
          value={preferredLang}
          onChange={setPreferredLang}
          options={READ_OPTIONS}
        />
      </div>
    </section>
  )
}

function LangField({
  label, icon, value, onChange, options,
}: {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  options: { code: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)] font-semibold inline-flex items-center gap-1 mb-1">
        {icon} {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)]
                   text-sm text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-line-strong)]"
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
