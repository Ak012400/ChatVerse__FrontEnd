// ============================================================
//  featureGuides.ts — single source of truth for the in-app
//  "How it works" pages at /about.
//
//  Adding a new feature?  Append one entry to FEATURE_GUIDES.
//  Each section's `body` accepts plain text or a string[] (renders
//  as a bullet list). Keep tone friendly + concrete — these are
//  user-facing rules, not spec docs.
//
//  The `slug` becomes a URL fragment (`/about#time-capsule`) and
//  must be unique. `status` ("live" / "soon") drives a badge.
// ============================================================

export type GuideStatus = 'live' | 'soon'

export interface GuideSection {
  /** Short heading shown in the page TOC + section header. */
  heading: string
  /** Lucide icon name as a render hint. Keep it optional — the
   *  page resolves a default if not provided. */
  icon?: 'info' | 'shield' | 'clock' | 'sparkles' | 'users' | 'reply' | 'eye' | 'rules'
  /** A paragraph (string) OR an unordered list (string[]). */
  body: string | string[]
}

export interface FeatureGuide {
  /** Stable URL-safe identifier (also the `#hash` anchor). */
  slug:     string
  /** Short human title. */
  title:    string
  /** One-line elevator pitch shown under the title. */
  tagline:  string
  /** Lucide icon name for the feature tile. */
  icon:     'hourglass' | 'masks' | 'feather' | 'sparkles' | 'heart' | 'message-circle' | 'ghost' | 'cipher' | 'mic' | 'theater'
  status:   GuideStatus
  /** Ordered list of explanation sections. */
  sections: GuideSection[]
}

export const FEATURE_GUIDES: FeatureGuide[] = [
  // ────────────────────────────────────────────────────────────
  // TIME CAPSULE — first sticky feature
  // ────────────────────────────────────────────────────────────
  {
    slug:    'time-capsule',
    title:   'Time Capsule',
    tagline: 'Write a note now. A stranger reads it weeks later. They get one reply.',
    icon:    'hourglass',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Time Capsule is a slow conversation between strangers. You write today; ' +
          'the system delivers your note to a randomly chosen recipient in 7, 14 or 30 days. ' +
          'They can write back exactly once, and that reply reaches you three days later. ' +
          'Nothing else, ever — no thread, no follow-up, no DM. The whole point is that ' +
          'each capsule is a moment, not a relationship.',
      },
      {
        heading: 'How writing works',
        icon:    'clock',
        body: [
          'Capsules are up to 2,000 characters of text.',
          'You pick the delivery window: 7, 14 or 30 days from now.',
          'A small random jitter (0–24 hours) is added so capsules don\'t all land at the same second.',
          'You can sign your capsule (recipient sees your username) or send it anonymously (recipient sees "Anonymous voyager"). Anonymity is the default.',
          'Once you tap Seal, the capsule is locked. You can\'t edit, retract or re-route it.',
        ],
      },
      {
        heading: 'How receiving works',
        icon:    'reply',
        body: [
          'The system picks a random active registered user as the recipient at delivery time — never at write time. That keeps the pool fresh.',
          'You\'re never picked as the recipient for one of your own capsules.',
          'Guest accounts can\'t send or receive capsules — their 24h expiry would orphan undelivered ones.',
          'Each delivered capsule shows up in your Inbox tab and you get a toast notification, even if you\'re on another page.',
        ],
      },
      {
        heading: 'Replies — one shot only',
        icon:    'reply',
        body: [
          'You can reply to a delivered capsule exactly once, up to 1,000 characters.',
          'Replies take three days to reach the author — patience is part of the design.',
          'After you reply, the reply button disappears. There is no second chance.',
          'If the original capsule was signed, your reply can be traced back to the author. If it was anonymous, neither side ever learns who the other is.',
        ],
      },
      {
        heading: 'Privacy guarantees',
        icon:    'shield',
        body: [
          'Recipients never see your user ID — only your username, and only if you opted to sign.',
          'Authors never learn who received their capsule. Not the username, not the ID, nothing.',
          'AI moderation scans every capsule and reply before delivery to filter abusive content.',
          'Capsules auto-delete 90 days after delivery via the maintenance webjob.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'No personal contact info (phone, email, social handles) — capsules are for the moment, not for moving people off-platform.',
          'No targeted harassment. Capsules are random — if your message can only make sense aimed at one person, it doesn\'t belong here.',
          'Reports route through the same moderation queue as DMs. Trust-score penalties apply.',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // PERSONA ROULETTE — daily identity rotation (next sticky feature)
  // ────────────────────────────────────────────────────────────
  {
    slug:    'persona-roulette',
    title:   'Persona Roulette',
    tagline: 'Every midnight UTC you become someone new. 24 hours of being a stranger to everyone — including the people you talk to most.',
    icon:    'masks',
    status:  'soon',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'At 00:00 UTC each day the system rolls a brand-new persona for you — a randomly-generated name, avatar, bio and mood. ' +
          'For the next 24 hours, every conversation you start as your persona looks (to the other side) like a fresh stranger. ' +
          'The day rolls over, the persona evaporates, and tomorrow you\'re someone else again.',
      },
      {
        heading: 'The streak — the twist',
        icon:    'sparkles',
        body: [
          'The system silently tracks which two REAL users have been chatting (regardless of their changing personas).',
          'After 3 consecutive days of conversation, both of you see a small marker: "You\'ve crossed paths before."',
          'After 7 consecutive days, a "Mutual Unmask" offer becomes available — if you both opt in, you reveal your real identities to each other.',
          'After 30 consecutive days, the conversation gets archived to a private "Memory Vault" only the two of you can see.',
        ],
      },
      {
        heading: 'Privacy guarantees',
        icon:    'shield',
        body: [
          'Persona ↔ real-user mapping never leaves the server. Other users can never see who you really are unless YOU unmask.',
          'Personas auto-expire and are scrubbed from Mongo after the day rolls over.',
          'Streak data uses your real user ID server-side but only surfaces as a "you\'ve crossed paths" hint client-side.',
          'You can opt out of Persona Roulette entirely from Settings (planned).',
        ],
      },
      {
        heading: 'House rules (preview)',
        icon:    'rules',
        body: [
          'Personas aren\'t for impersonating real people, brands, or other ChatVerse users.',
          'AI moderation applies to persona-DMs the same as everything else — no harassment.',
          'Mutual Unmask is irrevocable. Make sure you\'re ready before tapping accept.',
        ],
      },
    ],
  },
]
