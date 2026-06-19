// ============================================================
//  Persona Roulette — client type contracts
//
//  Mirrors the DTOs emitted by PersonaHub.cs. Keep field names
//  in lockstep with the server's anonymous DTO shapes.
//
//  Privacy reminder (also enforced server-side):
//    • Client never sees a real user id. Persona ids identify
//      conversation parties; the server resolves them.
// ============================================================

/** Today's persona — your own or another voyager's discover result. */
export interface PersonaCard {
  id:          string
  displayName: string
  avatarSeed:  string
  bio:         string
  mood:        string         // 'playful' | 'wistful' | ... — drives UI accent
  date:        string         // YYYY-MM-DD UTC
  expiresAt:   string         // ISO timestamp
}

/** One row in GetActiveStreaks() — what the client sees about a streak. */
export interface StreakRow {
  streakId:           string
  otherPersonaId:     string | null   // null when the other side hasn't rolled today
  consecutiveDays:    number
  lastDay:            string          // YYYY-MM-DD
  unmasked:           boolean
  vaulted:            boolean
  otherDisplay:       string
  otherAvatarSeed:    string | null
  otherMood:          string | null
  canUnmask:          boolean         // server says: ≥7 days AND not already unmasked
  hasMarker:          boolean         // ≥3 days — "you've crossed paths" hint
  myUnmaskRequested:  boolean         // I've already tapped Request on this streak
}

/** Single message in a persona-to-persona thread. */
export interface PersonaMessage {
  id:                string
  senderPersonaId:   string
  senderDisplayName: string
  senderAvatarSeed:  string
  content:           string
  createdAt:         string           // ISO
}

// ── Server-push event payloads ────────────────────────────────

export interface PersonaMessageReceivedEvent extends PersonaMessage {}

export interface StreakUnmaskedEvent {
  streakId: string
}
