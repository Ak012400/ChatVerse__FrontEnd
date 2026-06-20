// ============================================================
//  Ghost Date — client types
//
//  Mirrors GhostDateHub.cs DTOs. Real user IDs are never present.
//  The other party is "Voyager" until outcome=mutual_reveal.
// ============================================================

export type GhostDateStatus =
  | 'not_registered'
  | 'pending'
  | 'matched'
  | 'no_match'
  | 'withdrew'

export type GhostDateOutcome =
  | 'mutual_reveal'
  | 'bittersweet'
  | 'mutual_pass'
  | 'expired'

/** Returned by Register/Withdraw/GetMyStatus (inside `registration`). */
export interface GhostDateRegistration {
  nextEventAt:   string             // ISO — next Thu 9pm IST in UTC
  status:        GhostDateStatus
  registeredAt:  string | null
  pairedDateId:  string | null
  eventDate:     string             // YYYY-MM-DD IST
}

/** Live-date snapshot. */
export interface ActiveGhostDate {
  id:                 string
  scheduledFor:       string
  expiresAt:          string
  decisionDeadline:   string
  theirDisplay:       string        // "Voyager" until mutual_reveal
  myDecision:         boolean | null
  theirDecided:       boolean
  outcome:            GhostDateOutcome | null
}

export interface GhostDateMessage {
  id:        string
  content:   string
  createdAt: string
  mine:      boolean
}

export interface GhostDateHistoryRow {
  id:           string
  eventDate:    string
  scheduledFor: string
  outcome:      GhostDateOutcome | null
  theirDisplay: string
}

// ── Hub returns ────────────────────────────────────────────────

export interface MyStatusResponse {
  registration: GhostDateRegistration
  activeDate:   ActiveGhostDate | null
}

export interface ThreadResponse {
  dateId:   string
  count:    number
  messages: GhostDateMessage[]
}

export interface HistoryResponse {
  count: number
  dates: GhostDateHistoryRow[]
}

// ── Server-push event payloads ────────────────────────────────

export interface GhostDateMatchedEvent {
  dateId:           string
  scheduledFor:     string
  expiresAt:        string
  decisionDeadline: string
}

export type GhostDateMessageEvent = GhostDateMessage

export interface GhostDateEndedEvent {
  dateId:           string
  decisionDeadline: string
}

export interface GhostDateOutcomeEvent {
  id:                  string
  outcome:             GhostDateOutcome
  outcomeAt:           string
  theirDisplay:        string | null
  nextEligibleMatchAt: string | null
}
