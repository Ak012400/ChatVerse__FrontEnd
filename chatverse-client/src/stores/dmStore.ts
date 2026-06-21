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
  /**
   * Insert an OPTIMISTIC conversation row when the user picks a fresh
   * search result. Survives the AppLayout `key={pathname}` remount
   * because it lives in the store, not in DmsPage local state. The
   * row carries empty `lastMessage` as a marker so `setConversations`
   * doesn't drop it when the server's GET /dms response comes back
   * without it (server only knows about conversations that have
   * actual messages).
   */
  upsertOptimisticConversation: (otherUserId: string, otherUsername: string, myUserId: string) => void
  setThread: (otherUserId: string, msgs: DmMessage[]) => void
  appendToThread: (otherUserId: string, msg: DmMessage) => void
  markThreadRead: (otherUserId: string) => void
  setTyping: (conversationId: string, who: string) => void
}

export const useDmStore = create<DmState>((set) => ({
  conversations: [],
  threads: {},
  typingIn: {},

  // Server-side `cs` is the canonical list, but if the user just
  // picked a brand-new search result the server doesn't know about
  // that conversation yet (no messages exchanged). Preserve any
  // OPTIMISTIC row (zero-message indicator: `lastMessage === ''`)
  // that isn't superseded by a server row. Otherwise the new picked
  // conversation would silently vanish after the GET /dms response.
  setConversations: (cs) =>
    set((s) => {
      const serverUids = new Set(cs.map((c) => c.otherUserId))
      const survivingOptimistic = s.conversations.filter(
        (c) => !serverUids.has(c.otherUserId) && c.lastMessage === '',
      )
      return { conversations: [...survivingOptimistic, ...cs] }
    }),

  upsertOptimisticConversation: (otherUserId, otherUsername, myUserId) =>
    set((s) => {
      if (!otherUserId || !otherUsername) return s
      // Already in the list (real or optimistic)? Bring it to the top
      // and refresh the username (in case the search returned a renamed user).
      const existing = s.conversations.find((c) => c.otherUserId === otherUserId)
      if (existing) {
        const updated = { ...existing, otherUsername }
        const rest = s.conversations.filter((c) => c.otherUserId !== otherUserId)
        return { conversations: [updated, ...rest] }
      }
      // Build a deterministic conversation id matching the backend's
      // sorted-pair convention (`MongoService.ConversationIdFor`).
      const convId = [myUserId, otherUserId].sort().join('|')
      const optimistic: DmConversation = {
        conversationId: convId,
        otherUserId,
        otherUsername,
        unreadCount: 0,
        lastMessage: '', // empty = optimistic marker (see setConversations)
        lastMessageMine: false,
        lastMessageAt: new Date().toISOString(),
      }
      return { conversations: [optimistic, ...s.conversations] }
    }),

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
