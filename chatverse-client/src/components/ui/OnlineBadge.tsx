import { usePresence } from '../../hooks/usePresence'

/**
 * Floating "X online now" pill that lives in the top-right of the app
 * shell. Reads from /api/presence/stats every 30s. Hidden until first
 * fetch resolves so we don't flash a zero. Positioned by the parent so
 * it works inside AppLayout (registered) AND on LandingPage (public).
 */
export default function OnlineBadge({
  className = '',
}: {
  className?: string
}) {
  const stats = usePresence()

  if (!stats) return null

  // Round to friendly numbers for big counts so "12,358" doesn't visually
  // wobble the badge each tick.
  const display = stats.globalOnline >= 1000
    ? `${(stats.globalOnline / 1000).toFixed(1)}k`
    : stats.globalOnline.toString()

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[11px] font-medium text-[var(--color-fg-dim)] ${className}`}
      title={`${stats.globalOnline.toLocaleString()} users online right now`}
    >
      <span className="dot-live" aria-hidden="true" />
      <span>{display} online</span>
    </div>
  )
}
