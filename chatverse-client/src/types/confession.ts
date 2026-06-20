// ============================================================
//  Confession Box — client types
//
//  Mirrors the DTOs from ConfessionHub.cs. Author identity is
//  ONLY ever present as `revealedUsername` (string when revealed,
//  null otherwise). `mine` is the server-computed "is this me?"
//  flag — the ONLY identity bit returned to the caller.
// ============================================================

export interface ConfessionCard {
  id:               string
  content:          string
  totalReactions:   number
  /** Per-emoji counts. Emoji keys come from `allowedEmojis` returned
   *  by GetTodaysFeed; client never picks its own. */
  reactionCounts:   Record<string, number>
  /** Which emoji I personally picked (null if none). */
  mineEmoji:        string | null
  /** Whether THIS card is mine. The only identity bit. */
  mine:             boolean
  topRanked:        boolean
  /** Author username — present ONLY when AuthorOptedReveal == true. */
  revealedUsername: string | null
  createdAt:        string
}

export interface FeedResponse {
  date:           string
  count:          number
  confessions:    ConfessionCard[]
  allowedEmojis:  string[]
}

export interface LoreWallResponse {
  weekStart:      string
  count:          number
  confessions:    ConfessionCard[]
}

export interface TopOfferResponse {
  hasOffer:        boolean
  id?:             string
  content?:        string
  totalReactions?: number
  topRankedAt?:    string
}

// ── Server-push event payloads ────────────────────────────────

export type ConfessionPostedEvent = ConfessionCard
export type ReactionUpdatedEvent = ConfessionCard

export interface ConfessionRevealedEvent {
  id:             string
  authorUsername: string
  revealedAt:     string
}

export interface TopConfessionOfferedEvent {
  id:             string
  content:        string
  totalReactions: number
  date:           string
}
