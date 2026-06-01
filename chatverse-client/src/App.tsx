import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { authApi } from './api/auth'

import ToastContainer from './components/ui/ToastContainer'
import AppLayout from './components/layout/AppLayout' // 💥 यहाँ अपना नया Layout import करो

// Pages
import LandingPage      from './pages/auth/LandingPage'
import LoginPage        from './pages/auth/LoginPage'
import RegisterPage     from './pages/auth/RegisterPage'
import VerifyOtpPage    from './pages/auth/VerifyOtpPage'
import ChatPage         from './pages/chat/ChatPage'
import VideoLobbyPage   from './pages/video/VideoLobbyPage'
import VideoPage        from './pages/video/VideoPage'           // random 1-on-1
import RandomGroupPage  from './pages/video/RandomGroupPage'
import DirectCallPage   from './pages/video/DirectCallPage'
import HostedGroupPage  from './pages/video/HostedGroupPage'
import ProfilePage      from './pages/profile/ProfilePage'
import AgeDeclarePage      from './pages/verify/AgeDeclarePage'
import AiQuizPage          from './pages/verify/AiQuizPage'
import DocumentUploadPage  from './pages/verify/DocumentUploadPage'
import PricingPage         from './pages/billing/PricingPage'

// Guards
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuthStore()
  if (!isReady) return null // Loading state handle krne ke liye
  return token ? <AppLayout>{children}</AppLayout> : <Navigate to="/" replace />
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuthStore()
  if (!isReady) return null
  return !token ? <>{children}</> : <Navigate to="/chat" replace />
}

/**
 * RegisteredRoute — wraps PrivateRoute and additionally redirects guests
 * back to the lobby. Used for video modes that only registered users can
 * access (direct invite, hosted group). The lobby explains why.
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
    if (!token) { setReady(true); return }
    authApi.me()
      .then((res) => setAuth(res.data.data, token))
      .catch(() => { useAuthStore.getState().clearAuth() })
      .finally(() => setReady(true))
  }, [])

  return (
    <>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />

          {/* Protected - Inhe ab AppLayout milega */}
          <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/chat/:slug" element={<PrivateRoute><ChatPage /></PrivateRoute>} />

          {/* Video — lobby + four call modes (last two need an account) */}
          <Route path="/video" element={<PrivateRoute><VideoLobbyPage /></PrivateRoute>} />
          <Route path="/video/random" element={<PrivateRoute><VideoPage /></PrivateRoute>} />
          <Route path="/video/random-group" element={<PrivateRoute><RandomGroupPage /></PrivateRoute>} />
          <Route path="/video/invite" element={<RegisteredRoute><DirectCallPage /></RegisteredRoute>} />
          <Route path="/video/hosted" element={<RegisteredRoute><HostedGroupPage /></RegisteredRoute>} />

          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          {/* Age verification — registered users only */}
          <Route path="/verify/age" element={<RegisteredRoute><AgeDeclarePage /></RegisteredRoute>} />
          <Route path="/verify/ai-quiz" element={<RegisteredRoute><AiQuizPage /></RegisteredRoute>} />
          <Route path="/verify/document" element={<RegisteredRoute><DocumentUploadPage /></RegisteredRoute>} />

          {/* Billing */}
          <Route path="/pricing" element={<PrivateRoute><PricingPage /></PrivateRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}