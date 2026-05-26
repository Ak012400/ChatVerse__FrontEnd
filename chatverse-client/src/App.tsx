import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { authApi } from './api/auth'

// Pages
import LandingPage    from './pages/auth/LandingPage'
import LoginPage      from './pages/auth/LoginPage'
import RegisterPage   from './pages/auth/RegisterPage'
import VerifyOtpPage  from './pages/auth/VerifyOtpPage'
import ChatPage       from './pages/chat/ChatPage'
import VideoPage      from './pages/video/VideoPage'
import ProfilePage    from './pages/profile/ProfilePage'

// Guards
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/" replace />
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return !token ? <>{children}</> : <Navigate to="/chat" replace />
}

export default function App() {
  const { token, setAuth, setReady } = useAuthStore()

  // Validate stored token on app start
  useEffect(() => {
    if (!token) { setReady(true); return }
    authApi.me()
      .then((res) => setAuth(res.data.data, token))
      .catch(() => {
        useAuthStore.getState().clearAuth()
      })
      .finally(() => setReady(true))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={
          <GuestRoute><LandingPage /></GuestRoute>
        } />
        <Route path="/login" element={
          <GuestRoute><LoginPage /></GuestRoute>
        } />
        <Route path="/register" element={
          <GuestRoute><RegisterPage /></GuestRoute>
        } />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />

        {/* Protected */}
        <Route path="/chat" element={
          <PrivateRoute><ChatPage /></PrivateRoute>
        } />
        <Route path="/chat/:slug" element={
          <PrivateRoute><ChatPage /></PrivateRoute>
        } />
        <Route path="/video" element={
          <PrivateRoute><VideoPage /></PrivateRoute>
        } />
        <Route path="/profile" element={
          <PrivateRoute><ProfilePage /></PrivateRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
