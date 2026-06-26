// ============================================================
//  Open Mic types — DTOs mirroring OpenMicHub.cs.
//
//  Standalone per the per-feature isolation policy.
// ============================================================

export type OpenMicPrivacy = 'public' | 'private'
export type OpenMicGender = 'male' | 'female' | 'other' | ''

export type OpenMicRoomMeta = {
  id: string
  title: string
  hostUserId: string
  hostUsername: string
  status: 'scheduled' | 'live' | 'ended'
}

export type OpenMicConfigDto = {
  privacy: OpenMicPrivacy
  /** Only present for MC. Audience sees null. */
  inviteCode: string | null
  /** 60 / 180 / 300. */
  slotDurationSeconds: number
}

export type OpenMicSetDto = {
  id: string
  status: 'waiting' | 'live' | 'ended'
  createdAt: string
  endedAt: string | null
}

export type OpenMicSlotDto = {
  id: string
  performerUserId: string
  performerUsername: string
  performanceTitle: string
  startedAt: string
  endsAt: string | null
  applauseCount: number
  isHighlighted: boolean
}

export type OpenMicHistorySlotDto = {
  id: string
  performerUsername: string
  performanceTitle: string
  startedAt: string
  endedAt: string | null
  applauseCount: number
  isHighlighted: boolean
}

export type OpenMicRoomState = {
  room: OpenMicRoomMeta
  isMc: boolean
  config: OpenMicConfigDto
  set: OpenMicSetDto | null
  activeSlot: OpenMicSlotDto | null
  pendingQueueCount: number
  recentSlots: OpenMicHistorySlotDto[]
}

/** PRIVILEGED — MC only. */
export type OpenMicQueueEntryPrivate = {
  id: string
  userId: string
  username: string
  realName: string
  age: number
  gender: OpenMicGender
  performanceTitle: string
  position: number
  raisedAt: string
}

export type OpenMicLiveKitToken = {
  roomName: string
  serverUrl: string
  token: string
  canPublish: boolean
}

export type OpenMicReactionEvent = { emoji: string; slotId: string; at: string }
export type OpenMicQueueCountEvent = { count: number }
export type OpenMicHighlightEvent = { slotId: string; performerUserId: string; at: string }
export type OpenMicKickedEvent = { roomId: string; reason: string | null }
export type OpenMicBannedEvent = { roomId: string; reason: string | null }

export const OPEN_MIC_REACTIONS: string[] = ['👏', '🔥', '😭', '😂', '🎤', '💯', '🫡', '💀']
