interface Props {
  name?: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  ring?: boolean
  className?: string
}

const sizeMap = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
} as const

/**
 * Deterministic per-name accent so each user has a stable color
 * without random gradients screaming for attention.
 */
function colorFor(name: string): string {
  const palette = [
    '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
    '#06b6d4', '#a855f7', '#10b981', '#f97316',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export default function Avatar({ name = '?', src, size = 'md', ring = false, className = '' }: Props) {
  const initial = (name[0] ?? '?').toUpperCase()
  const bg = colorFor(name)

  return (
    <div
      className={`${sizeMap[size]} rounded-full flex items-center justify-center font-semibold text-white shrink-0
        ${ring ? 'ring-2 ring-[var(--color-bg)]' : ''}
        ${className}`}
      style={src ? undefined : { background: `linear-gradient(135deg, ${bg}, ${bg}cc)` }}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
