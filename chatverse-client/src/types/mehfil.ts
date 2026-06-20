// ============================================================
//  MEHFIL — client types
// ============================================================

export type MehfilStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'

export type MehfilTemplate =
  | 'dating_show' | 'open_mic' | 'debate' | 'watch_party' | 'game_night'
  | 'podcast' | 'story_circle' | 'trivia' | 'talent_show' | 'networking' | 'custom'

export interface MehfilRoomCard {
  id:                  string
  title:               string
  description:         string
  templateKind:        MehfilTemplate
  hostUsername:        string
  scheduledFor:        string
  startedAt:           string | null
  endedAt:             string | null
  status:              MehfilStatus
  maxAudience:         number
  currentAudienceCount: number
  totalAttendeesCount: number
  totalTipsTokens:     number
}

export interface MehfilMessage {
  id:             string
  senderUsername: string
  isHost:         boolean
  mine:           boolean
  content:        string
  createdAt:      string
}

export interface MehfilTip {
  senderUsername: string
  giftType:       string
  tokenAmount:    number
  createdAt:      string
}

export interface MehfilAttendee { username: string }

export interface DiscoverResponse {
  count:     number
  templates: MehfilTemplate[]
  gifts:     Record<string, number>
  rooms:     MehfilRoomCard[]
}

export interface RoomDetailResponse {
  room:      MehfilRoomCard
  iAmHost:   boolean
  iAmInside: boolean
  attendees: MehfilAttendee[]
  messages:  MehfilMessage[]
  tips:      MehfilTip[]
}

export interface RoomMessageEvent extends MehfilMessage { roomId?: string }
export interface RoomAudienceEvent { roomId: string; currentAudienceCount: number }
export interface RoomTipEvent {
  roomId:          string
  senderUsername:  string
  giftType:        string
  tokenAmount:     number
  totalTipsTokens: number
}
