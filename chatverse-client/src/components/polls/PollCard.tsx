import { useEffect, useState } from 'react'
import { BarChart3, Lock, X, EyeOff } from 'lucide-react'
import type { PollDto } from '../../types/polls'

// ============================================================
//  PollCard — single in-room poll card.
//
//  Lives above the message stream while open; flips to a closed
//  reveal when the server says so. Per-option bars animate width
//  as the count grows.
//
//  Props:
//    poll      — full DTO
//    myUserId  — used to highlight which option(s) I picked,
//                derived solely from local optimistic state — server
//                never reveals "which-user-picked-what" for anonymous
//                polls, so we have to remember our own picks locally.
//    onVote    — invoked with option index
//    onClose   — only present when the user is the creator
// ============================================================

type Props = {
  poll: PollDto
  myUserId: string | undefined
  myPicks: Set<number>
  onVote: (optionIndex: number) => void
  onClose: (() => void) | null
}

export default function PollCard({ poll, myUserId: _myUserId, myPicks, onVote, onClose }: Props) {
  // Live countdown until ExpiresAt.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (poll.isClosed) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [poll.isClosed])

  const remainingMs = new Date(poll.expiresAt).getTime() - now
  const expired = remainingMs <= 0
  const total = poll.counts.reduce((a, b) => a + b, 0)

  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 space-y-2.5 cv-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] font-medium">
            <BarChart3 size={11} />
            Poll
            {poll.anonymous && (
              <span className="inline-flex items-center gap-0.5 text-[var(--color-fg-mute)]">
                · <EyeOff size={9} /> anonymous
              </span>
            )}
            {poll.multiSelect && <span className="text-[var(--color-fg-mute)]">· multi</span>}
          </div>
          <div className="text-sm font-medium text-[var(--color-fg)] mt-0.5 leading-snug">
            {poll.question}
          </div>
          <div className="text-[10px] text-[var(--color-fg-mute)] mt-0.5">
            by {poll.creatorUsername} · {total} {total === 1 ? 'vote' : 'votes'}
            {poll.isClosed
              ? ' · closed'
              : ` · ${formatRemaining(remainingMs)}`}
          </div>
        </div>
        {onClose && !poll.isClosed && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 text-[var(--color-fg-mute)] hover:text-[var(--color-danger)] transition-colors"
            title="Close poll early"
            aria-label="Close poll"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const cnt = poll.counts[i] ?? 0
          const pct = total === 0 ? 0 : Math.round((cnt / total) * 100)
          const mine = myPicks.has(i)
          const disabled = poll.isClosed || expired
          return (
            <button
              key={i}
              type="button"
              onClick={() => !disabled && onVote(i)}
              disabled={disabled}
              className={[
                'relative w-full text-left rounded-md border overflow-hidden transition-colors',
                mine
                  ? 'border-[var(--color-accent-fg)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-line)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]',
                disabled ? 'cursor-default opacity-95' : 'cursor-pointer',
              ].join(' ')}
            >
              {/* Vote-bar fill — sits behind the text. */}
              <div
                className={[
                  'absolute inset-y-0 left-0 transition-all',
                  mine ? 'bg-[var(--color-accent-fg)]/25' : 'bg-[var(--color-surface-3)]',
                ].join(' ')}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between px-3 py-2 text-xs">
                <span className={mine ? 'font-medium text-[var(--color-accent-fg)]' : 'text-[var(--color-fg)]'}>
                  {opt}
                </span>
                <span className="tabular-nums text-[var(--color-fg-dim)]">
                  {pct}% <span className="text-[var(--color-fg-mute)]">· {cnt}</span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {poll.isClosed && (
        <div className="text-[10px] text-[var(--color-fg-mute)] inline-flex items-center gap-1">
          <Lock size={10} /> Final results
        </div>
      )}
    </div>
  )
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'ending…'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s left`
  const min = Math.floor(sec / 60)
  const r = sec % 60
  return `${min}m ${r.toString().padStart(2, '0')}s left`
}
