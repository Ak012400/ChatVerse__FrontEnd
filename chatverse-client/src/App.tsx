import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuthStore } from './stores/authStore'
import { authApi } from './api/auth'

import ToastContainer from './components/ui/ToastContainer'
import ThemeProvider from './components/ui/ThemeProvider'
import AppLayout from './components/layout/AppLayout'
import ErrorBoundary from './components/ui/ErrorBoundary'

// Google OAuth — exposes the popup/button machinery. If the client ID
// isn't set we still render the app (Login page renders a disabled button).
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

// Pages
import LandingPage         from './pages/auth/LandingPage'
import LoginPage           from './pages/auth/LoginPage'
import RegisterPage        from './pages/auth/RegisterPage'
import VerifyOtpPage       from './pages/auth/VerifyOtpPage'
import ForgotPasswordPage  from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage   from './pages/auth/ResetPasswordPage'
import ChatPage            from './pages/chat/ChatPage'
import VideoLobbyPage      from './pages/video/VideoLobbyPage'
import VideoPage           from './pages/video/VideoPage'           // random 1-on-1
import RandomGroupPage     from './pages/video/RandomGroupPage'
import DirectCallPage      from './pages/video/DirectCallPage'
import HostedGroupPage     from './pages/video/HostedGroupPage'
import TheaterRoomPage     from './pages/video/TheaterRoomPage'
import ProfilePage         from './pages/profile/ProfilePage'
import AgeDeclarePage      from './pages/verify/AgeDeclarePage'
import AiQuizPage          from './pages/verify/AiQuizPage'
import DocumentUploadPage  from './pages/verify/DocumentUploadPage'
import PricingPage         from './pages/billing/PricingPage'
import AdminDashboardPage  from './pages/admin/AdminDashboardPage'
import DmsPage             from './pages/dms/DmsPage'
import CreateRoomPage      from './pages/rooms/CreateRoomPage'
import GamingHallPage      from './pages/games/GamingHallPage'
import QuizRoomPage         from './pages/games/QuizRoomPage'
import PlayRoomPage         from './pages/games/PlayRoomPage'
import LudoRoomPage         from './pages/games/LudoRoomPage'
import TimeCapsulePage      from './pages/timeCapsule/TimeCapsulePage'
import AboutFeaturesPage    from './pages/about/AboutFeaturesPage'
import PersonaPage          from './pages/persona/PersonaPage'

// Guards
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuthStore()
  if (!isReady) return null
  return token ? <AppLayout>{children}</AppLayout> : <Navigate to="/" replace />
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuthStore()
  if (!isReady) return null
  return !token ? <>{children}</> : <Navigate to="/chat" replace />
}

/**
 * RegisteredRoute — wraps PrivateRoute and additionally redirects guests
 * back to the lobby. Used for features that only registered users can
 * access (direct invite, hosted group, DMs, verification, admin).
 */
