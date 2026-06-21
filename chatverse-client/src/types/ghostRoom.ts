// ============================================================
//  Ghost Room types — DTOs mirroring GhostRoomHub.cs.
//
//  Standalone per the per-feature isolation policy. NOT to be
//  confused with the legacy ghost_date types under /types/ghostDate.ts
//  which serve the weekly Thursday auto-pair feature.
// ============================================================

export type GhostPrivacy = 'public' | 'private'
export type GhostInterest = 'male' | 'female' | 'other' | 'any'
export type GhostGender = 'male' | 'female' | 'other' | ''
export type GhostVoyagerStatus = 'lobby' | 'nominated' | 'paired' | 'done'

export type GhostRoomMeta = {
  id: string
  title: string
  hostUserId: string
  hostUsername: string
  status: 'scheduled' | 'live' | 'ended'
}

export type GhostRoomConfig = {
  privacy: GhostPrivacy
  /** Only present for the matchmaker. Audience clients see null. */
  inviteCode: string | null
  maxVoyagers: number      // 4 / 6 / 8 / 10 / 12
  roundDurationMinutes: number  // 5 / 10 / 15 / 20
}

export type GhostMe = {
  voyagerTag: string
  status: GhostVoyagerStatus
}

export type GhostVoyagerPublic = {
  voyagerTag: string
  status: GhostVoyagerStatus
  joinedAt: string
}

export type GhostPairDto = {
  id: string
  roundNumber: number
  voyagerATag: string
  voyagerBTag: string
  startedAt: string | null
  endedAt: string | null
  outcome: GhostOutcome | null
}

export type GhostPairMessageDto = {
  id: string
  pairId: string
  senderVoyagerTag: string
  content: string
  createdAt: string
}

export type GhostOutcome = 'mutual_reveal' | 'bittersweet' | 'mutual_pass' | 'abandoned'

export type GhostRoomState = {
  room: GhostRoomMeta
  config: GhostRoomConfig
  isMatchmaker: boolean
  me: GhostMe
  voyagers: GhostVoyagerPublic[]
  pendingNominationCount: number
  activePair: GhostPairDto | null
  pairMessages: GhostPairMessageDto[]
}

/** PRIVILEGED — matchmaker only. */
export type GhostNominationPrivate = {
  id: string
  userId: string
  voyagerTag: string
  realName: string
  age: number
  gender: GhostGender
  interestedIn: GhostInterest
  shortBio: string
  raisedAt: string
}

export type GhostPairAssignedEvent = GhostPairDto
export type GhostPairOutcomeEvent = {
  pairId: string
  outcome: GhostOutcome
  endedAt: string
}
export type GhostPairCreatedPublicEvent = {
  pairId: string
  voyagerATag: string
  voyagerBTag: string
  roundNumber: number
}
export type GhostNominationCountEvent = { count: number }
export type GhostKickedEvent = { roomId: string; reason: string | null }
export type GhostBannedEvent = { roomId: string; reason: string | null }
export type GhostVoyagerHighlightedEvent = { targetVoyagerTag: string; at: string }
export type GhostLiveKitToken = {
  roomName: string
  serverUrl: string
  token: string
  voyagerTag: string
}
