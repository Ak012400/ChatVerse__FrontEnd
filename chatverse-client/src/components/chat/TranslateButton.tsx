import { Languages, Loader2, X } from 'lucide-react'

/**
 * Compact translate trigger that appears under chat bubbles whose
 * detected language differs from the reader's preferred language.
 *
 * Three visual states:
 *   • idle      — small Languages icon + label "Translate"
 *   • loading   — spinner + "Translating…"
 *   • translated — translation text rendered separately by the parent;
 *                  the button becomes a "Hide translation" toggle
 *
 * The parent owns the translation state (via useTranslation hook) and
 * decides which props to pass. Kept presentation-only to make styling
 * tweaks one-line jobs.
 */
export default function TranslateButton({
  state,
  onTranslate,
  onHide,
}: {
  state: 'idle' | 'loading' | 'shown' | 'error'
  onTranslate: () => void
  onHide: () => void
}) {
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)]">
        <Loader2 size={10} className="animate-spin" />
        Translating…
      </span>
    )
  }

  if (state === 'shown') {
    return (
      <button
        type="button"
        onClick={onHide}
        className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)] transition-colors"
        aria-label="Hide translation"
      >
        <X size={10} />
        Hide translation
      </button>
    )
  }

  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onTranslate}
        className="inline-flex items-center gap-1 text-[10px] text-[var(--color-danger-fg)] hover:opacity-80 transition-opacity"
        aria-label="Retry translation"
      >
        <Languages size={10} />
        Retry translate
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onTranslate}
      className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-accent-fg)] transition-colors opacity-70 hover:opacity-100"
      aria-label="Translate this message"
    >
      <Languages size={10} />
      Translate
    </button>
  )
}
