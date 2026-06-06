import { create } from 'zustand'
import type {
  GameRoomSnapshot,
  QuizQuestionPublic,
  QuizAnswerReveal,
  ScoreEntry,
  GameParticipant,
  GameChatMessage,
  GameStatus,
  GameRole,
} from '../types/games'

// ============================================================
//  gameStore — single source of truth for the active quiz room.
//
//  Why a dedicated store (and not just useState in the page)?
//    - useGameHub mounts inside the page tree, but the events it
//      handles (QuestionPushed, ScoreUpdated, ChatMessage…) need to
//      flow into multiple components (QuestionCard, Scoreboard,
//      CommentaryChat) without prop-drilling.
//    - State has to survive sub-route changes within the room
//      (lobby ↔ in-game ↔ ended) without re-mounting and losing
//      data.
//    - Mirrors the established pattern (authStore, chatStore,
//      dmStore — all Zustand).
//
//  Sizing decision — only ONE room's state lives here at a time.
//  Switching to a different game blows the previous room away via
//  `resetRoom()`. That keeps memory bounded and avoids a stale
//  scoreboard flashing for half a second when the user navigates.
// ============================================================

interface GameStoreState {
  /** The slug of the room currently mounted in the UI, or null if none. */
  activeSlug: string | null

  /** Whatever the server last told us about the room. Null while the
   *  initial snapshot is in flight. */
  snapshot: GameRoomSnapshot | null

  /** Current live question, if any. Mirrors snapshot.currentQuestion
   *  but is updated by QuestionPushed events without rebuilding the
   *  whole snapshot. */
  currentQuestion: QuizQuestionPublic | null

  /** Latest reveal — set when QuestionRevealed fires, cleared when the
   *  next question starts. Drives the post-question "correct was X"
   *  overlay. */
  lastReveal: QuizAnswerReveal | null

  /** Up-to-date scoreboard. Refreshed by ScoreUpdated / QuestionRevealed
   *  events. */
  scoreboard: ScoreEntry[]

  /** Roster. ParticipantJoined / Left events keep it fresh. */
  participants: GameParticipant[]

  /** Chat tail. Capped at 200 in-memory so a viral room can't bloat
   *  the store indefinitely. */
  chat: GameChatMessage[]

  /** Locally-tracked: did the current viewer already answer the
   *  current question? Lets us grey out the option buttons without
   *  waiting for an event echo. Cleared when a new question starts. */
  hasAnsweredCurrent: boolean
  /** The choice the viewer made, used for the "your pick" highlight. */
  myChoiceIndex: number | null

  // ───── Actions ─────────────────────────────────────────────────

  setActiveSlug: (slug: string | null) => void
  applySnapshot: (snap: GameRoomSnapshot) => void
  setRole: (role: GameRole | null) => void

  applyQuestionPushed: (q: QuizQuestionPublic) => void
  applyQuestionRevealed: (reveal: QuizAnswerReveal, scoreboard: ScoreEntry[]) => void
  applyScoreUpdated: (scoreboard: ScoreEntry[]) => void
  applyGameEnded: (finalScoreboard: ScoreEntry[]) => void

  applyParticipantJoined: (p: GameParticipant) => void
  applyParticipantLeft: (userId: string) => void

  applyChatMessage: (msg: GameChatMessage) => void

  markAnswered: (choiceIndex: number) => void

  resetRoom: () => void
}

const MAX_CHAT_IN_STORE = 200

export const useGameStore = create<GameStoreState>((set) => ({
  activeSlug: null,
  snapshot: null,
  currentQuestion: null,
  lastReveal: null,
  scoreboard: [],
  participants: [],
  chat: [],
  hasAnsweredCurrent: false,
  myChoiceIndex: null,

  setActiveSlug: (slug) => set({ activeSlug: slug }),

  applySnapshot: (snap) => set({
    snapshot: snap,
    currentQuestion: snap.currentQuestion,
    scoreboard: snap.scoreboard,
    participants: snap.participants,
    chat: snap.recentChat,
    // A snapshot mid-question means the user just (re)joined — we don't
    // know if they already answered, but they CAN'T answer this round
    // anyway (server rejects new joins to questions in progress, see
    // QuizSession.SubmitMoveAsync). Treat as answered to grey out buttons.
    hasAnsweredCurrent: snap.currentQuestion !== null,
    myChoiceIndex: null,
    lastReveal: null,
  }),

  setRole: (role) => set((s) => s.snapshot
    ? { snapshot: { ...s.snapshot, viewerRole: role } }
    : {}),

  applyQuestionPushed: (q) => set({
    currentQuestion: q,
    lastReveal: null,
    hasAnsweredCurrent: false,
    myChoiceIndex: null,
  }),

  applyQuestionRevealed: (reveal, scoreboard) => set({
    lastReveal: reveal,
    scoreboard,
    hasAnsweredCurrent: true,
  }),

  applyScoreUpdated: (scoreboard) => set({ scoreboard }),

  applyGameEnded: (finalScoreboard) => set((s) => ({
    scoreboard: finalScoreboard,
    currentQuestion: null,
    snapshot: s.snapshot
      ? { ...s.snapshot, room: { ...s.snapshot.room, status: 'Ended' as GameStatus } }
      : null,
  })),

  applyParticipantJoined: (p) => set((s) => {
    // Dedup by userId — a refresh might fire Joined for someone already
    // in the list. Replace rather than push so the existing IsOnline
    // toggle updates.
    const without = s.participants.filter((x) => x.userId !== p.userId)
    return { participants: [...without, p] }
  }),

  applyParticipantLeft: (userId) => set((s) => ({
    participants: s.participants.filter((p) => p.userId !== userId),
  })),

  applyChatMessage: (msg) => set((s) => {
    // Cap from the front so the most recent messages always render.
    const next = [...s.chat, msg]
    if (next.length > MAX_CHAT_IN_STORE) next.splice(0, next.length - MAX_CHAT_IN_STORE)
    return { chat: next }
  }),

  markAnswered: (choiceIndex) => set({
    hasAnsweredCurrent: true,
    myChoiceIndex: choiceIndex,
  }),

  resetRoom: () => set({
    activeSlug: null,
    snapshot: null,
    currentQuestion: null,
    lastReveal: null,
    scoreboard: [],
    participants: [],
    chat: [],
    hasAnsweredCurrent: false,
    myChoiceIndex: null,
  }),
}))
