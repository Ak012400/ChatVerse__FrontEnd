import { useEffect, useState } from 'react'
import {
  Brain, Trophy, ChevronDown, ChevronUp, Sparkles,
  CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'

// ============================================================
//  RollingQuizPanel — the always-on quiz that lives in #general.
//
//  Three areas:
//   • Live question card + countdown ring + 4 option buttons
//   • Recent scoring notifications strip ("🥇 Alice +100")
//   • Today's leaderboard (top 10 + "you" pin if outside top-10)
//
//  Player flow:
//   1. Card appears via SignalR RollingQuizQuestion event
//   2. User taps option → optimistic lock-in
//   3. Server ack arrives → option coloured success/danger
//   4. At deadline, reveal arrives → correct option turns green
//   5. New question replaces old after ~30s intermission
//
//  Collapse state persists in localStorage like the other panels.
// ============================================================

const COLLAPSE_KEY = 'cv:rolling-quiz-panel:collapsed'

interface Props {
  /** Called when the user taps an MCQ option — parent forwards
   *  to the chat hub's SubmitRollingQuizAnswer RPC. */
  onSubmit: (questionId: string, choiceIndex: number) => void
  /** Called on mount so the panel can paint the current question
   *  + today's leaderboard without waiting 2 mins. */
  onHydrate: () => void
}

export default function RollingQuizPanel({ onSubmit, onHydrate }: Props) {
  const me = useAuthStore((s) => s.user)
  const question = useChatStore((s) => s.rollingQuizQuestion)
  const reveal   = useChatStore((s) => s.rollingQuizReveal)
  const board    = useChatStore((s) => s.rollingQuizBoard)
  const recent   = useChatStore((s) => s.rollingQuizRecent)
  const my       = useChatStore((s) => s.rollingQuizMyAnswer)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  })

  // Hydrate once on mount — pulls the live question + leaderboard.
  useEffect(() => { onHydrate() }, [onHydrate])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  const isAnsweredForCurrent = !!my && !!question && my.questionId === question.id
  const isRevealedForCurrent = !!reveal && !!question && reveal.questionId === question.id
  const isLocked = isAnsweredForCurrent || isRevealedForCurrent

  return (
    <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-[var(--color-surface-2)] transition-colors text-left"
      >
        <Brain size={14} className="text-[var(--color-accent-fg)] shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide">Daily Quiz</span>
        {!collapsed && board && (
          <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
            {board.top.length} on board
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {!collapsed && recent.length > 0 && (
            <span className="text-[10px] text-[var(--color-fg-mute)] flex items-center gap-1">
              <Sparkles size={9} className="text-[var(--color-warning-fg)]" />
              {recent.length} scored
            </span>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Question card */}
          {question ? (
            <div className="rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                  {question.category} · <span className="capitalize">{question.difficulty}</span>
                </span>
                <span className="ml-auto"><DeadlineRing deadlineUtc={question.deadlineUtc} /></span>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium leading-snug mb-3">{question.question}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {question.options.map((opt, idx) => {
                    const tone = resolveTone({
                      idx, my, reveal, isLocked,
                    })
                    return (
                      <button
                        key={idx}
                        disabled={isLocked}
                        onClick={() => !isLocked && onSubmit(question.id, idx)}
                        className={[
                          'text-left text-xs px-2.5 py-2 rounded-md border transition-all flex items-center gap-2',
                          tone.classes,
                          isLocked && !tone.icon ? 'opacity-60' : '',
                          !isLocked ? 'hover:border-[var(--color-line-strong)] active:scale-[0.99]' : '',
                        ].join(' ')}
                      >
                        <span className="text-[var(--color-fg-mute)] font-semibold w-4 shrink-0">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <span className="flex-1">{opt}</span>
                        {tone.icon}
                      </button>
                    )
                  })}
                </div>
                {/* Footer hint */}
                <p className="mt-2 text-[10px] text-[var(--color-fg-mute)]">
                  {isRevealedForCurrent
                    ? `${reveal!.correctAnswerCount}/${reveal!.totalSubmissionCount} got it · next question soon`
                    : isAnsweredForCurrent
                      ? my!.isCorrect === undefined
                        ? 'Submitting…'
                        : my!.isCorrect
                          ? 'Correct! Wait for the reveal.'
                          : 'Locked in. Wait for the reveal.'
                      : 'First correct gets 100, then 70, 50, 30. One shot only.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-line)] p-4 text-center">
              <p className="text-xs text-[var(--color-fg-mute)]">
                Next question dropping shortly… ⏳
              </p>
            </div>
          )}

          {/* Recent scoring strip */}
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r, i) => (
                <span
                  key={`${r.userId}-${i}`}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success-fg)] border border-[var(--color-success-border)]"
                >
                  {medalFor(r.rank)} <strong>{r.username}</strong> +{r.pointsAwarded}
                </span>
              ))}
            </div>
          )}

          {/* Leaderboard */}
          {board && (board.top.length > 0 || board.youRow) && (
            <div className="rounded-md bg-[var(--color-bg)] border border-[var(--color-line)] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] flex items-center gap-2">
                <Trophy size={11} className="text-[var(--color-warning-fg)]" />
                <span className="text-[10px] uppercase tracking-wide font-medium">
                  Today's leaders
                </span>
                <span className="ml-auto text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                  Session {board.sessionId}
                </span>
              </div>
              <ol>
                {board.top.map((entry, i) => {
                  const isMe = entry.userId === me?.userId
                  return (
                    <li
                      key={entry.userId}
                      className={[
                        'flex items-center gap-2 px-3 py-1.5 text-xs',
                        i !== board.top.length - 1 ? 'border-b border-[var(--color-line)]' : '',
                        isMe ? 'bg-[var(--color-accent-soft)]' : '',
                      ].join(' ')}
                    >
                      <span className="w-5 text-center shrink-0 text-[var(--color-fg-mute)] font-semibold">
                        {medalFor(i + 1) ?? `${i + 1}.`}
                      </span>
                      <span className="flex-1 truncate">
                        {entry.username}
                        {isMe && <span className="ml-1 text-[10px] text-[var(--color-fg-mute)]">(you)</span>}
                      </span>
                      <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                        {entry.correctAnswers}/{entry.totalAttempts}
                      </span>
                      <span className="font-semibold tabular-nums">{entry.score}</span>
                    </li>
                  )
                })}
                {board.youRow && !board.top.some((t) => t.userId === board.youRow!.userId) && (
                  <li className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[var(--color-accent-soft)] border-t border-dashed border-[var(--color-line)]">
                    <span className="w-5 text-center text-[var(--color-fg-mute)] font-semibold">·</span>
                    <span className="flex-1 truncate">
                      {board.youRow.username}
                      <span className="ml-1 text-[10px] text-[var(--color-fg-mute)]">(you)</span>
                    </span>
                    <span className="text-[10px] text-[var(--color-fg-mute)] tabular-nums">
                      {board.youRow.correctAnswers}/{board.youRow.totalAttempts}
                    </span>
                    <span className="font-semibold tabular-nums">{board.youRow.score}</span>
                  </li>
                )}
              </ol>
            </div>
          )}

          {!board && (
            <div className="flex justify-center text-[var(--color-fg-mute)] py-2">
              <Loader2 size={14} className="animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

function resolveTone(args: {
  idx: number
  my: ReturnType<typeof useChatStore.getState>['rollingQuizMyAnswer']
  reveal: ReturnType<typeof useChatStore.getState>['rollingQuizReveal']
  isLocked: boolean
}): { classes: string; icon: React.ReactNode | null } {
  const { idx, my, reveal } = args
  // Reveal mode: colour by correctness
  if (reveal) {
    if (idx === reveal.correctIndex) {
      return {
        classes: 'bg-[var(--color-success-soft)] border-[var(--color-success-border)] text-[var(--color-success-fg)]',
        icon: <CheckCircle2 size={12} className="text-[var(--color-success-fg)]" />,
      }
    }
    if (my && idx === my.choiceIndex && !my.isCorrect) {
      return {
        classes: 'bg-[var(--color-danger-soft)] border-[var(--color-danger-border)] text-[var(--color-danger-fg)]',
        icon: <XCircle size={12} className="text-[var(--color-danger-fg)]" />,
      }
    }
    return {
      classes: 'bg-[var(--color-surface-1)] border-[var(--color-line)]',
      icon: null,
    }
  }

  // Pre-reveal: viewer's pick highlighted
  if (my && idx === my.choiceIndex) {
    return {
      classes: 'bg-[var(--color-accent-soft)] border-[var(--color-accent-fg)] text-[var(--color-accent-fg)]',
      icon: <CheckCircle2 size={12} className="text-[var(--color-accent-fg)]" />,
    }
  }
  return {
    classes: 'bg-[var(--color-surface-1)] border-[var(--color-line)]',
    icon: null,
  }
}

// ─── Deadline ring ──────────────────────────────────────────────
function DeadlineRing({ deadlineUtc }: { deadlineUtc: string }) {
  const [remainingMs, setRemainingMs] = useState(() => msUntil(deadlineUtc))
  useEffect(() => {
    setRemainingMs(msUntil(deadlineUtc))
    const id = setInterval(() => setRemainingMs(msUntil(deadlineUtc)), 200)
    return () => clearInterval(id)
  }, [deadlineUtc])

  // Question window is 90s on the server.
  const fraction = Math.max(0, Math.min(1, remainingMs / 90_000))
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return (
    <div className="relative w-7 h-7">
      <svg viewBox="0 0 36 36" className="w-7 h-7 -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9155" fill="none"
          stroke={seconds <= 10 ? 'var(--color-danger-fg)' : 'var(--color-accent-fg)'}
          strokeWidth="3"
          strokeDasharray={`${fraction * 100} 100`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 200ms linear' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums">
        {seconds}
      </span>
    </div>
  )
}

function msUntil(iso: string): number {
  const t = new Date(iso).getTime()
  return Math.max(0, t - Date.now())
}
