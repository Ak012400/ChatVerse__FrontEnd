import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
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
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <div
      className={`bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-lg ${padMap[padding]}
        ${hover ? 'hover:border-[var(--color-line-strong)] transition-colors duration-150' : ''}
        ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
