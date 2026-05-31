import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { authApi } from './api/auth'

import ToastContainer from './components/ui/ToastContainer'
import AppLayout from './components/layout/AppLayout' // 💥 यहाँ अपना नया Layout import करो

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
  const { token, isReady } = useAuthStore()
  if (!isReady) return null // Loading state handle krne ke liye
  return token ? <AppLayout>{children}</AppLayout> : <Navigate to="/" replace />
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuthStore()
  if (!isReady) return null
  return !token ? <>{children}</> : <Navigate to="/chat" replace />
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
          <Route path="/video" element={<PrivateRoute><VideoPage /></PrivateRoute>} />
          <Route path="/video/:mode" element={<PrivateRoute><VideoPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}