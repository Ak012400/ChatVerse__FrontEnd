// ============================================================
//  Debate types — DTOs mirroring DebateHub.cs.
//
//  Audience-visible types ONLY include usernames. Monitor-privileged
//  types (DebateNominationPrivate) include real-name + age + gender —
//  the server only ever sends these on the monitor sub-channel.
// ============================================================

export type DebateFormat = '1v1' | '2v2' | '3v3' | '4v4' | '5v5'
export type DebateSide = 'pro' | 'con'
export type DebatePreferredSide = 'pro' | 'con' | 'either'
export type DebateRoundStatus = 'open_nominations' | 'seating' | 'live' | 'ended'

export type DebateRoomMeta = {
  id: string
  title: string
  hostUserId: string
  hostUsername: string
  status: 'scheduled' | 'live' | 'ended'
}

export type DebateRoundDto = {
  id: string
  format: DebateFormat
  status: DebateRoundStatus
  startedAt: string | null
  endsAt: string | null
  createdAt: string
  endedAt: string | null
  seatsPerSide: number
}

export type DebateSeatDto = {
  id: string
  side: DebateSide
  position: number
  occupantUserId: string | null
  occupantUsername: string | null
}

export type DebateChatMessageDto = {
  id: string
  senderUserId: string
  senderUsername: string
  senderIsMonitor: boolean
  senderIsSeated: boolean
  content: string
  isQuestion: boolean
  isHighlighted: boolean
  createdAt: string
}

export type DebateRoomState = {
  room: DebateRoomMeta
  /** True when I am the room's host/monitor. Server-computed. */
  isMonitor: boolean
  round: DebateRoundDto | null
  seats: DebateSeatDto[]
  /** Public-facing count only — bios stay monitor-private. */
  pendingNominationCount: number
  messages: DebateChatMessageDto[]
}

/** PRIVILEGED — only flows to the monitor via GetNominationsForMonitor
 *  return value AND NominationRaisedPrivate push event. Audience UI
 *  must never receive this shape from the wire. */
export type DebateNominationPrivate = {
  id: string
  userId: string
  username: string
  realName: string
  age: number
  gender: 'male' | 'female' | 'other' | ''
  preferredSide: DebatePreferredSide
  raisedAt: string
}

export type DebateUserHighlightedEvent = {
  targetUserId: string
  targetUsername: string
  messageId: string | null
  at: string
}

export type DebateNominationCountEvent = { count: number }
export type DebateKickedEvent = { roomId: string; reason: string | null }
export type DebateBannedEvent = { roomId: string; reason: string | null }
