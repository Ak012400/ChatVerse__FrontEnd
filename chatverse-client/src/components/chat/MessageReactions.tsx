import { useAuthStore } from '../../stores/authStore'

/**
 * Render the row of reaction count chips that appears below a chat
 * bubble. Reads the authoritative `reactions` map the server pushes
 * via the ChatHub `MessageReaction` event.
 *
 * Each chip is a toggle:
 *   - clicking with no prior reaction from me → adds my user-id
 *   - clicking when I already reacted → removes it (Slack/Discord)
 *
 * Both states go through the same `ReactToMessage` hub method; the
 * server figures out whether to add or remove based on stored state.
 * That avoids the classic "I clicked twice, now there's a ghost
 * reaction in the DB" bug.
 */
export function MessageReactions({
  reactions,
  alignRight = false,
  onToggle,
}: {
  reactions: Record<string, string[]> | undefined
  alignRight?: boolean
  onToggle: (emoji: string) => void
}) {
  const myUserId = useAuthStore((s) => s.user?.userId)

  if (!reactions) return null
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0)
  if (entries.length === 0) return null

  return (
    <div
      className={[
        'flex flex-wrap gap-1 mt-0.5',
        alignRight ? 'justify-end' : 'justify-start',
      ].join(' ')}
    >
      {entries.map(([emoji, users]) => {
        const mine = !!myUserId && users.includes(myUserId)
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={[
              'flex items-center gap-1 px-1.5 py-0.5 rounded-full',
              'text-[11px] leading-none border transition-colors',
              mine
                ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)] text-[var(--color-fg)]'
                : 'bg-[var(--color-surface-2)] border-transparent text-[var(--color-fg-mute)] hover:border-[var(--color-line)]',
            ].join(' ')}
            title={mine ? 'Remove your reaction' : `React with ${emoji}`}
            aria-label={`Toggle ${emoji} reaction`}
            aria-pressed={mine}
          >
            <span aria-hidden>{emoji}</span>
            <span className="font-semibold">{users.length}</span>
          </button>
        )
      })}
    </div>
  )
}
