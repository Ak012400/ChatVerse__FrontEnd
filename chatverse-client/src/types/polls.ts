// ============================================================
//  Polls — in-room voting types (parity polish).
//
//  Mirrors the ShapePoll DTO from ChatHub.cs. Voters (userId →
//  picked option-index list) ONLY arrives when anonymous=false AND
//  the poll has closed. During an open or anonymous-closed poll,
//  `voters` is null and clients only see the `counts` array.
// ============================================================

export type PollDto = {
  id: string
  roomSlug: string
  creatorUserId: string
  creatorUsername: string
  question: string
  options: string[]
  /** Vote counts indexed parallel to `options`. */
  counts: number[]
  multiSelect: boolean
  anonymous: boolean
  createdAt: string
  expiresAt: string
  isClosed: boolean
  closedAt: string | null
  /** Only populated when anonymous=false AND isClosed=true.
   *  Map: userId → list of picked option indices. */
  voters: Record<string, number[]> | null
}

export const POLL_DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 30,  label: '30 sec' },
  { seconds: 60,  label: '1 min'  },
  { seconds: 300, label: '5 min'  },
]

export const POLL_MAX_OPTIONS = 6
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_QUESTION_CHARS = 200
export const POLL_MAX_OPTION_CHARS = 80
