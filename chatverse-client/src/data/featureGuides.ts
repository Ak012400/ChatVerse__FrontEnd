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
  icon?: 'info' | 'shield' | 'clock' | 'sparkles' | 'users' | 'reply' | 'eye' | 'rules' | 'vote'
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
    status:  'live',
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

  // ────────────────────────────────────────────────────────────
  // STORY CHAIN — daily collaborative writing
  // ────────────────────────────────────────────────────────────
  {
    slug:    'story-chain',
    title:   'Story Chain',
    tagline: 'A new prompt drops at 3pm IST. Each person adds one sentence. After 50 voices, the story locks and joins the archive.',
    icon:    'feather',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every day at 3pm IST, a fresh opening line lands. You take a turn, write a single sentence that picks the story up where the last person left it, and pass the pen. ' +
          'After 50 voices the chain seals and gets published forever in the archive. If midnight IST comes first, whatever\'s there at that moment seals — partial stories ship too.',
      },
      {
        heading: 'How taking a turn works',
        icon:    'clock',
        body: [
          'Open the page and tap "Join the queue".',
          'You get a position number. When you reach the front, the system gives you 10 minutes to write your sentence.',
          'If you don\'t submit in 10 minutes, your turn passes to the next person automatically. You can rejoin the queue.',
          'Once you\'ve added your sentence, you\'re done for THIS chain. Come back tomorrow for a fresh one.',
        ],
      },
      {
        heading: 'The sentence',
        icon:    'sparkles',
        body: [
          'One sentence, up to 280 characters — about a tweet\'s worth.',
          'Pick up the last sentence\'s thread. Don\'t reset the scene from scratch.',
          'Use the author\'s name nobody else has used? Fine. Kill a character somebody introduced two sentences ago? Also fine. The story\'s alive.',
          'AI moderation runs on every sentence before it commits. Slurs, harassment, off-platform contact info all get rejected.',
        ],
      },
      {
        heading: 'The archive',
        icon:    'rules',
        body: [
          'Sealed stories sit in the Archive tab forever, ordered newest first.',
          'Every contributor\'s username is shown next to their line — it\'s a public record of the writing, not anonymous.',
          'Top stories may be highlighted on the home screen as featured reads. (Coming.)',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'One sentence per user per chain. Multiple accounts trying to game this get trust-score docked.',
          'No metafictional escape hatches ("…and then they all turned out to be in a simulation"). Take the story somewhere.',
          'Reports route through the same moderation queue as DMs.',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // CONFESSION BOX — anonymous daily confessions + reveal mechanic
  // ────────────────────────────────────────────────────────────
  {
    slug:    'confession-box',
    title:   'Confession Box',
    tagline: 'Say it anonymously. If your confession lands at the top, you choose: step into the light, or become a Ghost Voice forever.',
    icon:    'message-circle',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every day is a fresh anonymous wall. You write something you couldn\'t say out loud — the kind of thing that has to be said but doesn\'t have your name on it — and it joins the feed. ' +
          'Other voyagers react with one of six emojis. At midnight UTC the most-reacted confession of the day gets crowned. The author of that confession gets a private offer: reveal yourself for a public banner, or claim a permanent Ghost Voice badge.',
      },
      {
        heading: 'Reactions — six emojis, one per voyager',
        icon:    'sparkles',
        body: [
          'Six emojis: 🔥 (relatable hit), 😭 (felt this), 🫂 (sending love), 💀 (dark relatable humour), 👀 (saw something), 🙏 (solidarity).',
          'One reaction per confession per voyager. Picking a different emoji silently swaps your previous one.',
          'You can\'t react to your own confession — it would skew rankings.',
          'Counts are live: when someone reacts, the card updates without a refresh.',
        ],
      },
      {
        heading: 'The crowning + reveal offer',
        icon:    'eye',
        body: [
          'Daily at 00:00 UTC the ranking service picks the confession with the most distinct reactors. Ties break by who posted first.',
          'A push notification + in-app modal lands on the author\'s next visit: "You wrote yesterday\'s top confession. Reveal yourself, or claim Ghost Voice?"',
          '**Reveal yourself**: your username appears on the confession, public to everyone forever. A featured-author banner goes on your profile.',
          '**Stay a ghost**: a permanent "Ghost Voice" badge goes on your profile. Other users see you as the kind of person who could\'ve been famous and chose silence.',
          'The choice is per-confession. Future confessions are still anonymous.',
        ],
      },
      {
        heading: 'Lore Wall — the archive',
        icon:    'rules',
        body: [
          'The Lore Wall holds the top 5 confessions of each past week. Browseable week-by-week.',
          'Confessions normally auto-delete after 30 days; top-ranked ones stay on the Lore Wall forever (revealed or not).',
        ],
      },
      {
        heading: 'Privacy guarantees',
        icon:    'shield',
        body: [
          'Author identity is server-only. The client API NEVER returns your real user id alongside a confession DTO.',
          'The only identity bit returned is a "mine" boolean — so you can find your own card in the feed without other users learning whose is whose.',
          'AI text moderation runs on every confession before it joins the feed. Slurs, harassment, off-platform contact info, suicidal ideation triggers — all caught.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'No outing real people — including by hint. ("My boss with the red car at <street>" = removed.)',
          'Mental-health crisis disclosures get auto-routed to in-app helpline info, then the confession itself stays anonymous in the feed.',
          'Multiple-account vote-stacking dings trust score for both accounts.',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // GHOST DATE — weekly Thursday 9pm IST anonymous text date
  // ────────────────────────────────────────────────────────────
  {
    slug:    'ghost-date',
    title:   'Ghost Date',
    tagline: 'Thursdays at 9pm IST. 30 minutes of anonymous chat with one stranger. Then you both choose: step into the light, or vanish.',
    icon:    'heart',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every Thursday night at 9pm IST, anyone who opted in gets paired with a stranger. ' +
          '30 minutes of anonymous text — neither side sees the other\'s name, avatar, age, anything. ' +
          'When the timer hits zero, you each independently choose: would you want to know this person? ' +
          'Both say yes → identities reveal, conversation continues as DMs. ' +
          'One yes + one pass → a bittersweet ending, no reveal either way. ' +
          'Both pass → a "ghost pair" memory is stored. Months from now, if you both opt in again, the system may pair you a second time.',
      },
      {
        heading: 'How to opt in',
        icon:    'clock',
        body: [
          'Tap "I\'m in" any time during the week leading up to Thursday.',
          'You can withdraw any time before 9pm IST Thursday — after pairing it\'s locked.',
          'If the pool is odd, one person gets the "no match" status that week (you can come back next Thursday).',
        ],
      },
      {
        heading: 'During the 30 minutes',
        icon:    'sparkles',
        body: [
          'You see the other side as "Voyager". No avatar, no profile link.',
          'A live countdown ticks at the top of the chat.',
          '1000-character cap per message — keep it conversational, not essays.',
          'AI text moderation runs on every line. Slurs, harassment, off-platform contact info all get rejected.',
        ],
      },
      {
        heading: 'After 30 minutes — the choice',
        icon:    'eye',
        body: [
          'Chat window closes. You both get 5 minutes to choose: Reveal or Pass.',
          'You can\'t change your mind once submitted.',
          'If either side misses the 5-min window, the outcome is "expired" — no reveal.',
          'Decisions are private until both are in. Neither side learns what the other chose unless it\'s a mutual reveal.',
        ],
      },
      {
        heading: 'The re-pair memory',
        icon:    'shield',
        body: [
          'If you both passed, the system stores the pair with a 60-day cooldown.',
          'After 60 days, if you both opt in for some future Thursday, the matching algorithm preferentially pairs you again. (Coming — basic registration today is fully random.)',
          'No one knows this is happening to them; it just feels like luck.',
        ],
      },
      {
        heading: 'Privacy guarantees',
        icon:    'shield',
        body: [
          'Real user IDs never leave the server during a live date or pre-decision phase.',
          'Bittersweet endings: neither side learns who the other was — even if one of them was you.',
          'Past dates show up in your history rail as "Voyager" forever, unless they were mutual reveals.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'Don\'t ask for or share contact info during the 30 minutes — wait for mutual reveal.',
          'No sexual escalation in the first 5 minutes. Slow weather, not a sprint.',
          'Reports route through the same moderation queue as DMs. Repeat offenders get banned from Ghost Date.',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // LOVE TRIANGLE — weekly Sunday 10pm IST 3-person drama
  // ────────────────────────────────────────────────────────────
  {
    slug:    'love-triangle',
    title:   'Love Triangle',
    tagline: 'Three strangers. Three pair-chats. One winning duo. Sundays at 10pm IST. The audience watches anonymous excerpts and votes.',
    icon:    'heart',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every Sunday at 10pm IST, anyone who opted in gets placed into a triangle with two other voyagers. ' +
          'For the next 7 days, the three of you DM each other in PAIRS — three separate threads, one per pair (A↔B, B↔C, A↔C). ' +
          'Either side of a pair can choose to "share" any message as an anonymous excerpt on the public Triangle feed where the wider audience watches the drama unfold. ' +
          'On day 7, chat closes. The audience has 24 hours to vote: which pair has the best chemistry? The winning pair takes the crown.',
      },
      {
        heading: 'Inside your triangle',
        icon:    'users',
        body: [
          'You see all three members by their real usernames — this isn\'t anonymous between you.',
          'You can only message in the TWO pairs that include you. The third pair (the other two members) is hidden from you — that\'s part of the drama.',
          '1000-character cap per message.',
          'Either side of a pair can tap "share" on a message to publish it as an anonymous excerpt. The author can untoggle if they regret it; the sharer can also untoggle their own share.',
        ],
      },
      {
        heading: 'The public excerpts',
        icon:    'eye',
        body: [
          'Shared excerpts surface on the audience feed labelled as "Member A / B / C" — never your real names.',
          'The pair-key (A↔B, B↔C, A↔C) is shown so the audience can track each storyline.',
          'You CAN unshare — but the audience may have already seen it.',
        ],
      },
      {
        heading: 'Voting + winning',
        icon:    'sparkles',
        body: [
          'On day 7 the chat phase closes. The audience has 24 hours to vote for one of the three pairs.',
          'Triangle members can\'t vote on their own triangle.',
          'One vote per spectator. Switching pairs silently retracts the previous vote.',
          'Highest-vote pair wins. Ties resolve as "tie" (no winner declared).',
        ],
      },
      {
        heading: 'Privacy guarantees',
        icon:    'shield',
        body: [
          'Public excerpts NEVER carry real usernames — only "Member A/B/C".',
          'Voter identities are stored server-side but never surfaced; only counts are public.',
          'After the triangle wraps, it stays in the archive forever; member usernames remain visible only to the three members themselves.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'Don\'t share off-platform contact info inside the pair-chats — keep it on ChatVerse.',
          'Don\'t share excerpts of someone else\'s message TO embarrass them — share-to-impress, not share-to-shame.',
          'Reports route through the moderation queue. Trust-score penalties apply.',
        ],
      },
    ],
  },
]
