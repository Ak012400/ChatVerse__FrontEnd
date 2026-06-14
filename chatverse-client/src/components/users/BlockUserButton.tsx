import { useState } from 'react'
import { Ban, Check, Loader2 } from 'lucide-react'
import { usersApi } from '../../api'
import { useToastStore } from '../../stores/toastStore'

/**
 * Block / unblock toggle for a target user.
 *
 * Two clicks pattern to avoid accidental blocks: first click arms the
 * button (background turns red, label flips to "Sure?"), second click
 * commits. Auto-disarms after 3.5s if untouched. Pattern mirrors the
 * Music Lounge "Clear" button so the muscle memory carries over.
 *
 * The parent controls whether `isBlocked` is true (probably hydrated
 * from a /users/me/blocks lookup on first render) and gets notified
 * via `onChanged` so it can refresh its own UI without a round-trip.
 */
export function BlockUserButton({
  targetUserId,
  isBlocked,
  onChanged,
  size = 'sm',
}: {
  targetUserId: string
  isBlocked: boolean
  onChanged?: (newState: boolean) => void
  size?: 'sm' | 'md'
}) {
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const { showToast } = useToastStore()

  const armOrCommit = async () => {
    if (pending) return
    if (isBlocked) {
      // Unblock is single-tap — undoing a block isn't dangerous.
      setPending(true)
      try {
        await usersApi.unblock(targetUserId)
        onChanged?.(false)
        showToast({ type: 'info', title: 'Unblocked', message: 'They can reach you again.', duration: 2500 })
      } catch {
        showToast({ type: 'error', title: 'Unblock failed', duration: 3000 })
      } finally {
        setPending(false)
      }
      return
    }

    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 3500)
      return
    }

    // Armed + clicked again → commit block.
    setPending(true)
    try {
      await usersApi.block(targetUserId)
      onChanged?.(true)
      showToast({ type: 'info', title: 'Blocked', message: 'They can\'t call or DM you anymore.', duration: 2500 })
      setArmed(false)
    } catch {
      showToast({ type: 'error', title: 'Block failed', duration: 3000 })
    } finally {
      setPending(false)
    }
  }

  const sizeClasses = size === 'md'
    ? 'h-9 px-3 text-sm'
    : 'h-7 px-2.5 text-xs'

  return (
    <button
      type="button"
      onClick={armOrCommit}
      disabled={pending}
      className={[
        sizeClasses,
        'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
        isBlocked
          ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-3)]'
          : armed
          ? 'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-soft)]',
        pending ? 'opacity-60 cursor-wait' : 'cursor-pointer',
      ].join(' ')}
      title={isBlocked ? 'Unblock this user' : armed ? 'Click again to confirm' : 'Block this user'}
      aria-pressed={isBlocked}
    >
      {pending ? (
        <Loader2 size={size === 'md' ? 14 : 12} className="animate-spin" />
      ) : isBlocked ? (
        <Check size={size === 'md' ? 14 : 12} />
      ) : (
        <Ban size={size === 'md' ? 14 : 12} />
      )}
      {isBlocked ? 'Blocked' : armed ? 'Sure?' : 'Block'}
    </button>
  )
}
