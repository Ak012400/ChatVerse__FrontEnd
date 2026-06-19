// ============================================================
//  Time Capsule — client-side type contracts
//
//  Mirrors the server-side DTO shapes from TimeCapsuleHub.cs +
//  TimeCapsuleDeliveryService.cs. Keep this file in lockstep with
//  those — the hub returns anonymous-typed `object`, so TypeScript
//  is the only place these shapes are checked.
//
//  Privacy contract reminder (also enforced server-side):
//    • Inbox view NEVER carries AuthorUserId — only `authorName`
//      (null if the author opted not to reveal).
//    • Sent view NEVER carries RecipientUserId or RecipientUsername.
//      The author has no way to learn who received their capsule.
// ============================================================

/** Allowed delivery windows — must mirror Hub.AllowedDeliveryDays. */
export type DeliveryWindow = 7 | 14 | 30

/** Server-side capsule kinds. Frontend currently only ships `text`;
 *  image / audio reserved for future media-upload flows. */
export type CapsuleType = 'text' | 'image' | 'audio'

/** Card shape returned by Hub.GetMyInbox() and pushed via
 *  the "TimeCapsuleDelivered" event. */
export interface InboxCapsule {
  id:           string
  content:      string
  type:         CapsuleType
  mediaUrl:     string | null
  deliveryDays: DeliveryWindow
  /** null when author posted anonymously. */
  authorName:   string | null
  deliveredAt:  string                  // ISO timestamp
  canReply:     boolean                 // false once recipient has replied
  repliedAt:    string | null
}

/** Card shape returned by Hub.GetMySent(). */
export interface SentCapsule {
  id:               string
  content:          string
  type:             CapsuleType
  deliveryDays:     DeliveryWindow
  scheduledFor:     string              // ISO — when the system plans to deliver
  deliveredAt:      string | null       // ISO — set once delivered to a recipient
  gotReply:         boolean
  /** Only populated once the reply's 3-day window elapses and it lands. */
  replyContent:     string | null
  replyDeliveredAt: string | null
}

// ── Server-push event payloads ────────────────────────────────

/** "TimeCapsuleDelivered" — fired on the recipient's connections
 *  when the delivery service hands them a fresh capsule. */
export interface TimeCapsuleDeliveredEvent {
  id:           string
  content:      string
  type:         CapsuleType
  mediaUrl:     string | null
  deliveryDays: DeliveryWindow
  authorName:   string | null
  deliveredAt:  string
}

/** "TimeCapsuleReplyDelivered" — fired on the original author's
 *  connections 3 days after the recipient replied. */
export interface TimeCapsuleReplyDeliveredEvent {
  capsuleId:        string
  originalContent:  string
  replyContent:     string
  replyDeliveredAt: string
}

// ── Compose-form payload ──────────────────────────────────────

/** Local-only shape — what the Compose tab submits to the hub. */
export interface ComposeCapsuleInput {
  content:      string
  type:         CapsuleType
  mediaUrl:     string | null
  deliveryDays: DeliveryWindow
  revealAuthor: boolean
}
