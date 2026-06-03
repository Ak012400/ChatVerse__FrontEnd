import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

interface Props {
  tone?: Tone
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
  dot?: boolean
}

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] border-[var(--color-line)]',
  accent:  'bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border-[rgba(99,102,241,0.3)]',
  success: 'bg-[var(--color-success-soft)] text-[#86efac] border-[rgba(34,197,94,0.3)]',
  warning: 'bg-[var(--color-warning-soft)] text-[#fcd34d] border-[rgba(245,158,11,0.3)]',
  danger:  'bg-[var(--color-danger-soft)] text-[#fca5a5] border-[rgba(239,68,68,0.3)]',
}

const dotColor: Record<Tone, string> = {
  neutral: 'bg-[var(--color-fg-faint)]',
  accent:  'bg-[var(--color-accent)]',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  danger:  'bg-[var(--color-danger)]',
}

const sizes = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
}

export default function Badge({ tone = 'neutral', size = 'md', dot = false, className = '', children }: Props) {
  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full whitespace-nowrap
        ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor[tone]}`} />}
      {children}
    </span>
  )
}
