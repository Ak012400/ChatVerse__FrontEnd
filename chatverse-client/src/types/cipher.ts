// ============================================================
//  The Cipher — client types
//
//  Mirrors CipherHub.cs anonymous DTOs.
// ============================================================

export interface CurrentRoundState {
  hasActive:      boolean
  roundId?:       string
  weekLabel?:     string
  startsAt?:      string
  endsAt?:        string
  phraseLength?:  number
  iAmMember?:     boolean
  iHaveSubmitted?: boolean
  mySubmission?: {
    guessedPhrase: string
    namedUserIds:  string[]
    submittedAt:   string
  } | null
}

export interface MyFragmentState {
  hasFragment:        boolean
  weekLabel?:         string
  roundEndsAt?:       string
  assignedFragment?:  string
}

export interface MySubmission {
  guessedPhrase: string
  namedUserIds:  string[]
  submittedAt:   string
}

export interface MySubmissionResponse {
  hasSubmission:  boolean
  guessedPhrase?: string
  namedUserIds?:  string[]
  submittedAt?:   string
}

export interface SubmissionConfirmation {
  id:            string
  roundId:       string
  guessedPhrase: string
  namedUserIds:  string[]
  submittedAt:   string
}

export interface LeaderboardRow {
  hunterUsername: string
  accuracyPct:    number
  won:            boolean
  roundId:        string
  submittedAt:    string
}

export interface LeaderboardResponse {
  count: number
  rows:  LeaderboardRow[]
}

export interface ArchiveRound {
  id:              string
  weekLabel:       string
  phrase:          string
  closedAt:        string
  memberCount:     number
  memberUsernames: string[]
  winningHunters:  number
}

export interface ArchiveResponse {
  count:  number
  rounds: ArchiveRound[]
}

// ── Server-push event payloads ────────────────────────────────

export interface CipherRoundStartedEvent {
  roundId:      string
  weekLabel:    string
  startsAt:     string
  endsAt:       string
  phraseLength: number
}

export interface CipherFragmentAssignedEvent {
  roundId:          string
  weekLabel:        string
  roundEndsAt:      string
  assignedFragment: string
}

export interface CipherRoundClosedEvent {
  roundId:         string
  weekLabel:       string
  phrase:          string
  memberUsernames: string[]
  winningHunters:  number
  closedAt:        string
}
