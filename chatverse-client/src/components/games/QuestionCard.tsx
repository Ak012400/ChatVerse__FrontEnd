import { useEffect, useState } from 'react'
import { Check, X, Lock } from 'lucide-react'
import type { QuizQuestionPublic, QuizAnswerReveal, GameRole } from '../../types/games'

// ============================================================
//  QuestionCard — the main quiz UI element.
//
//  Renders the active question, 4 options as big tappable cards,
//  a server-deadline-driven countdown ring, and a post-question
//  reveal overlay that highlights correct / wrong answers.
//
//  State concerns the parent (QuizRoomPage) holds:
//    - which option the viewer picked (myChoiceIndex)
//    - has the viewer already submitted (hasAnswered)
//    - the most recent reveal (lastReveal) — when present, options
//      lock in and colour by correctness
//
//  Why countdown driven from the server's deadlineUtc?
//    Client clocks drift. Reading a remote ISO timestamp and
//    subtracting Date.now() gives a wall-clock-independent timer
//    that lines up with server's actual cutoff.
// ============================================================

interface Props {
  question: QuizQuestionPublic
  /** Whether this viewer can interact (Players yes, Spectators no). */
  viewerRole: GameRole | null
  hasAnswered: boolean
  myChoiceIndex: number | null
  /** Set when the server reveals the round. Drives the colour overlay. */
  reveal: QuizAnswerReveal | null
  /** Called when the user picks an option (parent forwards to hub). */
  onAnswer: (choiceIndex: number) => void
}

export default function QuestionCard({
  question, viewerRole, hasAnswered, myChoiceIndex, reveal, onAnswer,
}: Props) {
  const isPlayer = viewerRole === 'Player'
  const isLocked = hasAnswered || !!reveal || !isPlayer

  // ─── Countdown tick ────────────────────────────────────────────
  // Refreshes every 100ms so the ring animates smoothly without
  // burning a frame loop. The 100ms cadence is well below human
  // perception of "jitter" and beats a 60fps RAF loop for a static
  // SVG that updates O(1) per tick.
  const [remainingMs, setRemainingMs] = useState(() => msUntil(question.deadlineUtc))
  useEffect(() => {
    setRemainingMs(msUntil(question.deadlineUtc))
    const id = setInterval(() => setRemainingMs(msUntil(question.deadlineUtc)), 100)
    return () => clearInterval(id)
  }, [question.deadlineUtc])

  // Approximate round duration for the ring's full circle. Falls back
  // to 15s if reveal isn't loaded yet — close to the server default.
  const totalMs = reveal?.roundDurationMs ?? 15000
  const fractionLeft = Math.max(0, Math.min(1, remainingMs / totalMs))
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))

  return (
    <div className="flex flex-col h-full">
      {/* Header row — Q#, category, deadline ring */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
            Question {question.questionNumber} / {question.totalQuestions}
          </p>
          <p className="text-xs text-[var(--color-fg-dim)] mt-0.5">
            {question.category} · <span className="capitalize">{question.difficulty}</span>
          </p>
        </div>

        <div className="relative w-12 h-12">
          <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
            <circle
              cx="18" cy="18" r="15.9155" fill="none"
              stroke="var(--color-line)" strokeWidth="2"
            />
            <circle
              cx="18" cy="18" r="15.9155" fill="none"
              stroke={seconds <= 3 ? 'var(--color-danger-fg)' : 'var(--color-accent-fg)'}
              strokeWidth="2"
              strokeDasharray={`${fractionLeft * 100} 100`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 120ms linear' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
            {seconds}
          </span>
        </div>
      </header>

      {/* Question body */}
      <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-6 mb-4">
        <p className="text-base sm:text-lg font-medium leading-snug">
          {question.question}
        </p>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
        {question.options.map((opt, idx) => {
          const tone = resolveOptionTone({
            idx, myChoiceIndex, reveal, isLocked,
          })
          return (
            <button
              key={idx}
              disabled={isLocked}
              onClick={() => !isLocked && onAnswer(idx)}
              className={[
                'relative p-4 rounded-md border text-left transition-all',
                'focus-ring',
                tone.classes,
                isLocked && !tone.highlight ? 'opacity-60 cursor-not-allowed' : '',
                !isLocked ? 'hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] active:scale-[0.99]' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] flex items-center justify-center text-xs font-semibold shrink-0">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="text-sm leading-snug pt-1">{opt}</span>
                {tone.icon && (
                  <span className="ml-auto shrink-0 pt-1">{tone.icon}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer hint for spectators / waiters */}
      {!isPlayer && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--color-fg-mute)]">
          <Lock size={11} />
          <span>You're spectating — chat to cheer them on.</span>
        </div>
      )}
      {isPlayer && hasAnswered && !reveal && (
        <div className="mt-4 text-center text-xs text-[var(--color-fg-mute)]">
          Answer locked in. Waiting for the round to end…
        </div>
      )}
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────

function msUntil(iso: string): number {
  const t = new Date(iso).getTime()
  return Math.max(0, t - Date.now())
}

interface ToneArgs {
  idx: number
  myChoiceIndex: number | null
  reveal: QuizAnswerReveal | null
  isLocked: boolean
}

interface ToneResult {
  classes: string
  icon: React.ReactNode | null
  /** True if this tile is the "winner" view and should stay opaque
   *  even though the surrounding tiles are dimmed. */
  highlight: boolean
}

function resolveOptionTone({ idx, myChoiceIndex, reveal, isLocked }: ToneArgs): ToneResult {
  // Reveal mode — colour by correctness.
  if (reveal) {
    if (idx === reveal.correctIndex) {
      return {
        classes: 'bg-[var(--color-success-soft)] border-[var(--color-success-border)] text-[var(--color-success-fg)]',
        icon: <Check size={16} className="text-[var(--color-success-fg)]" />,
        highlight: true,
      }
    }
    if (idx === myChoiceIndex) {
      return {
        classes: 'bg-[var(--color-danger-soft)] border-[var(--color-danger-border)] text-[var(--color-danger-fg)]',
        icon: <X size={16} className="text-[var(--color-danger-fg)]" />,
        highlight: true,
      }
    }
    return {
      classes: 'bg-[var(--color-surface-1)] border-[var(--color-line)]',
      icon: null,
      highlight: false,
    }
  }

  // Pre-reveal — viewer's pick highlighted in accent.
  if (idx === myChoiceIndex) {
    return {
      classes: 'bg-[var(--color-accent-soft)] border-[var(--color-accent-fg)] text-[var(--color-accent-fg)]',
      icon: <Check size={14} className="text-[var(--color-accent-fg)]" />,
      highlight: true,
    }
  }

  return {
    classes: 'bg-[var(--color-surface-1)] border-[var(--color-line)] text-[var(--color-fg)]',
    icon: null,
    highlight: !isLocked,
  }
}
