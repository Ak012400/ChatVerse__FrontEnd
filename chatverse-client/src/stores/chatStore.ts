import { create } from 'zustand'
import type { Room, Message } from '../types'

interface ChatState {
  rooms:       Room[]
  activeRoom:  string | null
  messages:    Record<string, Message[]>   // roomSlug → messages
  onlineCount: Record<string, number>      // roomSlug → count

  setRooms:         (rooms: Room[]) => void
  setActiveRoom:    (slug: string | null) => void
  setMessages:      (slug: string, msgs: Message[]) => void
  addMessage:       (slug: string, msg: Message) => void
  updateMsgStatus:  (slug: string, msgId: string, status: Message['modStatus']) => void
  removeMessage:    (slug: string, msgId: string) => void
  setOnlineCount:   (slug: string, count: number) => void
}

export const useChatStore = create<ChatState>((set) => ({
  rooms:       [],
  activeRoom:  null,
  messages:    {},
  onlineCount: {},

  setRooms: (rooms) => set({ rooms }),

  setActiveRoom: (slug) => set({ activeRoom: slug }),

  setMessages: (slug, msgs) =>
    set((s) => ({ messages: { ...s.messages, [slug]: msgs } })),

  addMessage: (slug, msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [slug]: [...(s.messages[slug] ?? []), msg],
      },
    })),

  updateMsgStatus: (slug, msgId, status) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [slug]: (s.messages[slug] ?? []).map((m) =>
          m.id === msgId ? { ...m, modStatus: status } : m
        ),
      },
    })),

  removeMessage: (slug, msgId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [slug]: (s.messages[slug] ?? []).filter((m) => m.id !== msgId),
      },
    })),

  setOnlineCount: (slug, count) =>
    set((s) => ({ onlineCount: { ...s.onlineCount, [slug]: count } })),
}))