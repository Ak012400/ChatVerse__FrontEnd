import { Component, type ReactNode } from 'react'

/**
 * Top-level React error boundary.
 *
 * Without this, a render-time exception ANYWHERE in the tree blanks the
 * whole app — that was the captions-crash symptom users reported.
 * With it, the failing subtree is replaced by a friendly retry card
 * while the rest of the app keeps working.
 *
 * We deliberately keep the fallback simple (no design dependencies) so
 * even if styling fails it still renders something useful.
 */
interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface to devtools / future logging endpoint.
    // Keeping console for now so Arun's testing browser shows the stack.
    console.error('[cv] ErrorBoundary caught:', error, info?.componentStack)
  }

  handleReload = () => {
    // Full reload is the simplest recovery — react-router state is
    // already broken at this point.
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0b0a14', color: '#ede6ff',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px',
            borderRadius: '50%',
            background: 'rgba(126,20,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
          }}>⚡</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something glitched
          </h1>
          <p style={{ fontSize: 13, color: '#c9a3ff', marginBottom: 20, lineHeight: 1.5 }}>
            ChatVerse hit an unexpected error. The good news: your session is safe —
            a quick reload usually fixes it.
          </p>
          {this.state.error?.message && (
            <details style={{ textAlign: 'left', marginBottom: 16, fontSize: 11, color: '#888' }}>
              <summary style={{ cursor: 'pointer' }}>Error detail</summary>
              <pre style={{ overflow: 'auto', padding: '8px 0', whiteSpace: 'pre-wrap' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 16px',
                background: 'transparent', color: '#ede6ff',
                border: '1px solid rgba(237,230,255,0.25)',
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 16px',
                background: '#7e14ff', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
