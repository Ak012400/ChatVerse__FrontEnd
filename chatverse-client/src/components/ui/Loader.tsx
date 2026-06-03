interface LoaderProps {
  variant?: 'spinner' | 'typing' | 'chat-skeleton' | 'page-skeleton'
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function Loader({ variant = 'spinner', text, size = 'md' }: LoaderProps) {
  /* 1. Typing indicator */
  if (variant === 'typing') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-2)]">
        <span
          className="w-1 h-1 rounded-full bg-[var(--color-fg-faint)]"
          style={{ animation: 'pulse-ring 1.2s ease-in-out infinite', animationDelay: '0ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-[var(--color-fg-faint)]"
          style={{ animation: 'pulse-ring 1.2s ease-in-out infinite', animationDelay: '150ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-[var(--color-fg-faint)]"
          style={{ animation: 'pulse-ring 1.2s ease-in-out infinite', animationDelay: '300ms' }}
        />
        {text && (
          <span className="ml-1 text-[10px] text-[var(--color-fg-faint)] tracking-tight">
            {text}
          </span>
        )}
      </div>
    )
  }

  /* 2. Chat skeleton */
  if (variant === 'chat-skeleton') {
    return (
      <div className="flex-1 px-5 py-4 space-y-4">
        {[1, 2, 3, 4].map((i) => {
          const mine = i % 2 === 0
          return (
            <div
              key={i}
              className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} animate-pulse`}
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] shrink-0" />
              <div
                className={`h-9 rounded-2xl bg-[var(--color-surface-2)] ${
                  mine ? 'rounded-tr-md w-1/4' : 'rounded-tl-md w-1/3'
                }`}
              />
            </div>
          )
        })}
      </div>
    )
  }

  /* 3. Full page skeleton (used during initial mount). Renders just the chat canvas. */
  if (variant === 'page-skeleton') {
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg)]">
        <div className="h-14 border-b border-[var(--color-line)] flex items-center px-5">
          <div className="h-3 w-32 rounded bg-[var(--color-surface-2)] animate-pulse" />
        </div>
        <Loader variant="chat-skeleton" />
        <div className="h-16 border-t border-[var(--color-line)] flex items-center px-5">
          <div className="h-9 w-full rounded-md bg-[var(--color-surface-2)] animate-pulse" />
        </div>
      </div>
    )
  }

  /* 4. Default spinner */
  const spinnerSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="inline-block rounded-full border-[1.5px] border-[var(--color-fg-faint)] border-t-transparent"
        style={{
          width: spinnerSize,
          height: spinnerSize,
          animation: 'spin 0.7s linear infinite',
        }}
      />
      {text && <span className="text-xs text-[var(--color-fg-faint)]">{text}</span>}
    </div>
  )
}
