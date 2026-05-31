import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'ghost' | 'subtle' | 'solid'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  active?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  ghost: 'bg-transparent text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
  subtle: 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)] border border-[var(--color-line)]',
  solid: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
}

const sizes: Record<Size, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
}

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { variant = 'ghost', size = 'md', active = false, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md transition-colors duration-150 focus-ring
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${active ? 'bg-[var(--color-surface-2)] text-[var(--color-fg)]' : ''}
        ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})

export default IconButton
