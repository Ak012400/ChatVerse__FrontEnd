import { useState } from 'react'
import { X, Plus, Trash2, BarChart3, Loader2 } from 'lucide-react'
import {
  POLL_DURATIONS, POLL_MIN_OPTIONS, POLL_MAX_OPTIONS,
  POLL_MAX_OPTION_CHARS, POLL_MAX_QUESTION_CHARS,
} from '../../types/polls'

// ============================================================
//  PollComposerSheet — bottom-sheet composer for a new in-room poll.
//
//  Caller passes onCreate({ question, options, durationSeconds,
//  multiSelect, anonymous }) and awaits the hub round-trip. On
//  success the parent closes the sheet.
//
//  UX:
//    • Question textarea (200 chars, live counter)
//    • 2-6 options with add / remove
//    • Duration pills (30s / 1m / 5m)
//    • Multi-select toggle (off by default)
//    • Anonymous toggle (ON by default — matches Confession / Ghost
//      Date privacy DNA)
//    • Sticky submit footer
// ============================================================

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (payload: {
    question: string
    options: string[]
    durationSeconds: number
    multiSelect: boolean
    anonymous: boolean
  }) => Promise<void>
}

export default function PollComposerSheet({ open, onClose, onCreate }: Props) {
  const [question, setQuestion] = useState('')
  const [options, setOptions]   = useState<string[]>(['', ''])
  const [duration, setDuration] = useState(60)
  const [multiSelect, setMulti] = useState(false)
  const [anonymous, setAnon]    = useState(true)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const cleanOptions = options.map((o) => o.trim()).filter((o) => o.length > 0)
  const canSubmit = !submitting
    && question.trim().length > 0
    && question.length <= POLL_MAX_QUESTION_CHARS
    && cleanOptions.length >= POLL_MIN_OPTIONS

  const addOption = () => {
    if (options.length >= POLL_MAX_OPTIONS) return
    setOptions([...options, ''])
  }
  const removeOption = (i: number) => {
    if (options.length <= POLL_MIN_OPTIONS) return
    setOptions(options.filter((_, idx) => idx !== i))
  }
  const updateOption = (i: number, v: string) =>
    setOptions(options.map((o, idx) => (idx === i ? v : o)))

  const reset = () => {
    setQuestion('')
    setOptions(['', ''])
    setDuration(60)
    setMulti(false)
    setAnon(true)
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onCreate({
        question:        question.trim(),
        options:         cleanOptions,
        durationSeconds: duration,
        multiSelect,
        anonymous,
      })
      reset()
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="cv-sheet-up w-full sm:max-w-md sm:rounded-xl rounded-t-2xl bg-[var(--color-surface-1)] border border-[var(--color-line)] shadow-2xl max-h-[88vh] overflow-y-auto">
        <header className="flex items-center justify-between p-4 border-b border-[var(--color-line)] sticky top-0 bg-[var(--color-surface-1)]">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
            <BarChart3 size={16} className="text-[var(--color-accent-fg)]" />
            New poll
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
            aria-label="Close composer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1">
              Question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, POLL_MAX_QUESTION_CHARS))}
              rows={2}
              placeholder="Pineapple on pizza?"
              className="w-full px-3 py-2 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm resize-none"
            />
            <div className="text-[10px] text-[var(--color-fg-mute)] mt-0.5 text-right">
              {question.length}/{POLL_MAX_QUESTION_CHARS}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1.5">
              Options ({cleanOptions.length}/{POLL_MAX_OPTIONS})
            </label>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value.slice(0, POLL_MAX_OPTION_CHARS))}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] focus:border-[var(--color-accent-fg)] outline-none text-sm"
                  />
                  {options.length > POLL_MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="p-1.5 text-[var(--color-fg-mute)] hover:text-[var(--color-danger)] transition-colors"
                      aria-label="Remove option"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < POLL_MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-accent-fg)] hover:underline"
              >
                <Plus size={12} /> Add option
              </button>
            )}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-[var(--color-fg-faint)] mb-1.5">
              Duration
            </label>
            <div className="flex items-center gap-1.5">
              {POLL_DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setDuration(d.seconds)}
                  className={[
                    'flex-1 h-8 rounded-md text-xs font-medium border transition-colors',
                    duration === d.seconds
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border-[var(--color-accent-fg)]'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
                  ].join(' ')}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 py-1">
            <div>
              <div className="text-xs font-medium text-[var(--color-fg)]">Multi-select</div>
              <div className="text-[10px] text-[var(--color-fg-mute)]">Voters can pick more than one option.</div>
            </div>
            <ToggleSwitch on={multiSelect} onClick={() => setMulti(!multiSelect)} />
          </div>

          <div className="flex items-center justify-between gap-2 py-1">
            <div>
              <div className="text-xs font-medium text-[var(--color-fg)]">Anonymous</div>
              <div className="text-[10px] text-[var(--color-fg-mute)]">Hide voter identities (default).</div>
            </div>
            <ToggleSwitch on={anonymous} onClick={() => setAnon(!anonymous)} />
          </div>
        </div>

        <footer className="p-4 border-t border-[var(--color-line)] sticky bottom-0 bg-[var(--color-surface-1)]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              'w-full h-10 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5 transition-all',
              canSubmit
                ? 'bg-[var(--color-accent-fg)] text-white hover:opacity-95 cv-press'
                : 'bg-[var(--color-surface-3)] text-[var(--color-fg-mute)] cursor-not-allowed',
            ].join(' ')}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            Launch poll
          </button>
        </footer>
      </div>
    </div>
  )
}

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative w-9 h-5 rounded-full transition-colors',
        on ? 'bg-[var(--color-accent-fg)]' : 'bg-[var(--color-surface-3)]',
      ].join(' ')}
      aria-pressed={on}
    >
      <span
        className={[
          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}
