import { useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'

import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useUiStore } from '../../stores/uiStore'

interface Props {
  /** Where to send the user after a successful sign-in. Defaults to /chat. */
  redirectTo?: string
}

/**
 * Drop-in "Continue with Google" button. Works for both Login and Register
 * pages — Google returns the same ID token either way, and the backend
 * upserts: if the email exists it logs in, if not it creates the account
 * with email_verified=true (Google has already verified it).
 *
 * If VITE_GOOGLE_CLIENT_ID isn't set, the button shows a disabled state.
 */
export default function GoogleSignInButton({ redirectTo = '/chat' }: Props) {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const pushToast = useToastStore((s) => s.push)
  const theme = useUiStore((s) => s.theme)

  const [busy, setBusy] = useState(false)
  const clientIdSet = !!import.meta.env.VITE_GOOGLE_CLIENT_ID

  const handleSuccess = async (resp: CredentialResponse) => {
    if (!resp.credential) {
      pushToast({ kind: 'error', message: 'Google did not return a credential' })
      return
    }
    setBusy(true)
    try {
      const r = await authApi.googleSignIn(resp.credential)
      const data = r.data?.data
      if (!data?.token) throw new Error('Server returned no token')
      setAuth(
        {
          userId: data.userId,
          username: data.username,
          isGuest: false,
          trustScore: data.trustScore,
          ageVerified: !!data.ageVerified,
        },
        data.token,
      )
      pushToast({
        kind: 'success',
        message: data.isNew ? `Welcome to ChatVerse, ${data.username}!` : 'Signed in with Google',
      })
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Google sign-in failed'
      pushToast({ kind: 'error', message: msg })
    } finally {
      setBusy(false)
    }
  }

  const handleError = () => {
    pushToast({ kind: 'error', message: 'Google sign-in cancelled or failed' })
  }

  if (!clientIdSet) {
    // Render a friendly disabled state so devs know to set the env var,
    // without crashing or hiding the button entirely.
    return (
      <button
        type="button"
        disabled
        title="Google sign-in not configured (VITE_GOOGLE_CLIENT_ID missing)"
        className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-faint)] text-sm cursor-not-allowed"
      >
        <GoogleGlyph />
        <span>Google sign-in not configured</span>
      </button>
    )
  }

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        // Theme matches the app's current mode so the button doesn't look
        // out of place in either light or dark.
        theme={theme === 'light' ? 'outline' : 'filled_black'}
        shape="rectangular"
        text="continue_with"
        width="100%"
        logo_alignment="center"
      />
      {busy && (
        <p className="mt-2 text-center text-xs text-[var(--color-fg-faint)]">
          Finishing sign-in…
        </p>
      )}
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.952 11.952 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  )
}
