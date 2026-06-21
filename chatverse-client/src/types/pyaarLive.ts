// ============================================================
//  PYAAR LIVE — client types
//
//  Mirrors PyaarLiveHub.cs DTOs.
// ============================================================

export type PyaarStatus =
  | 'not_registered'
  | 'pending'
  | 'matched'
  | 'no_match'
  | 'withdrew'

export type ShowStatus = 'pending' | 'live' | 'completed'

export interface PyaarRegistration {
  nextEventAt:  string
  status:       PyaarStatus
  registeredAt: string | null
  eventDate:    string
}

export interface CoupleSummary {
  id:                string
  codename:          string
  coupleNumber:      number
  voteCount:         number
  eliminated:        boolean
  eliminatedInRound: number | null
  finalRank:         number | null
  memberA:           string
  memberB:           string
  videoActive:       boolean
  spectatorCount:    number
}

export interface ShowDto {
  id:                  string
  eventDate:           string
  scheduledFor:        string
  status:              ShowStatus
  currentRound:        number   // 0 = pre-show / 1..4 = live / 5 = post
  currentRoundLabel:   string | null
  currentRoundEndsAt:  string | null
  prizePool:           number
  hostedBy:            string         // "ChatVerse System" today
  spectatorCount:      number         // show-wide live spectator count
  iAmInCouple:         boolean
  myCoupleId:          string | null
  couples:             CoupleSummary[]
  winningCoupleIds:    string[]
}

export interface PyaarMessage {
  id:             string
  coupleId:       string
  senderUsername: string
  senderUserId?:  string
  mine?:          boolean
  roundNumber:    number
  content:        string
  createdAt:      string
}

export interface MyCoupleDto {
  id:                  string
  codename:            string
  coupleNumber:        number
  partnerUsername:     string
  voteCount:           number
  eliminated:          boolean
  eliminatedInRound:   number | null
  finalRank:           number | null
  currentRound:        number
  currentRoundLabel:   string | null
  currentRoundEndsAt:  string | null
  messages:            PyaarMessage[]
}

export interface SpectatorCoupleRow extends CoupleSummary {
  recent: PyaarMessage[]
}

export interface SpectatorView {
  show:    ShowDto
  myVote:  string | null
  couples: SpectatorCoupleRow[]
}

export interface MyStatusResponse {
  registration: PyaarRegistration
  activeShow:   ShowDto | null
  myCouple:     MyCoupleDto | null
}

export interface HistoryRow {
  showId:       string
  eventDate:    string
  scheduledFor: string
  myCouple: {
    codename:          string
    finalRank:         number | null
    eliminated:        boolean
    eliminatedInRound: number | null
  } | null
  winnersCount: number
}

export interface HistoryResponse { count: number; shows: HistoryRow[] }

// ── Server-push event payloads ────────────────────────────────

export interface ShowStartedEvent {
  showId:             string
  eventDate:          string
  scheduledFor:       string
  currentRound:       number
  currentRoundLabel:  string
  currentRoundEndsAt: string
  coupleCount:        number
}

export interface RoundAdvancedEvent {
  showId:             string
  currentRound:       number
  currentRoundLabel:  string
  currentRoundEndsAt: string
}

export type CoupleMessageEvent = PyaarMessage
export type SpectatorMessageEvent = PyaarMessage

export interface EliminationAnnouncedEvent {
  showId:              string
  eliminatedCoupleIds: string[]
}

export interface ShowEndedEvent {
  showId:  string
  winners: Array<{ coupleId: string; codename: string; rank: number; voteCount: number }>
}

// ── Ecosystem additions (drill-down / video / reactions) ──────

export interface DrilledCoupleDto {
  id:                string
  codename:          string
  coupleNumber:      number
  memberA:           string
  memberB:           string
  voteCount:         number
  eliminated:        boolean
  eliminatedInRound: number | null
  finalRank:         number | null
  videoActive:       boolean
  livekitRoomName:   string | null
}
export interface DrilledCoupleView {
  couple:   DrilledCoupleDto
  messages: PyaarMessage[]
}

export interface EliminatedThreadRow {
  couple: {
    id:                string
    codename:          string
    coupleNumber:      number
    memberA:           string
    memberB:           string
    voteCount:         number
    eliminatedInRound: number | null
    eliminatedAt:      string
  }
  messages: Array<{
    id:             string
    senderUsername: string
    roundNumber:    number
    content:        string
    createdAt:      string
  }>
}
export interface EliminatedThreadsResponse {
  count:      number
  eliminated: EliminatedThreadRow[]
}

export interface RecentReactionsResponse {
  count:     number
  reactions: Array<{ emoji: string; coupleId: string | null; createdAt: string }>
}

export interface CoupleSpectatorCountChangedEvent {
  coupleId:       string
  spectatorCount: number
}
export interface CoupleVideoStateChangedEvent {
  coupleId:        string
  videoActive:     boolean
  livekitRoomName: string | null
}
export interface ReactionFlashedEvent {
  emoji:     string
  coupleId:  string | null
  createdAt: string
}
