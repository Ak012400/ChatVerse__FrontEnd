import { useEffect, useState } from 'react'
import { Ban, Loader2, ShieldOff } from 'lucide-react'
import { usersApi } from '../../api'
import Avatar from '../ui/Avatar'
import { BlockUserButton } from './BlockUserButton'

interface BlockedRow {
  userId: string
  username: string
  avatarUrl: string | null
  reason: string | null
  blockedAt: string
}

/**
 * Settings widget for managing your block list.
 *
 * Two reads on mount:
 *   1. /users/me/blocks       → your outgoing list (full rows)
 *   2. /users/me/blocked-by-count → aggregate inbound count (no names,
 *      mirroring Instagram-style privacy — you only learn HOW MANY
 *      people blocked you, never WHO)
 *
 * The unblock button is a single tap (no confirm pattern) because
 * undoing a block isn't dangerous. After unblock the row fades out
 * locally without a round-trip — the hook already invalidates
 * server state.
 */
export function BlockedUsersSection() {
  const [blocks, setBlocks] = useState<BlockedRow[] | null>(null)
  const [blockedByCount, setBlockedByCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        usersApi.myBlocks(),
        usersApi.blockedByCount(),
      ])
      setBlocks(listRes.data?.data ?? [])
      setBlockedByCount(countRes.data?.data?.count ?? 0)
      setError(null)
    } catch {
      setError('Could not load block list')
    }
  }

  useEffect(() => { void reload() }, [])

  const onUnblockChanged = (userId: string, isNowBlocked: boolean) => {
    if (!isNowBlocked) {
      setBlocks((prev) => prev?.filter((b) => b.userId !== userId) ?? [])
    }
  }

  return (
    <section className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-4 sm:p-5">
      <header className="flex items-center gap-2 mb-3">
        <Ban size={14} className="text-[var(--color-danger-fg)]" />
        <h3 className="text-sm font-semibold">Blocked users</h3>
        {blocks && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)]">
            · {blocks.length}
          </span>
        )}
      </header>

      {/* Inbound count — count only, never names. Privacy-preserving. */}
      {blockedByCount !== null && blockedByCount > 0 && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-md
                        bg-[var(--color-warning-soft)] border border-[var(--color-warning-border)]
                        text-[11px] text-[var(--color-warning-fg)]">
          <ShieldOff size={12} className="shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            You appear in <strong>{blockedByCount}</strong> blocklist{blockedByCount === 1 ? '' : 's'}.
            We never share who blocked you.
          </span>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--color-danger-fg)] py-2">{error}</p>
      )}

      {blocks === null && !error && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin text-[var(--color-fg-mute)]" />
        </div>
      )}

      {blocks && blocks.length === 0 && (
        <p className="text-xs text-[var(--color-fg-mute)] py-3">
          You haven't blocked anyone. Use the Block button on a profile or DM to add someone here.
        </p>
      )}

      {blocks && blocks.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {blocks.map((b) => (
            <li
              key={b.userId}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-[var(--color-surface-2)]"
            >
              <Avatar name={b.username} size="xs" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-fg)] truncate">
                  {b.username}
                </p>
                <p className="text-[10px] text-[var(--color-fg-mute)]">
                  Blocked {new Date(b.blockedAt).toLocaleDateString()}
                  {b.reason ? ` · ${b.reason}` : ''}
                </p>
              </div>
              <BlockUserButton
                targetUserId={b.userId}
                isBlocked={true}
                onChanged={(now) => onUnblockChanged(b.userId, now)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
