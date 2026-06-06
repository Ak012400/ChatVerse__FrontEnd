import { CheckCircle2, AlertTriangle, AlertOctagon, Info, ShieldAlert, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import type { Toast } from '../../stores/toastStore'

// All colors resolved via CSS variables so toasts retheme automatically
// when the user toggles between light and dark. Hardcoded hex / rgba was
// fine on the original dark theme but disappeared into the light theme
// background (pale yellow-on-cream, pale red-on-white were unreadable).
const META: Record<
  Toast['type'],
  { Icon: typeof Info; bg: string; border: string; text: string; bar: string }
> = {
  success: {
    Icon: CheckCircle2,
    bg: 'var(--color-success-soft)',
    border: 'var(--color-success-border)',
    text: 'var(--color-success-fg)',
    bar: 'var(--color-success)',
  },
  info: {
    Icon: Info,
    bg: 'var(--color-accent-soft)',
    border: 'rgba(99,102,241,0.3)',
    text: 'var(--color-accent-fg)',
    bar: 'var(--color-accent)',
  },
  warning: {
    Icon: AlertTriangle,
    bg: 'var(--color-warning-soft)',
    border: 'var(--color-warning-border)',
    text: 'var(--color-warning-fg)',
    bar: 'var(--color-warning)',
  },
  error: {
    Icon: AlertOctagon,
    bg: 'var(--color-danger-soft)',
    border: 'var(--color-danger-border)',
    text: 'var(--color-danger-fg)',
    bar: 'var(--color-danger)',
  },
  danger: {
    Icon: ShieldAlert,
    bg: 'var(--color-danger-soft)',
    border: 'var(--color-danger-border)',
    text: 'var(--color-danger-fg)',
    bar: 'var(--color-danger)',
  },
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const m = META[toast.type]
        const Icon = m.Icon

        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className="pointer-events-auto relative rounded-md border overflow-hidden cursor-pointer"
            style={{
              background: m.bg,
              borderColor: m.border,
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--shadow-md)',
              animation: 'slide-in-right 0.22s ease-out',
            }}
          >
            <div className="px-4 py-3 pr-9 flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: m.bg, color: m.text }}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium tracking-tight text-[var(--color-fg)] mb-0.5">
                  {toast.title}
                </p>
                <p className="text-xs leading-relaxed text-[var(--color-fg-dim)]">
                  {toast.message}
                </p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                removeToast(toast.id)
              }}
              className="absolute top-2.5 right-2.5 text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>

            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 origin-left"
              style={{
                background: m.bar,
                animation: `shrink-bar ${toast.duration}ms linear forwards`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
