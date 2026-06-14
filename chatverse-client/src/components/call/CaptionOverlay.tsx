import { Captions, Languages } from 'lucide-react'
import type { CaptionLine } from '../../hooks/useCaptions'

/**
 * Bottom-aligned subtitle overlay that floats over a video tile.
 *
 * Renders up to ~3 most-recent lines (the latest is the brightest /
 * largest; older lines fade). Per line we show:
 *   • Speaker name in a small chip
 *   • The visible text (translation when source ≠ target, else source)
 *   • A tiny language chip when the user is reading a translation —
 *     long-press / hover the chip to peek at the source phrase
 *
 * Why translucent black gradient: ensures legibility against any
 * background — light skin, dark scene, bright laptop. Same approach
 * Netflix / YouTube use.
 */
export function CaptionOverlay({
  lines,
  preferredLang,
  className,
}: {
  lines: CaptionLine[]
  preferredLang: string
  className?: string
}) {
  if (lines.length === 0) return null

  // Show only the 3 newest, oldest first so they read top-to-bottom.
  const recent = lines.slice(-3)

  return (
    <div
      className={[
        'pointer-events-none absolute inset-x-0 bottom-0 px-2 sm:px-4 pb-3 sm:pb-5',
        'flex flex-col gap-1.5',
        'bg-gradient-to-t from-black/70 via-black/35 to-transparent',
        className ?? '',
      ].join(' ')}
      aria-live="polite"
      aria-atomic="false"
    >
      {recent.map((line, i) => {
        const isLatest = i === recent.length - 1
        const isTranslation = !line.sourceLang.toLowerCase().startsWith(preferredLang.toLowerCase())
          && !preferredLang.toLowerCase().startsWith(line.sourceLang.toLowerCase())
        return (
          <div
            key={line.speakerId + '-' + line.at}
            className={[
              'flex items-end gap-2 max-w-3xl mx-auto w-full pointer-events-auto',
              isLatest ? 'opacity-100' : 'opacity-65',
              line.pendingTranslation ? 'animate-pulse' : '',
            ].join(' ')}
          >
            {/* Speaker chip */}
            <span className="shrink-0 h-5 px-2 rounded-full bg-black/70 text-white text-[10px] font-semibold inline-flex items-center">
              {line.speakerName}
            </span>

            {/* Caption text */}
            <span
              className={[
                'flex-1 px-2.5 py-1.5 rounded-md text-white',
                isLatest ? 'text-[14px] sm:text-[15px]' : 'text-[12px]',
                'leading-snug bg-black/55 backdrop-blur-sm',
                line.isFinal ? '' : 'italic text-white/85',
              ].join(' ')}
              // Long-press / hover reveals the original — invaluable
              // when a translation looks suspicious mid-conversation.
              title={isTranslation ? `Original (${line.sourceLang}): ${line.originalText}` : undefined}
            >
              {line.text}
              {!line.isFinal && <span className="ml-1 opacity-60">…</span>}
            </span>

            {/* Source language chip when reading a translation */}
            {isTranslation && (
              <span
                className="shrink-0 h-5 px-1.5 rounded-full bg-[#1DB954]/85 text-white text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-1"
                title={`Translated from ${line.sourceLang.toUpperCase()}`}
              >
                <Languages size={9} /> {line.sourceLang.toUpperCase()}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Compact toggle pill — typically pinned in the room's control bar.
 * Surfaces whether captions are currently broadcasting the speaker's
 * voice and lets the user flip it on/off. Hidden in the parent when
 * the browser doesn't support Web Speech (no point teasing).
 */
export function CaptionsToggle({
  enabled,
  onToggle,
  listening,
  spokenLang,
}: {
  enabled: boolean
  onToggle: () => void
  listening?: boolean
  spokenLang?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-semibold transition-colors',
        enabled
          ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)]',
      ].join(' ')}
      title={enabled ? 'Captions on — translates for the other side' : 'Turn on live captions'}
      aria-pressed={enabled}
    >
      <Captions size={14} />
      <span>{enabled ? 'Captions on' : 'Captions'}</span>
      {enabled && listening && (
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      )}
      {enabled && spokenLang && (
        <span className="ml-0.5 text-[9px] uppercase opacity-80">{spokenLang}</span>
      )}
    </button>
  )
}
