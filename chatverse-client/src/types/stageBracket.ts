// ============================================================
//  StageBracket types — DTOs mirroring StageBracketHub.cs.
//
//  Shared between Debate v2 + Roast frontends. The `mode` field
//  drives label / theme differences in each page.
// ============================================================

export type StageBracketMode = 'debate' | 'roast'
export type StageBracketPrivacy = 'public' | 'private'
export type StageBracketSide = 'left' | 'right'
export type StageBracketPreferredSide = 'left' | 'right' | 'either'
export type StageBracketRoundStatus = 'open_seats' | 'live' | 'ended'
export type StageBracketIntent = 'seat' | 'challenge'

export type StageBracketRoomMeta = {
  id: string
  title: string
  hostUserId: string
  hostUsername: string
  status: 'scheduled' | 'live' | 'ended'
}

export type StageBracketConfigDto = {
  mode: StageBracketMode
  privacy: StageBracketPrivacy
  /** Only present for the host. Audience clients see null. */
  inviteCode: string | null
  /** 60 / 90 / 120. */
  secondsPerTurn: number
  /** 3 / 5 / 10. */
  roundDurationMinutes: number
  /** 15..120. */
  challengeSlotSeconds: number
  hostTopic: string | null
}

export type StageBracketRoundDto = {
  id: string
  mode: StageBracketMode
  topic: string
  status: StageBracketRoundStatus
  activeSide: StageBracketSide
  activeSeatPosition: number
  startedAt: string | null
  endsAt: string | null
  currentTurnEndsAt: string | null
  endedAt: string | null
  challengerUserId: string | null
  challengerUsername: string | null
  challengerEndsAt: string | null
}

export type StageBracketSeatDto = {
  id: string
  side: StageBracketSide
  position: number
  occupantUserId: string | null
  occupantUsername: string | null
  secondsSpoken: number
}

export type StageBracketChatMessageDto = {
  id: string
  senderUserId: string
  senderUsername: string
  senderIsHost: boolean
  senderIsSeated: boolean
  content: string
  createdAt: string
}

export type StageBracketRoomState = {
  room: StageBracketRoomMeta
  isHost: boolean
  config: StageBracketConfigDto | null
  round: StageBracketRoundDto | null
  seats: StageBracketSeatDto[]
  pendingNominationCount: number
  messages: StageBracketChatMessageDto[]
}

/** PRIVILEGED — host only. */
export type StageBracketNominationPrivate = {
  id: string
  userId: string
  username: string
  intent: StageBracketIntent
  preferredSide: StageBracketPreferredSide
  note: string
  raisedAt: string
}

export type StageBracketLiveKitToken = {
  roomName: string
  serverUrl: string
  token: string
  canPublish: boolean
}

export type StageBracketKickedEvent = { roomId: string; reason: string | null }
export type StageBracketBannedEvent = { roomId: string; reason: string | null }
