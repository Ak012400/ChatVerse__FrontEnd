import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Check, Crown } from 'lucide-react'
import { useGameHub } from '../../hooks/useGameHub'
import type { GameRoomInviteDto } from '../../types/games'

// ============================================================
//  GameInviteListener — global mount inside AppLayout.
//
//  Listens for window-level "chatverse:game-invite" events that
//  useGameHub dispatches when the server pushes a GameRoomInvite
//  to this user. Renders a non-blocking toast-style banner at
//  the top-right with Accept/Decline buttons.
//
//  Accept → calls hub.acceptInvite(inviteId) → on InviteAck with
//           a slug, navigates to /play/{slug} (which runs the
//           normal join flow).
//  Decline → silently dismisses (server doesn't need to know;
//           the invite token will expire on its own TTL).
// ============================================================

export default function GameInviteListener() {
  const navigate = useNavigate()
  const { acceptInvite } = useGameHub()
  const [invite, setInvite] = useState<GameRoomInviteDto | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GameRoomInviteDto>).detail
      if (detail?.inviteId) setInvite(detail)
    }
    window.addEventListener('chatverse:game-invite', handler as EventListener)
    return () => window.removeEventListener('chatverse:game-invite', handler as EventListener)
  }, [])

  // Also listen for the InviteAck event indirectly — when accepted,
  // navigate. We do this by polling the local invite state + relying
  // on the hub's InviteAck toast to confirm. (Future v2: route the
  // ack through a callback instead of via toast.)

  if (!invite) return null

  const handleAccept = async () => {
    try {
      await acceptInvite(invite.inviteId)
      // Navigate now — the server-side AcceptInvite will mark us as
      // approved, so the join flow on PlayRoomPage will succeed.
      navigate(`/play/${invite.slug}`)
    } finally {
      setInvite(null)
    }
  }
  const handleDecline = () => {
    setInvite(null)
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-[var(--color-surface-1)] border border-[var(--color-accent-fg)] rounded-md shadow-xl overflow-hidden animate-in slide-in-from-right">
      <div className="px-4 py-2 bg-[var(--color-accent-soft)] flex items-center gap-2">
        <Crown size={12} className="text-[var(--color-accent-fg)]" />
        <span className="text-[10px] uppercase tracking-wide font-medium">
          Game invite
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm">
          <strong>{invite.fromUsername}</strong> invited you to play
          {' '}<span className="font-medium">{invite.type}</span> in{' '}
          <span className="text-[var(--color-accent-fg)]">{invite.roomName}</span>.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleAccept}
            className="flex-1 h-9 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check size={13} /> Join now
          </button>
          <button
            onClick={handleDecline}
            className="h-9 px-3 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-fg)] text-[var(--color-fg-dim)] text-xs inline-flex items-center gap-1 transition-colors"
          >
            <X size={12} /> Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
