import { Trophy, Eye } from 'lucide-react'
import type { ScoreEntry } from '../../types/games'
import { useAuthStore } from '../../stores/authStore'

// ============================================================
//  Scoreboard — live ranking panel.
//
//  Re-orders ScoreEntries by score, highlights "you", and renders
//  a top-3 podium row above the rest. Used in QuizRoomPage on the
//  right rail.
// ============================================================

interface Props {
  entries: ScoreEntry[]
  /** Total scorecard slots (players cap). Empty slots render as
   *  "waiting" placeholders so the panel doesn't shrink mid-round. */
  totalSlots?: number
  /** Compact mode for mobile / spectator side panels. */
  compact?: boolean
}

export default function Scoreboard({ entries, totalSlots, compact }: Props) {
  const myUserId = useAuthStore((s) => s.user?.userId)

  // Entries arrive already sorted from the server but defend against
  // mid-flight ScoreUpdated payloads that might not be.
  const sorted = [...entries].sort((a, b) => b.score - a.score)
  const placeholderCount = Math.max(0, (totalSlots ?? sorted.length) - sorted.length)

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--color-line)] flex items-center gap-2">
        <Trophy size={14} className="text-[var(--color-warning-fg)]" />
        <h3 className="text-sm font-medium">Scoreboard</h3>
      </header>

      <ol className="flex-1 overflow-y-auto py-1">
        {sorted.map((e, idx) => {
          const isMe = e.userId === myUserId
          const rank = idx + 1
          return (
            <li
              key={e.userId}
              className={[
                'flex items-center gap-3 px-4',
                compact ? 'py-1.5' : 'py-2',
                isMe ? 'bg-[var(--color-accent-soft)]' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                  rank === 1 ? 'bg-yellow-500/20 text-[var(--color-warning-fg)]' :
                  rank === 2 ? 'bg-gray-500/20 text-[var(--color-fg-dim)]' :
                  rank === 3 ? 'bg-orange-500/20 text-[var(--color-warning-fg)]' :
                  'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)]',
                ].join(' ')}
              >
                {rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {e.username}
                  {isMe && <span className="ml-1 text-[10px] text-[var(--color-fg-mute)]">(you)</span>}
                </p>
                {!compact && (
                  <p className="text-[10px] text-[var(--color-fg-faint)]">
                    {e.correctAnswers}/{e.answeredCount} correct
                    {e.answeredCount > 0 && (
                      <> · {(e.averageResponseMs / 1000).toFixed(1)}s avg</>
                    )}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">{e.score}</span>
            </li>
          )
        })}

        {placeholderCount > 0 && Array.from({ length: placeholderCount }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="flex items-center gap-3 px-4 py-2 opacity-40"
          >
            <span className="w-6 h-6 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[10px] text-[var(--color-fg-mute)] shrink-0">
              {sorted.length + i + 1}
            </span>
            <div className="flex-1">
              <p className="text-sm text-[var(--color-fg-mute)] italic">Waiting for player…</p>
            </div>
          </li>
        ))}

        {sorted.length === 0 && placeholderCount === 0 && (
          <li className="px-4 py-10 text-center">
            <Eye size={20} className="mx-auto text-[var(--color-fg-mute)] mb-2" />
            <p className="text-xs text-[var(--color-fg-faint)]">No players yet.</p>
          </li>
        )}
      </ol>
    </div>
  )
}
