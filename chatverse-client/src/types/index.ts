// ── Auth ──────────────────────────────────────────────────────
export interface User {
  userId:          string
  username:        string
  isGuest:         boolean
  trustScore:      number
  isEmailVerified: boolean
  ageVerified:     boolean
}

// ── Chat ──────────────────────────────────────────────────────
export interface Room {
  slug:          string
  displayName:   string
  description:   string
  category:      'public' | '18plus'
  iconEmoji:     string
  activeNow:     number
  totalMessages: number
}

export interface Message {
  id:           string
  roomId:       string
  senderId:     string
  senderName:   string
  senderAvatar: string | null
  content:      string
  type:         'text' | 'image' | 'system' | 'gif'
  mediaUrl:     string | null
  replyTo:      string | null
  reactions:    Record<string, string[]>
  modStatus:    'pending' | 'clean' | 'flagged' | 'blocked'
  editedAt:     string | null
  createdAt:    string
}

// ── Trust ─────────────────────────────────────────────────────
export interface TrustScore {
  score:     number
  band:      'new' | 'restricted' | 'normal' | 'trusted' | 'elite'
  bandLabel: string
}

export interface TrustEvent {
  id:        string
  eventType: string
  delta:     number
  reason:    string | null
  refSource: string | null
  createdAt: string
}

// ── Video ─────────────────────────────────────────────────────
export type VideoStatus =
  | 'idle'
  | 'queuing'
  | 'matched'
  | 'connecting'
  | 'connected'
  | 'ended'

export interface VideoParticipant {
  userId:      string
  username:    string
  trustScore:  number
  ageVerified: boolean
}

// ── API response envelope ─────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean
  data:    T | null
  error:   string | null
  message: string | null
}