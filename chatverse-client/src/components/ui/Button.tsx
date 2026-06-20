import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

// `cv-press` adds the spring-scale on :active so every button feels
// responsive — single source of truth, applied via the base class.
const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors duration-150 cv-press ' +
  'select-none focus-ring disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'

const variants: Record<Variant, string> = {
  // Primary now ships a soft accent → violet gradient + tiny shadow
  // so the most important CTA on any page reads as "alive".
  primary:
    'text-white border border-[var(--color-accent)] shadow-[0_4px_14px_rgba(99,102,241,0.28)] ' +
    'bg-gradient-to-br from-[var(--color-accent)] to-[#8b5cf6] ' +
    'hover:from-[var(--color-accent-hover)] hover:to-[#a78bfa]',
  secondary:
    'bg-[var(--color-surface-2)] text-[var(--color-fg)] hover:bg-[var(--color-surface-3)] ' +
    'border border-[var(--color-line)]',
  subtle:
    'bg-transparent text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] ' +
    'border border-[var(--color-line)]',
  ghost:
    'bg-transparent text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] ' +
    'border border-transparent',
  danger:
    'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)] border border-[var(--color-danger)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className = '',
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block w-3.5 h-3.5 rounded-full border-[1.5px] border-current border-t-transparent"
          style={{ animation: 'spin 0.7s linear infinite' }}
        />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export default Button
