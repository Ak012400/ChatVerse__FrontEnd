import { create } from 'zustand'

export interface Toast {
  id:       string
  type:     'warning' | 'danger' | 'error' | 'success' | 'info'
  title:    string
  message:  string
  duration: number
}

interface ToastState {
  toasts:      Toast[]
  showToast:   (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (toast) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.duration)
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))