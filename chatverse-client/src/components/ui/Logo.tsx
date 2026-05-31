import { Link } from 'react-router-dom'

interface Props {
  to?: string
  showBeta?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export default function Logo({ to = '/', showBeta = false, size = 'md', className = '' }: Props) {
  const isSmall = size === 'sm'
  const Wrapper = to ? Link : 'div'
  const wrapperProps = to ? { to } : {}

  return (
    // @ts-expect-error – polymorphic wrapper
    <Wrapper
      {...wrapperProps}
      className={`inline-flex items-center gap-2.5 no-underline ${className}`}
    >
      <div
        className={`${isSmall ? 'w-7 h-7' : 'w-8 h-8'} rounded-md flex items-center justify-center text-white font-bold`}
        style={{
          background:
            'linear-gradient(135deg, var(--color-accent) 0%, #8b5cf6 100%)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.4) inset',
        }}
      >
        <svg
          width={isSmall ? 14 : 16}
          height={isSmall ? 14 : 16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <span className={`${isSmall ? 'text-base' : 'text-lg'} font-semibold tracking-tight text-[var(--color-fg)]`}>
        ChatVerse
      </span>
      {showBeta && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-accent-fg)] border border-[rgba(99,102,241,0.4)] rounded-full px-1.5 py-0.5 leading-none"
        >
          Beta
        </span>
      )}
    </Wrapper>
  )
}
