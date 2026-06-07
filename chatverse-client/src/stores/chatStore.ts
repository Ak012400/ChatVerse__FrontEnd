import { create } from 'zustand'
import type { Room, Message } from '../types'
import type { AmbientQuestion } from '../types/games'

interface ChatState {
  rooms:       Room[]
  activeRoom:  string | null
  messages:    Record<string, Message[]>
  onlineCount: Record<string, number>
  typingUsers: Record<string, string[]> // 👈 Naya: Typing track karne ke liye

  /** Currently-live ambient question per room. Replaced wholesale
   *  when the server emits a new one — only the latest is shown. */
  ambientQuestion:  Record<string, AmbientQuestion>
  /** Per-room set of dismissed question IDs. Local-only state — the
   *  server doesn't care, and other users' visibility is unaffected. */
  dismissedAmbient: Record<string, Set<string>>

  setRooms:         (rooms: Room[]) => void
  setActiveRoom:    (slug: string | null) => void
  setMessages:      (slug: string, msgs: Message[]) => void
  addMessage:       (slug: string, msg: Message) => void
  updateMsgStatus:  (slug: string, msgId: string, status: Message['modStatus']) => void
  removeMessage:    (slug: string, msgId: string) => void
  setOnlineCount:   (slug: string, count: number) => void
  setTyping:        (slug: string, username: string) => void // 👈 Naya
  setAmbientQuestion: (slug: string, q: AmbientQuestion) => void
  dismissAmbient:     (slug: string, questionId: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  rooms:       [],
  activeRoom:  null,
  messages:    {},
  onlineCount: {},
  typingUsers: {}, // 👈 Initialize
  ambientQuestion:  {},
  dismissedAmbient: {},

  setRooms: (rooms) => set({ rooms }),
  setActiveRoom: (slug) => set({ activeRoom: slug }),
  setMessages: (slug, msgs) => set((s) => ({ messages: { ...s.messages, [slug]: msgs } })),
  
  addMessage: (slug, msg) => set((s) => ({
      messages: { ...s.messages, [slug]: [...(s.messages[slug] ?? []), msg] }
  })),
  
  updateMsgStatus: (slug, msgId, status) => set((s) => ({
      messages: {
        ...s.messages,
        [slug]: (s.messages[slug] ?? []).map((m) => m.id === msgId ? { ...m, modStatus: status } : m),
      }
  })),

  removeMessage: (slug, msgId) => set((s) => ({
      messages: { ...s.messages, [slug]: (s.messages[slug] ?? []).filter((m) => m.id !== msgId) }
  })),

  setOnlineCount: (slug, count) => set((s) => ({
      onlineCount: { ...s.onlineCount, [slug]: count }
  })),

  setAmbientQuestion: (slug, q) => set((s) => ({
      ambientQuestion: { ...s.ambientQuestion, [slug]: q }
  })),

  dismissAmbient: (slug, questionId) => set((s) => {
      const next = new Set(s.dismissedAmbient[slug] ?? [])
      next.add(questionId)
      return { dismissedAmbient: { ...s.dismissedAmbient, [slug]: next } }
  }),

  // 👈 Naya: Typing user add karo, aur 3 second baad automatically remove kar do
  setTyping: (slug, username) => {
    set((s) => {
      const current = s.typingUsers[slug] ?? []
      if (current.includes(username)) return s
      return { typingUsers: { ...s.typingUsers, [slug]: [...current, username] } }
    })
    setTimeout(() => {
      set((s) => ({
        typingUsers: { ...s.typingUsers, [slug]: (s.typingUsers[slug] ?? []).filter(u => u !== username) }
      }))
    }, 3000)
  }
}))