function RegisteredRoute({ children }: { children: React.ReactNode }) {
  const { token, user, isReady } = useAuthStore()
  if (!isReady) return null
  if (!token) return <Navigate to="/" replace />
  if (user?.isGuest) return <Navigate to="/video" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { token, setAuth, setReady } = useAuthStore()

  useEffect(() => {
    // ── Auth bootstrap. Splash stays up (gated by `cv:app-ready`
    //    event below) until this resolves, so the user never sees the
    //    `null`-rendering route guards.
    const markReady = () => {
      setReady(true)
      // One paint cycle after ready flips so the first real page has
      // a chance to commit before we tell the splash to fade.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new Event('cv:app-ready'))
      }))
    }

    if (!token) { markReady(); return }
    authApi.me()
      .then((res) => setAuth(res.data.data, token))
      .catch(() => { useAuthStore.getState().clearAuth() })
      .finally(markReady)
  }, [])

  const tree = (
    <ErrorBoundary>
    <ThemeProvider>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
          <Route path="/reset-password" element={<GuestRoute><ResetPasswordPage /></GuestRoute>} />

          {/* Protected — Chat */}
          <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/chat/:slug" element={<PrivateRoute><ChatPage /></PrivateRoute>} />

          {/* DMs — registered only */}
          <Route path="/dms" element={<RegisteredRoute><DmsPage /></RegisteredRoute>} />
          <Route path="/dms/:otherUserId" element={<RegisteredRoute><DmsPage /></RegisteredRoute>} />

          {/* Time Capsule — registered only. Guests aren't a stable
              recipient pool (24h auto-expire) so the feature would
              orphan capsules if guests could write/receive. */}
          <Route path="/time-capsule" element={<RegisteredRoute><TimeCapsulePage /></RegisteredRoute>} />

          {/* Persona Roulette — registered only. Same recipient-pool
              reasoning as Time Capsule. */}
          <Route path="/persona" element={<RegisteredRoute><PersonaPage /></RegisteredRoute>} />

          {/* Create-room — registered only */}
          <Route path="/rooms/new" element={<RegisteredRoute><CreateRoomPage /></RegisteredRoute>} />

          {/* Gaming Hall — registered only (no guests).
              GamingHallPage is the entry + room browser; QuizRoomPage
              is the live room view. Both gated behind RegisteredRoute
              because scoreboards/persistence need a stable user identity. */}
          <Route path="/games" element={<RegisteredRoute><GamingHallPage /></RegisteredRoute>} />
          <Route path="/games/:slug" element={<RegisteredRoute><QuizRoomPage /></RegisteredRoute>} />
          {/* Heavy games (Chess, future Ludo) use a dedicated full-
              screen overlay. PrivateRoute (not RegisteredRoute) so
              guests CAN view the board + chat, just can't make moves. */}
          <Route path="/play/:slug" element={<PrivateRoute><PlayRoomPage /></PrivateRoute>} />
          {/* Ludo — same guest-can-watch policy as chess. */}
          <Route path="/ludo/:slug" element={<PrivateRoute><LudoRoomPage /></PrivateRoute>} />

          {/* Video — lobby + four call modes (last two need an account) */}
          <Route path="/video" element={<PrivateRoute><VideoLobbyPage /></PrivateRoute>} />
          <Route path="/video/random" element={<PrivateRoute><VideoPage /></PrivateRoute>} />
          <Route path="/video/random-group" element={<PrivateRoute><RandomGroupPage /></PrivateRoute>} />
          <Route path="/video/invite" element={<RegisteredRoute><DirectCallPage /></RegisteredRoute>} />
          <Route path="/video/hosted" element={<RegisteredRoute><HostedGroupPage /></RegisteredRoute>} />
          {/* Theater (Watch Party) — shared screen + per-user cams */}
          <Route path="/theater/:roomName" element={<RegisteredRoute><TheaterRoomPage /></RegisteredRoute>} />

          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          {/* Age verification — registered users only */}
          <Route path="/verify/age" element={<RegisteredRoute><AgeDeclarePage /></RegisteredRoute>} />
          <Route path="/verify/ai-quiz" element={<RegisteredRoute><AiQuizPage /></RegisteredRoute>} />
          <Route path="/verify/document" element={<RegisteredRoute><DocumentUploadPage /></RegisteredRoute>} />

          {/* Billing */}
          <Route path="/pricing" element={<PrivateRoute><PricingPage /></PrivateRoute>} />

          {/* Admin — page itself checks /admin/whoami */}
          <Route path="/admin" element={<RegisteredRoute><AdminDashboardPage /></RegisteredRoute>} />

          {/* Feature rules / how-it-works — open to everyone logged in,
              including guests, so they can learn what they\'re missing. */}
          <Route path="/about" element={<PrivateRoute><AboutFeaturesPage /></PrivateRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  )

  // Only mount the OAuth provider when the client ID is configured —
  // an empty clientId crashes the popup. Without a client ID the rest
  // of the app still loads; the Google button stays disabled.
  return GOOGLE_CLIENT_ID
    ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>
    : tree
}
