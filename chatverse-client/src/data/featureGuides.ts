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
  icon:     'hourglass' | 'masks' | 'feather' | 'sparkles' | 'heart' | 'message-circle' | 'ghost' | 'cipher' | 'mic' | 'theater' | 'pyaar-live'
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

  // ────────────────────────────────────────────────────────────
  // THE CIPHER — weekly community ARG
  // ────────────────────────────────────────────────────────────
  {
    slug:    'the-cipher',
    title:   'The Cipher',
    tagline: 'Every Monday, a hidden phrase is split into single-word fragments and slipped to a handful of Cipher Members. The rest of you have one week to find them, name them, and reconstruct the line.',
    icon:    'cipher',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every Monday at 9am IST, the system picks a curated poetic phrase and splits it into single words. ' +
          'A handful of users get one word each — they\'re Cipher Members for that week. Their job: weave their secret word into conversations naturally, without giving themselves away. ' +
          'Everyone else is a Hunter. Hunters have until Sunday 11pm IST to (a) name the Members and (b) submit the full phrase. Hunters with ≥ 50% accuracy win a share of the prize pool (tokens land in Phase 5; for now it\'s leaderboard glory).',
      },
      {
        heading: 'If you\'re a Member',
        icon:    'sparkles',
        body: [
          'You\'ll get a private push notification when you\'re picked.',
          'Your Cipher page shows ONE word. That\'s your fragment for the week.',
          'Weave it into chats over the week — three different conversations is a good baseline.',
          'Don\'t announce it, don\'t paste it verbatim into Confessions or Persona DMs as a stunt — the point is for Hunters to NOTICE you using it organically.',
          'After the round closes, your Member status is public on the archive (revealed or not).',
        ],
      },
      {
        heading: 'If you\'re a Hunter',
        icon:    'eye',
        body: [
          'You can submit your guess any time before Sunday 11pm IST.',
          'Last write wins — resubmit as often as you like as you discover new clues.',
          'A submission has two parts: the phrase guess + the list of suspected Member user-ids.',
          'Accuracy = (phrase similarity × 0.6) + (member-id recall × 0.4). 50% or higher wins.',
        ],
      },
      {
        heading: 'After the round',
        icon:    'rules',
        body: [
          'Sunday 11pm IST the round closes. The canonical phrase is revealed publicly.',
          'Every Member\'s identity surfaces on the archive page — there\'s no opt-out for the round you played.',
          'Winning Hunters appear on the leaderboard with their accuracy score.',
          'Token prizes go live in Phase 5; until then it\'s leaderboard + Decoder badge for ≥50% scorers.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'Members: don\'t collude with other Members to spell out the phrase together — defeats the puzzle.',
          'Hunters: vote-stacking via alts gets the alts banned and dings your trust score.',
          'No naming-and-shaming Hunters who guessed wrong — the chase is the point.',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // PYAAR LIVE — Phase 3 flagship Saturday mass dating show
  // ────────────────────────────────────────────────────────────
  {
    slug:    'pyaar-live',
    title:   'PYAAR LIVE',
    tagline: 'Saturdays at 8pm IST. Ten random couples, four rounds, mid-show elimination, audience crowns the top three. The flagship spectacle.',
    icon:    'theater',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Every Saturday at 8pm IST the system picks 20 voyagers who opted in that week and pairs them into 10 random couples — "Couple 1" through "Couple 10". ' +
          'Each couple gets a private chat thread. Everyone else watches as the spectator audience, sees all 10 couples\' threads in a live grid, and votes for the one they\'re rooting for. ' +
          'The show runs for 2 hours across 4 rounds with one brutal mid-show elimination — bottom 3 by votes get kicked after Round 2. Top 3 by final votes share the crown.',
      },
      {
        heading: 'The four rounds',
        icon:    'clock',
        body: [
          'Round 1 · **Icebreaker** (30 min) — get to know each other.',
          'Round 2 · **Free chat** (45 min) — go anywhere with it.',
          '⚡ ELIMINATION — bottom 3 couples by spectator votes are out.',
          'Round 3 · **Deeper questions** (30 min) — the surviving 7 go further.',
          'Round 4 · **Final pitch** (15 min) — sell yourselves to the audience.',
          '🏆 The top 3 couples by final vote count are crowned.',
        ],
      },
      {
        heading: 'How to opt in',
        icon:    'sparkles',
        body: [
          'Tap "I\'m in" any time during the week leading up to Saturday.',
          'Withdraw allowed any time before 8pm IST Saturday — after pairing, you\'re locked in.',
          'If the pool exceeds 20 people, 20 are randomly picked and the rest sit it out (try again next week).',
          'If the pool is under 20 but at least 2 people opted in, the show still runs with however many couples can form.',
        ],
      },
      {
        heading: 'Inside a couple chat',
        icon:    'users',
        body: [
          'You and your partner see each other\'s real usernames from message one — PYAAR LIVE is reveal-first, not anonymous.',
          'Your thread is private to the two of you DURING the round — but spectators can read EVERYONE\'S threads in real time as part of the show format. Treat every line as on-air.',
          '1000-character cap per message.',
          'AI moderation applies to every message as it does in regular chat.',
        ],
      },
      {
        heading: 'For spectators',
        icon:    'eye',
        body: [
          'You see a grid of 10 couple cards — each with last 5-6 messages, usernames, and a vote button.',
          'One vote per spectator per show. Switching couples silently retracts the previous vote.',
          'You can NOT vote on a couple if you\'re a participant in the show.',
          'Voting matters BEFORE Round 2 ends (drives elimination) AND through Round 4 (drives final ranking).',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'Don\'t share off-platform contact info in your couple thread — it\'s live to the audience.',
          'Vote-stacking via alts dings the trust score of every involved account.',
          'No targeted harassment of eliminated couples in DMs after the show. The chase is the chase.',
        ],
      },
      {
        heading: 'Coming in v2',
        icon:    'info',
        body: [
          'Multi-region: USA (8pm EST), Europe (8pm CET), APAC (8pm SGT). Cross-region viewing via live caption translation (we already have the caption + translation pipeline from regular chat).',
          'Prize pool wiring once token economy ships (Phase 5).',
          'Spectator Q&A round (Round 3 currently runs as "Deeper questions" auto-prompts — v2 lets audience submit questions live).',
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────
  // MEHFIL — Phase 4 creator-room platform
  // ────────────────────────────────────────────────────────────
  {
    slug:    'mehfil',
    title:   'Mehfil',
    tagline: 'Host your own room. Eleven templates from open mic to dating show to debate to watch party. Audience tips with virtual gifts.',
    icon:    'mic',
    status:  'live',
    sections: [
      {
        heading: 'The promise',
        icon:    'info',
        body:
          'Mehfil is your stage. Pick a template (Open Mic, Dating Show, Debate, Watch Party, Game Night, Podcast, Story Circle, Trivia, Talent Show, Networking, or Custom), schedule it, and invite the world. ' +
          'When you go live, audience joins, chats, and tips you with virtual gifts. ' +
          'MVP scope: anyone registered can host. Host verification (ID + ₹100 deposit), revenue share, and payout settlement all ship with Phase 5 (token economy).',
      },
      {
        heading: 'Hosting a Mehfil',
        icon:    'mic',
        body: [
          'Tap "Host a Mehfil" → pick a template, give it a title + description, schedule a start time, set the audience cap (2-5000).',
          'You can cancel any room that hasn\'t started yet.',
          'When you\'re ready, tap "Start now" — the room flips to LIVE and the audience can join.',
          'Tap "End Mehfil" when you\'re done. Closed rooms are read-only forever (no replay yet).',
        ],
      },
      {
        heading: 'Joining as audience',
        icon:    'users',
        body: [
          'Live rooms show a pulsing LIVE chip with current audience count.',
          'Tap Join to enter; you can leave any time.',
          '1000-character cap on messages. The host\'s lines show a HOST badge.',
          'Send virtual gifts (Rose, Bouquet, Crown) — MVP records intent; settlement lands in Phase 5.',
        ],
      },
      {
        heading: 'Gifts + revenue split (preview)',
        icon:    'sparkles',
        body: [
          'Rose = 10 tokens · Bouquet = 50 tokens · Crown = 500 tokens',
          'Phase 5 split: 60-70% to host · 20-25% to platform · 10-15% to prize pool (for tournament-style hosted events).',
          'Tipping leaderboards land alongside the token ledger.',
        ],
      },
      {
        heading: 'House rules',
        icon:    'rules',
        body: [
          'You\'re responsible for your room — no harassment, no spam-tip-soliciting.',
          'AI moderation applies to every message as it does everywhere else.',
          'Tip-stacking via alts dings every involved account.',
          'Phase 5 brings real money in — host verification + ID becomes mandatory then.',
        ],
      },
    ],
  },
]
