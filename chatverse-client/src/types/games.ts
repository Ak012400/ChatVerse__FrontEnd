// ============================================================
//  Gaming Hall — TypeScript types mirroring the backend DTOs.
//
//  Enum values are PascalCase strings because every backend enum
//  has a [JsonConverter(typeof(JsonStringEnumConverter))] attribute
//  (see GameModels.cs). If you ever change the backend casing
//  policy, this file is the single point of update on the client.
// ============================================================

export type GameType = 'Quiz' | 'Jokes' | 'Trivia' | 'Chess' | 'Ludo'
export type GameRole = 'Player' | 'Spectator'
export type GameStatus = 'Lobby' | 'Playing' | 'Ended'

export type QuizDifficulty = 'Any' | 'Easy' | 'Medium' | 'Hard'

export type QuizCategory =
  | 'Any' | 'General' | 'Books' | 'Film' | 'Music'
  | 'Sports' | 'Geography' | 'History' | 'Politics'
  | 'Science' | 'Computers' | 'Mythology' | 'Animals'

// ─── REST request/response shapes ──────────────────────────────

export interface CreateGameRoomRequest {
  name: string
  type: GameType
  maxPlayers: number
  category: QuizCategory
  difficulty: QuizDifficulty
  questionCount: number
  secondsPerQuestion: number
  /** True = discoverable in the source chat's Active Games panel.
   *  False = only joinable via shared URL. Defaults to true on the
   *  backend if omitted. */
  isPublic?: boolean
  /** Slug of the chat room this game was launched from. Discovery
   *  panel filters on this so each themed room sees only its games. */
  sourceChatSlug?: string
}

export interface JoinGameRoomRequest {
  role: GameRole
}

export interface GameRoomDto {
  slug: string
  name: string
  type: GameType
  status: GameStatus
  playerCount: number
  maxPlayers: number
  spectatorCount: number
  hostUsername: string
  createdAtUtc: string
  /** True iff the room is publicly discoverable. */
  isPublic?: boolean
  /** True iff this is the always-on random room for its chat. */
  isRandom?: boolean
  /** Source chat slug (null for standalone Gaming Hall rooms). */
  sourceChatSlug?: string | null
}

// ─── Quiz payloads ─────────────────────────────────────────────

/**
 * Public-safe question — the correct index is NEVER sent to the
 * client until the round ends, so spectators can't whisper the
 * answer to players via chat.
 */
export interface QuizQuestionPublic {
  id: string
  category: string
  difficulty: string
  question: string
  options: string[]
  questionNumber: number
  totalQuestions: number
  /** ISO 8601 UTC string */
  deadlineUtc: string
}

export interface PlayerChoice {
  choiceIndex: number
  responseTimeMs: number
}

export interface QuizAnswerReveal {
  questionId: string
  correctIndex: number
  correctAnswer: string
  choicesByPlayer: Record<string, PlayerChoice>
  roundDurationMs: number
}

export interface ScoreEntry {
  userId: string
  username: string
  score: number
  correctAnswers: number
  answeredCount: number
  averageResponseMs: number
}

export interface GameParticipant {
  userId: string
  username: string
  role: GameRole
  isHost: boolean
  isOnline: boolean
}

export interface GameChatMessage {
  id: string
  senderId: string
  senderUsername: string
  senderRole: GameRole
  text: string
  /** ISO 8601 UTC string */
  atUtc: string
}

/**
 * What the server pushes when a fresh client joins (or reconnects).
 * Contains everything needed to paint the room in one shot — no
 * follow-up requests required for first render.
 */
export interface GameRoomSnapshot {
  room: GameRoomDto
  /** Null if the viewer is not a participant (e.g. browsing from
   *  the lobby). Drives whether the Submit button is rendered. */
  viewerRole: GameRole | null
  currentQuestion: QuizQuestionPublic | null
  scoreboard: ScoreEntry[]
  participants: GameParticipant[]
  recentChat: GameChatMessage[]
}

// ─── Jokes mode ────────────────────────────────────────────────

/** Four-emoji reaction palette — keep in sync with backend enum.
 *  PascalCase to match the JsonStringEnumConverter wire format. */
export type JokeReactionType = 'Laugh' | 'Meh' | 'Skull' | 'EyeRoll'

export interface JokePushed {
  id: string
  text: string
  jokeNumber: number
  totalJokes: number
  /** ISO 8601 UTC string */
  deadlineUtc: string
}

export interface JokeReactionsUpdated {
  jokeId: string
  /** Counts keyed by reaction type. Backend always sends all 4 keys
   *  so the bar chart doesn't need to defensively fill blanks. */
  counts: Record<JokeReactionType, number>
  totalReactions: number
}

export interface JokeRevealed {
  jokeId: string
  text: string
  counts: Record<JokeReactionType, number>
  topReaction: JokeReactionType
}

export interface JokeFinalStat {
  jokeId: string
  text: string
  laughCount: number
  totalReactions: number
}

// ─── Ambient questions (chat-room ticker) ──────────────────────

export type AmbientQuestionMode = 'Mcq' | 'Discussion'

export interface AmbientQuestion {
  id: string
  mode: AmbientQuestionMode
  text: string
  /** Present only when mode === 'Mcq'. Discussion prompts omit. */
  options: string[] | null
  category: string
  /** ISO 8601 UTC */
  emittedAtUtc: string
}

// ─── Rolling Quiz (in #general) ────────────────────────────────

export interface RollingQuizQuestion {
  id: string
  category: string
  difficulty: string
  question: string
  options: string[]
  /** ISO 8601 UTC */
  deadlineUtc: string
  /** UTC-day bucket (yyyyMMdd). Used to detect leaderboard rollover. */
  sessionId: string
}

export interface RollingQuizScored {
  userId: string
  username: string
  /** 1-based rank in the correct-answer ordering for THIS round. */
  rank: number
  pointsAwarded: number
  runningTotal: number
}

export interface RollingQuizRevealed {
  questionId: string
  correctIndex: number
  correctAnswer: string
  correctAnswerCount: number
  totalSubmissionCount: number
}

export interface RollingQuizLeaderEntry {
  userId: string
  username: string
  score: number
  correctAnswers: number
  totalAttempts: number
}

export interface RollingQuizLeaderboard {
  sessionId: string
  top: RollingQuizLeaderEntry[]
  youRow: RollingQuizLeaderEntry | null
}

// ─── Chess ─────────────────────────────────────────────────────

export type ChessColor = 'White' | 'Black'
export type ChessResult = 'InProgress' | 'WhiteWins' | 'BlackWins' | 'Draw' | 'Aborted'

export interface ChessMove {
  san: string
  uci: string
  fenAfter: string
  by: ChessColor
  atUtc: string
}

export interface ChessMovePushed {
  move: ChessMove
  moveNumber: number
  turnAfter: ChessColor
  result: ChessResult
  resultDetail: string | null
}

export interface ChessStateSnapshot {
  fen: string
  turn: ChessColor
  result: ChessResult
  moveHistory: ChessMove[]
  whitePlayerId: string | null
  whitePlayerName: string | null
  blackPlayerId: string | null
  blackPlayerName: string | null
}

// ─── Join request flow (private rooms) ────────────────────────

export type JoinRequestStatus = 'Pending' | 'Approved' | 'Declined'

export interface JoinRequestDto {
  id: string
  userId: string
  username: string
  requestedAtUtc: string
  status: JoinRequestStatus
}

export interface JoinRequestResolution {
  requestId: string
  userId: string
  status: JoinRequestStatus
}
