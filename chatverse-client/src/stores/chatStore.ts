import { create } from 'zustand'
import type { Room, Message } from '../types'
import type {
  AmbientQuestion,
  RollingQuizQuestion,
  RollingQuizRevealed,
  RollingQuizLeaderboard,
  RollingQuizScored,
} from '../types/games'

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

  // ─── Rolling Quiz (#general only) ──────────────────────────────
  /** Live question, null between rounds or before first push. */
  rollingQuizQuestion: RollingQuizQuestion | null
  /** Latest reveal payload (correct answer). Cleared on next push. */
  rollingQuizReveal:   RollingQuizRevealed | null
  /** Live per-day leaderboard. */
  rollingQuizBoard:    RollingQuizLeaderboard | null
  /** Last 5 scoring events ("🥇 Alice +100" notifications). */
  rollingQuizRecent:   RollingQuizScored[]
  /** Local: which choice the user picked + whether server accepted. */
  rollingQuizMyAnswer: { questionId: string; choiceIndex: number; isCorrect?: boolean } | null

  setRooms:         (rooms: Room[]) => void
  setActiveRoom:    (slug: string | null) => void
  setMessages:      (slug: string, msgs: Message[]) => void
  addMessage:       (slug: string, msg: Message) => void
  updateMsgStatus:  (slug: string, msgId: string, status: Message['modStatus']) => void
  /** Replace the reactions map on a single message — used when the
   *  server broadcasts the authoritative post-toggle state. */
  updateMsgReactions: (slug: string, msgId: string, reactions: Record<string, string[]>) => void
  removeMessage:    (slug: string, msgId: string) => void
  setOnlineCount:   (slug: string, count: number) => void
  setTyping:        (slug: string, username: string) => void // 👈 Naya
  setAmbientQuestion: (slug: string, q: AmbientQuestion) => void
  dismissAmbient:     (slug: string, questionId: string) => void

  setRollingQuizQuestion: (q: RollingQuizQuestion) => void
  setRollingQuizReveal:   (r: RollingQuizRevealed) => void
  setRollingQuizBoard:    (b: RollingQuizLeaderboard) => void
  pushRollingQuizScored:  (s: RollingQuizScored) => void
  setRollingQuizMyAnswer: (a: { questionId: string; choiceIndex: number; isCorrect?: boolean } | null) => void
}

export const useChatStore = create<ChatState>((set) => ({
  rooms:       [],
  activeRoom:  null,
  messages:    {},
  onlineCount: {},
  typingUsers: {}, // 👈 Initialize
  ambientQuestion:  {},
  dismissedAmbient: {},
  rollingQuizQuestion: null,
  rollingQuizReveal:   null,
  rollingQuizBoard:    null,
  rollingQuizRecent:   [],
  rollingQuizMyAnswer: null,

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

  updateMsgReactions: (slug, msgId, reactions) => set((s) => ({
      messages: {
        ...s.messages,
        [slug]: (s.messages[slug] ?? []).map((m) => m.id === msgId ? { ...m, reactions } : m),
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

  setRollingQuizQuestion: (q) => set({
      // New question wipes the reveal + my-answer state so the old
      // colours don't bleed into the next round's render.
      rollingQuizQuestion: q,
      rollingQuizReveal:   null,
      rollingQuizMyAnswer: null,
  }),

  setRollingQuizReveal: (r) => set({ rollingQuizReveal: r }),

  setRollingQuizBoard: (b) => set({ rollingQuizBoard: b }),

  pushRollingQuizScored: (s) => set((prev) => {
      // Keep only the 5 most recent for the "live notifications" strip.
      const next = [s, ...prev.rollingQuizRecent].slice(0, 5)
      return { rollingQuizRecent: next }
  }),

  setRollingQuizMyAnswer: (a) => set({ rollingQuizMyAnswer: a }),

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