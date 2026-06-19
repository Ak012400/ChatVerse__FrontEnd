// ============================================================
//  Story Chain — client type contracts
//
//  Mirrors the DTOs from StoryChainHub.cs (kept in lockstep).
//  The hub returns camelCase by default — ASP.NET JSON convention.
// ============================================================

export type ChainStatus = 'active' | 'locked' | 'published'

export interface StoryContribution {
  sentence:       string
  authorUsername: string
  addedAt:        string                 // ISO
}

/** Full state of today's chain — what GetCurrentChain + JoinQueue +
 *  LeaveQueue + AddSentence all return. */
export interface ChainState {
  id:               string
  promptDate:       string                // YYYY-MM-DD IST
  prompt:           string
  status:           ChainStatus
  sentences:        StoryContribution[]
  totalSentences:   number
  cap:              number                // 50
  queueLength:      number
  myQueuePosition:  number | null
  myTurn:           boolean
  hasActiveTurn:    boolean
  hasContributed:   boolean
}

/** One row in GetArchive() — a finished, published chain. */
export interface ArchivedChain {
  id:             string
  promptDate:     string
  prompt:         string
  totalSentences: number
  publishedAt:    string
  sentences:      StoryContribution[]
}

// ── Server-push event payloads ────────────────────────────────

/** Sent only to the new turn-holder. */
export interface TurnAssignedEvent {
  chainId:   string
  expiresAt: string                       // ISO — 10 min from now
}

/** Fanned to the chain group. */
export interface ContributionAddedEvent {
  chainId:        string
  sentence:       string
  authorUsername: string
  addedAt:        string
  totalSentences: number
}

/** Fanned to the chain group when queue length changes. */
export interface QueueUpdatedEvent {
  chainId:       string
  queueLength:   number
  hasActiveTurn: boolean
}

/** Fanned when the chain locks (cap reached OR day ended). */
export interface ChainLockedEvent {
  chainId: string
  reason:  'cap_reached' | 'day_ended'
}
