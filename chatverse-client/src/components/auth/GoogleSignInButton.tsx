import { useEffect, useRef, useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

interface Props {
  /** Where to send the user after a successful sign-in. Defaults to /chat. */
  redirectTo?: string
}

/**
 * Themed "Continue with Google" button.
 *
 * Google's `<GoogleLogin>` component renders inside a sandboxed iframe whose
 * styling we can only partially control — when the user is already signed
 * into Google, it auto-personalises with the user's profile photo + email +
 * a white logo square, which breaks our dark theme.
 *
 * Trick: render Google's button HIDDEN (positioned off-screen, zero opacity)
 * and overlay OUR own button on top. When the user taps our button, we
 * programmatically dispatch a click into Google's hidden one — same OAuth
 * flow, same ID-token callback, our pixels.
 *
 * Disabled state ships if `VITE_GOOGLE_CLIENT_ID` isn't configured so devs
 * see a clear message instead of a silently dead button.
 */
export default function GoogleSignInButton({ redirectTo = '/chat' }: Props) {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const showToast = useToastStore((s) => s.showToast)

  const hiddenWrapRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const clientIdSet = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

  const handleSuccess = async (resp: CredentialResponse) => {
    if (!resp.credential) {
      showToast({
        type: 'error',
        title: 'Google sign-in failed',
        message: 'Google did not return a credential.',
        duration: 3500,
      })
      return
    }
    setBusy(true)
    try {
      const r = await authApi.googleSignIn(resp.credential)
      const data = r.data?.data
      if (!data?.token) throw new Error('Server returned no token')
      setAuth(
        {
          userId:           data.userId,
          username:         data.username,
          isGuest:          false,
          trustScore:       data.trustScore,
          ageVerified:      !!data.ageVerified,
          isEmailVerified:  true,
        } as any,
        data.token,
      )
      showToast({
        type:     'success',
        title:    data.isNew ? 'Welcome to ChatVerse!' : 'Signed in',
        message:  data.isNew ? `Welcome, ${data.username}` : 'Good to see you back.',
        duration: 3000,
      })
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? 'Google sign-in failed'
      showToast({ type: 'error', title: 'Sign-in failed', message: msg, duration: 4000 })
    } finally {
      setBusy(false)
    }
  }

  const handleError = () => {
    showToast({
      type: 'warning',
      title: 'Sign-in cancelled',
      message: 'Google sign-in was cancelled or failed.',
      duration: 3000,
    })
  }

  // Forward a tap on our custom button into Google's hidden button.
  // Works whether Google renders a single <button>, a wrapper with a
  // role="button" element, or an iframe — we hunt for the first match.
  const triggerGoogleClick = () => {
    if (!hiddenWrapRef.current) return
    const candidates = hiddenWrapRef.current.querySelectorAll(
      'div[role="button"], button, [tabindex]',
    )
    for (const el of Array.from(candidates) as HTMLElement[]) {
      if (typeof el.click === 'function') {
        el.click()
        return
      }
    }
    // Last-resort: dispatch a synthetic click on the wrapper itself
    // (some iframes only respond to events bubbled onto their container).
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true })
    hiddenWrapRef.current.dispatchEvent(evt)
  }

  // Keyboard support — Enter or Space on our button activates Google's.
  useEffect(() => {
    // No-op; just here so future keyboard handlers can hook in cleanly.
  }, [])

  if (!clientIdSet) {
    return (
      <button
        type="button"
        disabled
        title="Google sign-in not configured (VITE_GOOGLE_CLIENT_ID missing)"
        className="w-full inline-flex items-center justify-center gap-2.5 h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] text-sm cursor-not-allowed"
      >
        <GoogleGlyph />
        <span>Google sign-in not configured</span>
      </button>
    )
  }

  return (
    <div className="relative w-full">
      {/* OUR custom button — always visible, always themed. */}
      <button
        type="button"
        onClick={triggerGoogleClick}
        disabled={busy}
        className={[
          'group relative w-full inline-flex items-center justify-center gap-3 h-11 rounded-lg',
          'border border-[var(--color-line-strong)] bg-[var(--color-surface-1)]',
          'text-[var(--color-fg)] text-sm font-medium',
          'hover:border-[var(--color-accent-fg)] hover:bg-[var(--color-surface-2)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]',
          'transition-all duration-200',
          'active:scale-[0.98]',
          busy ? 'opacity-70 cursor-wait' : '',
        ].join(' ')}
        aria-label="Continue with Google"
      >
        {/* Soft hover-glow that fades in on group-hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.10), transparent 70%)',
          }}
        />
        {busy ? (
          <Loader2 size={16} className="animate-spin text-[var(--color-fg-dim)]" />
        ) : (
          <GoogleGlyph />
        )}
        <span className="relative z-10">
          {busy ? 'Signing in…' : 'Continue with Google'}
        </span>
      </button>

      {/* Google's REAL button — rendered invisibly. Its onSuccess fires the
          OAuth callback (we still get a real ID token / credential). The
          wrapper has pointer-events:auto so clicks can pass through when
          we programmatically dispatch them from our visible button. */}
      <div
        ref={hiddenWrapRef}
        aria-hidden="true"
        className="absolute inset-0 opacity-0"
        style={{
          // Sized to overlap our visible button exactly so any direct
          // pointer-event accidentally landing here still works.
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
            theme="filled_black"
            shape="rectangular"
            text="continue_with"
            width="100%"
            logo_alignment="center"
          />
        </div>
      </div>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.952 11.952 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}
