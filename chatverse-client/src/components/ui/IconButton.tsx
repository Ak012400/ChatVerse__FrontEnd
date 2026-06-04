import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'ghost' | 'subtle' | 'solid'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** When true, the icon sticks to its accent appearance even after click —
   *  used by the navigation rail to show the currently-active route. */
  active?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  ghost:
    'bg-transparent text-[var(--color-fg-dim)] ' +
    'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
  subtle:
    'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] ' +
    'hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)] ' +
    'border border-[var(--color-line)]',
  solid:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
}

const sizes: Record<Size, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
}

/**
 * Icon button — the workhorse for sidebar nav, toolbars, and inline
 * actions. Three interactions baked in:
 *   • Hover  → bg tints in, text brightens (color transition)
 *   • Active press → quick scale-down for tactile feedback
 *   • Selected (route-active) → accent-tinted background + glow + a small
 *     left bar on `ghost` so the user always sees where they are
 *
 * Designed to be visible from across the room — the previous version was
 * too subtle and users were clicking the same icon twice thinking it
 * hadn't responded.
 */
const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { variant = 'ghost', size = 'md', active = false, className = '', children, ...rest },
  ref,
) {
  // The selected state is more prominent for `ghost` (nav rail) since
  // those buttons LIVE in a row of identical-looking siblings — without
  // a clear cue the active item disappears.
  const activeStyles =
    active && variant === 'ghost'
      ? 'relative bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] ' +
        'shadow-[inset_2px_0_0_0_var(--color-accent)] ring-1 ring-[var(--color-accent)]/30'
      : active
      ? 'bg-[var(--color-surface-3)] text-[var(--color-fg)]'
      : ''

  return (
    <button
      ref={ref}
      className={`group inline-flex items-center justify-center rounded-md
        transition-[background-color,color,transform,box-shadow] duration-150 ease-out
        active:scale-[0.92]
        focus-ring
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${activeStyles}
        ${className}`}
      {...rest}
    >
      {/* Inner span carries a subtle icon scale on hover/active so the
          icon itself reacts, not just the chip behind it. */}
      <span
        className={`inline-flex items-center justify-center
          transition-transform duration-150 ease-out
          group-hover:scale-110
          ${active ? 'scale-110' : ''}`}
      >
        {children}
      </span>
    </button>
  )
})

export default IconButton
