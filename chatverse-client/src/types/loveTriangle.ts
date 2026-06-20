// ============================================================
//  Love Triangle — client types
//
//  Two DTO families: MEMBER view (real usernames, own pair threads)
//  and PUBLIC view (anonymised to Member A/B/C, voting + excerpts).
// ============================================================

export type LoveTriangleStatus =
  | 'not_registered'
  | 'pending'
  | 'matched'
  | 'no_match'
  | 'withdrew'

export type LoveTrianglePhase = 'active' | 'voting' | 'completed'
export type PairKey = 'a-b' | 'b-c' | 'a-c'
export type MemberRole = 'A' | 'B' | 'C' | ''

export interface LoveTriangleRegistration {
  nextEventAt:  string             // ISO — next Sun 10pm IST in UTC
  status:       LoveTriangleStatus
  registeredAt: string | null
  triangleId:   string | null
  weekStart:    string             // YYYY-MM-DD
}

export interface PairMessage {
  id:             string
  content:        string
  senderUsername: string
  mine:           boolean
  isShared:       boolean
  sharedByMe:     boolean
  createdAt:      string
}

export interface PairThread {
  count:    number
  messages: PairMessage[]
}

/** Member view — full data; pair threads are restricted to my pairs. */
export interface MyTriangle {
  id:           string
  weekStart:    string
  scheduledFor: string
  chatEndsAt:   string
  votingEndsAt: string
  status:       LoveTrianglePhase
  myRole:       MemberRole
  members: {
    a: { username: string }
    b: { username: string }
    c: { username: string }
  }
  myPairs:     PairKey[]
  threads:     Record<string, PairThread>      // keyed by PairKey
  voteCounts:  Record<PairKey, number>
  winningPair: string | null
}

/** Public view — anonymised. */
export interface PublicTriangle {
  id:           string
  weekStart:    string
  scheduledFor: string
  chatEndsAt:   string
  votingEndsAt: string
  status:       LoveTrianglePhase
  members: { a: string; b: string; c: string }
  voteCounts:   Record<PairKey, number>
  myVote:       PairKey | null
  isMember:     boolean
  winningPair:  string | null
}

export interface PublicExcerpt {
  id:         string
  pairKey:    PairKey
  senderRole: MemberRole
  content:    string
  sharedAt:   string
  createdAt:  string
}

export interface HistoryRow {
  id:          string
  weekStart:   string
  myRole:      MemberRole
  status:      LoveTrianglePhase
  winningPair: string | null
  completedAt: string | null
}

// ── Hub responses ─────────────────────────────────────────────

export interface MyStatusResponse {
  registration:   LoveTriangleRegistration
  activeTriangle: MyTriangle | null
}

export interface PublicTrianglesResponse {
  count:     number
  triangles: PublicTriangle[]
}

export interface ExcerptsResponse {
  triangle: PublicTriangle
  excerpts: PublicExcerpt[]
}

export interface HistoryResponse {
  count:     number
  triangles: HistoryRow[]
}

// ── Server-push events ────────────────────────────────────────

export interface TriangleFormedEvent {
  triangleId:   string
  weekStart:    string
  scheduledFor: string
  chatEndsAt:   string
}

export interface PairMessageEvent {
  triangleId: string
  pairKey:    PairKey
  message:    PairMessage
}

export interface ExcerptSharedEvent {
  triangleId: string
  pairKey:    PairKey
  excerpt:    PublicExcerpt
}

export interface VotingOpenedEvent {
  triangleId:   string
  votingEndsAt: string
}

export interface TriangleCompletedEvent {
  triangleId:  string
  winningPair: string
  completedAt: string
}
