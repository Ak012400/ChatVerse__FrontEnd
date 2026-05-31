import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightAdornment?: ReactNode
}

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, leftIcon, rightAdornment, className = '', id, ...rest },
  ref,
) {
  const inputId = id || `in-${rest.name ?? Math.random().toString(36).slice(2, 8)}`

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-faint)] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)] pointer-events-none flex items-center">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full h-10 rounded-md bg-[var(--color-surface-1)] text-[var(--color-fg)] text-sm
            border ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-line)]'}
            ${leftIcon ? 'pl-10' : 'pl-3.5'} ${rightAdornment ? 'pr-10' : 'pr-3.5'}
            focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
            transition-colors duration-150
            ${className}`}
          {...rest}
        />
        {rightAdornment && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {rightAdornment}
          </span>
        )}
      </div>
      {(hint || error) && (
        <p
          className={`mt-1.5 text-xs ${
            error ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-faint)]'
          }`}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
})

export default Input
