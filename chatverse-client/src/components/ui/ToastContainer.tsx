import { useToastStore } from '../../stores/toastStore'
import type { Toast } from '../../stores/toastStore'

const STYLES: Record<Toast['type'], { bg: string; border: string; icon: string; bar: string }> = {
  warning: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.35)', icon: '⚠️', bar: '#fbbf24' },
  danger:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  icon: '🛡️', bar: '#ef4444' },
  error:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   icon: '✕',  bar: '#ef4444' },
  success: { bg: 'rgba(0,200,180,0.1)',   border: 'rgba(0,200,180,0.35)', icon: '✓',  bar: '#00c8b4' },
  info:    { bg: 'rgba(99,57,255,0.1)',   border: 'rgba(99,57,255,0.35)', icon: 'ℹ',  bar: '#6339ff' },
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: '1.25rem', right: '1.25rem',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.75rem',
      maxWidth: 380, width: '100%',
    }}>
      {toasts.map((toast) => {
        const s = STYLES[toast.type]
        return (
          <div
            key={toast.id}
            style={{
              background:   s.bg,
              border:       `1px solid ${s.border}`,
              borderLeft:   `4px solid ${s.bar}`,
              borderRadius: 14,
              padding:      '1rem 1.25rem',
              backdropFilter: 'blur(20px)',
              boxShadow:    '0 8px 32px rgba(0,0,0,0.4)',
              animation:    'slideIn 0.25s ease',
              position:     'relative',
              cursor:       'pointer',
            }}
            onClick={() => removeToast(toast.id)}
          >
            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id) }}
              style={{
                position: 'absolute', top: '0.6rem', right: '0.75rem',
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
              }}
            >×</button>

            {/* Title */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              marginBottom: '0.4rem',
            }}>
              <span style={{ fontSize: '1rem' }}>{s.icon}</span>
              <span style={{
                fontSize: '0.9rem', fontWeight: 700, color: '#fff',
                letterSpacing: '-0.01em',
              }}>
                {toast.title}
              </span>
            </div>

            {/* Message */}
            <p style={{
              fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)',
              margin: 0, lineHeight: 1.5, paddingLeft: '1.5rem',
            }}>
              {toast.message}
            </p>

            {/* Progress bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: 3, borderRadius: '0 0 14px 14px',
              background: `linear-gradient(90deg, ${s.bar}, transparent)`,
              animation: `shrink ${toast.duration}ms linear forwards`,
            }} />
          </div>
        )
      })}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}