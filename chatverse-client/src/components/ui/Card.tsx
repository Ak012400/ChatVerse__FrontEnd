import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Adds a subtle spring-lift on hover. Use for tappable cards. */
  hover?: boolean
  /** Glassmorphism — translucent fill + backdrop blur. Use for
   *  overlay/modal cards. */
  glass?: boolean
  /** Animated aurora gradient haze behind the content. Use for
   *  hero/featured cards. */
  aurora?: boolean
  children?: ReactNode
}

const padMap = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
} as const

export default function Card({
  padding = 'md',
  hover = false,
  glass = false,
  aurora = false,
  className = '',
  children,
  ...rest
}: Props) {
  const surface = glass
    ? 'cv-glass'
    : 'bg-[var(--color-surface-1)]'

  return (
    <div
      className={`${surface} border border-[var(--color-line)] rounded-xl ${padMap[padding]}
        ${hover ? 'cv-hover-lift cursor-pointer' : ''}
        ${aurora ? 'cv-aurora' : ''}
        ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
