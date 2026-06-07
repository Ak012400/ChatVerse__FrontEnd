import { create } from 'zustand'

// ============================================================
//  notificationStore — the inbox for game invites + any future
//  app-level notifications.
//
//  Designed as a flat, append-only feed with localStorage
//  persistence so notifications survive a page reload. The bell
//  icon in PrimarySidebar reads from this and renders an unread
//  badge; the dropdown lists items newest-first.
//
//  Each notification has a type so the dropdown can render
//  appropriate actions (Join for invites, dismiss for the rest).
//  Adding a new type is just an entry in the union — no schema
//  migration needed because everything's in-browser.
// ============================================================

export type NotificationType = 'game-invite' | 'system' | 'room-closed'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  /** ISO 8601 UTC */
  receivedAtUtc: string
  /** Whether the user has expanded / clicked the row. */
  read: boolean
  /** Type-specific payload. For game-invite this carries
   *  inviteId + slug + roomName + gameType. For other types
   *  whatever data the action handler needs. */
  payload?: Record<string, unknown>
}

interface NotificationState {
  items: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'receivedAtUtc' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clear: () => void
  unreadCount: () => number
}

// localStorage key — versioned so a future schema change can wipe
// stale items cleanly via a bump.
const STORAGE_KEY = 'cv:notifications:v1'
const MAX_ITEMS = 50

function hydrate(): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_ITEMS) as AppNotification[]
  } catch {
    return []
  }
}

function persist(items: AppNotification[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS))) }
  catch { /* quota exceeded / private mode — non-fatal */ }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: hydrate(),

  add: (n) => set((s) => {
    const item: AppNotification = {
      ...n,
      id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAtUtc: new Date().toISOString(),
      read: false,
    }
    const next = [item, ...s.items].slice(0, MAX_ITEMS)
    persist(next)
    return { items: next }
  }),

  markRead: (id) => set((s) => {
    const next = s.items.map((it) => it.id === id ? { ...it, read: true } : it)
    persist(next)
    return { items: next }
  }),

  markAllRead: () => set((s) => {
    const next = s.items.map((it) => ({ ...it, read: true }))
    persist(next)
    return { items: next }
  }),

  remove: (id) => set((s) => {
    const next = s.items.filter((it) => it.id !== id)
    persist(next)
    return { items: next }
  }),

  clear: () => set(() => {
    persist([])
    return { items: [] }
  }),

  unreadCount: () => get().items.filter((it) => !it.read).length,
}))
