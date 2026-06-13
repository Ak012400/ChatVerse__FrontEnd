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
  category:      'public' | '18plus' | string
  iconEmoji:     string
  activeNow:     number
  totalMessages: number
  /** True if this is a user-created invite-only room. Drives the
   *  "My rooms" section in the sidebar. */
  isPrivate?:    boolean
}

/**
 * Server-detected Spotify embed. When the backend sees a Spotify URL in
 * the message body (open.spotify.com/… or spotify:track:…) it parses it
 * once and includes the ready-to-iframe `embedUrl` on the message so the
 * client never has to do its own URL parsing or HEAD requests.
 */
export interface SpotifyEmbedRef {
  kind:      'track' | 'album' | 'playlist' | 'episode' | 'show' | 'artist'
  spotifyId: string
  embedUrl:  string
  webUrl:    string
}

export interface Message {
  id:           string
  roomId:       string
  senderId:     string
  senderName:   string
  senderAvatar: string | null
  content:      string
  type:         'text' | 'image' | 'system' | 'gif' | 'ephemeral_image'
  mediaUrl:     string | null
  replyTo:      string | null
  reactions:    Record<string, string[]>
  modStatus:    'pending' | 'clean' | 'flagged' | 'blocked'
  /** Set when the message body contains a recognisable Spotify URL. */
  spotify?:     SpotifyEmbedRef | null
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