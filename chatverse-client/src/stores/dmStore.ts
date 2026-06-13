import { create } from 'zustand'
import type { SpotifyEmbedRef } from '../types'

export interface DmMessage {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  recipientId: string
  content: string
  type: string
  mediaUrl?: string | null
  isRead?: boolean
  /** Server-detected Spotify embed (mirrors room messages). */
  spotify?: SpotifyEmbedRef | null
  createdAt: string
}

export interface DmConversation {
  conversationId: string
  otherUserId: string
  otherUsername: string
  unreadCount: number
  lastMessage: string
  lastMessageMine: boolean
  lastMessageAt: string
}

interface DmState {
  conversations: DmConversation[]
  /** keyed by otherUserId */
  threads: Record<string, DmMessage[]>
  /** keyed by conversationId — counterparts who are currently typing */
  typingIn: Record<string, string[]>

  setConversations: (cs: DmConversation[]) => void
  upsertConversationFromMessage: (msg: DmMessage, myUserId: string) => void
  setThread: (otherUserId: string, msgs: DmMessage[]) => void
  appendToThread: (otherUserId: string, msg: DmMessage) => void
  markThreadRead: (otherUserId: string) => void
  setTyping: (conversationId: string, who: string) => void
}

export const useDmStore = create<DmState>((set) => ({
  conversations: [],
  threads: {},
  typingIn: {},

  setConversations: (cs) => set({ conversations: cs }),

  /**
   * Move (or create) a conversation row to the top when a new message
   * lands. Keeps the inbox sorted without re-fetching.
   */
  upsertConversationFromMessage: (msg, myUserId) =>
    set((s) => {
      const otherUserId = msg.senderId === myUserId ? msg.recipientId : msg.senderId
      const existing = s.conversations.find((c) => c.otherUserId === otherUserId)
      const isIncoming = msg.recipientId === myUserId

      const updated: DmConversation = existing
        ? {
            ...existing,
            lastMessage: msg.content,
            lastMessageMine: msg.senderId === myUserId,
            lastMessageAt: msg.createdAt,
            unreadCount: isIncoming
              ? (existing.unreadCount ?? 0) + 1
              : existing.unreadCount ?? 0,
          }
        : {
            conversationId: msg.conversationId,
            otherUserId,
            otherUsername: msg.senderId === myUserId ? '...' : msg.senderName,
            lastMessage: msg.content,
            lastMessageMine: msg.senderId === myUserId,
            lastMessageAt: msg.createdAt,
            unreadCount: isIncoming ? 1 : 0,
          }

      const rest = s.conversations.filter((c) => c.otherUserId !== otherUserId)
      return { conversations: [updated, ...rest] }
    }),

  setThread: (otherUserId, msgs) =>
    set((s) => ({ threads: { ...s.threads, [otherUserId]: msgs } })),

  appendToThread: (otherUserId, msg) =>
    set((s) => {
      const existing = s.threads[otherUserId] ?? []
      // Drop duplicates by id (e.g. server echoes our own message).
      if (existing.some((m) => m.id === msg.id)) return s
      return { threads: { ...s.threads, [otherUserId]: [...existing, msg] } }
    }),

  markThreadRead: (otherUserId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.otherUserId === otherUserId ? { ...c, unreadCount: 0 } : c,
      ),
    })),

  setTyping: (conversationId, who) => {
    set((s) => {
      const cur = s.typingIn[conversationId] ?? []
      if (cur.includes(who)) return s
      return { typingIn: { ...s.typingIn, [conversationId]: [...cur, who] } }
    })
    // auto-clear after 3 seconds
    setTimeout(() => {
      set((s) => ({
        typingIn: {
          ...s.typingIn,
          [conversationId]: (s.typingIn[conversationId] ?? []).filter((u) => u !== who),
        },
      }))
    }, 3000)
  },
}))
