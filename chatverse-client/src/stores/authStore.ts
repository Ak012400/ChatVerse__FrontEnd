import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user:    User | null
  token:   string | null
  isReady: boolean

  setAuth:   (user: User, token: string) => void
  clearAuth: () => void
  setReady:  (ready: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:    null,
      token:   null,
      isReady: false,

      setAuth: (user, token) => {
        localStorage.setItem('cv_token', token)
        set({ user, token, isReady: true })
      },

      clearAuth: () => {
        localStorage.removeItem('cv_token')
        set({ user: null, token: null, isReady: true })
      },

      setReady: (ready) => set({ isReady: ready }),
    }),
    {
      name:    'cv_auth',
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)