import { useEffect, useState } from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import type {
  JokePushed, JokeRevealed, JokeReactionType,
  JokeFinalStat, GameRole,
} from '../../types/games'

// ============================================================
//  JokesPanel — the in-room view for Jokes mode.
//
//  Renders three states based on what the parent passes:
//    • Current joke + 4 emoji buttons + live bar chart
//    • Reveal overlay when the round ends ("Top reaction: 😂")
//    • Final leaderboard when the whole round wraps
//
//  Reactions are last-write-wins on the server, so we let players
//  change their pick freely during the window. The UI highlights
//  whichever button they last tapped.
// ============================================================

const REACTIONS: { type: JokeReactionType; emoji: string; label: string }[] = [
  { type: 'Laugh',   emoji: '😂', label: 'Funny' },
  { type: 'Meh',     emoji: '😐', label: 'Meh' },
  { type: 'Skull',   emoji: '💀', label: 'Dead' },
  { type: 'EyeRoll', emoji: '🙄', label: 'Eye-roll' },
]

interface Props {
  /** Current joke pushed by the bot, null between rounds / ended */
  joke: JokePushed | null
  /** Live counts per reaction — keyed by JokeReactionType */
  counts: Record<JokeReactionType, number>
  /** Last reveal payload — when present, options lock in colour */
  reveal: JokeRevealed | null
  /** Final stats once the game ends — drives the leaderboard view */
  finalStats: JokeFinalStat[]
  /** Player vs spectator gates whether reactions are submittable */
  viewerRole: GameRole | null
  /** Whichever reaction the viewer last tapped (optimistic) */
  myReaction: JokeReactionType | null
  /** Forwarded to hub.submitReaction by the parent */
  onReact: (reaction: JokeReactionType) => void
}

export default function JokesPanel({
  joke, counts, reveal, finalStats, viewerRole, myReaction, onReact,
}: Props) {
  // ─── Final leaderboard takes precedence ────────────────────────
  // When jokesFinalStats is populated the game is over — we don't
  // want to flash a stale "Last joke was..." reveal next to it.
  if (finalStats.length > 0) {
    return <FinalLeaderboard stats={finalStats} />
  }

  if (!joke) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[var(--color-fg-mute)] p-6 text-center">
        <p>Waiting for the next joke…</p>
      </div>
    )
  }

  const isPlayer = viewerRole === 'Player'
  const isLocked = !!reveal || !isPlayer
  const totalReactions = Math.max(1, Object.values(counts).reduce((a, b) => a + b, 0))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
            Joke {joke.jokeNumber} / {joke.totalJokes}
          </p>
          <p className="text-xs text-[var(--color-fg-dim)] mt-0.5 flex items-center gap-1">
            <Sparkles size={11} className="text-[var(--color-warning-fg)]" />
            JokeBot is roasting the room
          </p>
        </div>
        <DeadlineRing deadlineUtc={joke.deadlineUtc} totalSeconds={30} />
      </header>

      {/* Joke card */}
      <div className="bg-[var(--color-surface-1)] border border-[var(--color-line)] rounded-md p-6 mb-4">
        <p className="text-base sm:text-lg font-medium leading-relaxed">
          {joke.text}
        </p>
      </div>

      {/* Reaction grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {REACTIONS.map((r) => {
          const isMine = myReaction === r.type
          const isTop = reveal && reveal.topReaction === r.type
          const tone =
            isTop  ? 'bg-[var(--color-success-soft)] border-[var(--color-success-border)]' :
            isMine ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent-fg)]' :
                     'bg-[var(--color-surface-1)] border-[var(--color-line)]'
          return (
            <button
              key={r.type}
              disabled={isLocked}
              onClick={() => !isLocked && onReact(r.type)}
              className={[
                'p-3 rounded-md border transition-all flex flex-col items-center gap-1',
                tone,
                isLocked && !isMine && !isTop ? 'opacity-60 cursor-not-allowed' : '',
                !isLocked ? 'hover:border-[var(--color-line-strong)] active:scale-[0.97]' : '',
              ].join(' ')}
            >
              <span className="text-2xl">{r.emoji}</span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                {r.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Live bar chart — visualises tally */}
      <div className="space-y-1.5">
        {REACTIONS.map((r) => {
          const count = counts[r.type] ?? 0
          const pct = (count / totalReactions) * 100
          return (
            <div key={r.type} className="flex items-center gap-2">
              <span className="text-sm w-6 shrink-0 text-center">{r.emoji}</span>
              <div className="flex-1 h-4 bg-[var(--color-surface-2)] rounded-sm overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs w-6 text-right tabular-nums text-[var(--color-fg-dim)]">
                {count}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer hints */}
      <div className="mt-4 text-center text-xs text-[var(--color-fg-mute)]">
        {!isPlayer && <span>You're spectating — chat to cheer reactions on.</span>}
        {isPlayer && reveal && <span>Top reaction was {emojiFor(reveal.topReaction)} — next joke incoming…</span>}
        {isPlayer && !reveal && myReaction && <span>You reacted {emojiFor(myReaction)} — you can change it until the timer ends.</span>}
        {isPlayer && !reveal && !myReaction && <span>Tap an emoji — honest is funny.</span>}
      </div>
    </div>
  )
}

// ─── Deadline ring ──────────────────────────────────────────────
function DeadlineRing({ deadlineUtc, totalSeconds }: { deadlineUtc: string; totalSeconds: number }) {
  // Same pattern as QuestionCard — drive from server deadline so
  // client clock drift doesn't matter, refresh 10× per second.
  const [remainingMs, setRemainingMs] = useState(() => msUntil(deadlineUtc))
  useEffect(() => {
    setRemainingMs(msUntil(deadlineUtc))
    const id = setInterval(() => setRemainingMs(msUntil(deadlineUtc)), 100)
    return () => clearInterval(id)
  }, [deadlineUtc])

  const fraction = Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000)))
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))

  return (
    <div className="relative w-12 h-12">
      <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--color-line)" strokeWidth="2" />
        <circle
          cx="18" cy="18" r="15.9155" fill="none"
          stroke={seconds <= 5 ? 'var(--color-danger-fg)' : 'var(--color-accent-fg)'}
          strokeWidth="2"
          strokeDasharray={`${fraction * 100} 100`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 120ms linear' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {seconds}
      </span>
    </div>
  )
}

// ─── Final leaderboard ─────────────────────────────────────────
function FinalLeaderboard({ stats }: { stats: JokeFinalStat[] }) {
  // Already sorted by the server (laugh count desc, total reactions
  // tiebreak). Just render top-N with a podium for the winner.
  const winner = stats[0]
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="text-center mb-6">
        <Trophy size={36} className="mx-auto text-[var(--color-warning-fg)] mb-2" />
        <h3 className="text-lg font-semibold">Funniest joke of the round</h3>
        {winner && (
          <p className="text-sm text-[var(--color-fg-mute)] mt-1 max-w-md mx-auto">
            "{winner.text}" — {winner.laughCount} 😂
          </p>
        )}
      </div>

      <ol className="space-y-2">
        {stats.map((s, i) => (
          <li
            key={s.jokeId}
            className="p-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)] flex items-start gap-3"
          >
            <span className="w-7 h-7 rounded-md bg-[var(--color-surface-2)] text-[var(--color-fg-dim)] flex items-center justify-center text-xs font-semibold shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{s.text}</p>
              <p className="text-[10px] text-[var(--color-fg-mute)] mt-1">
                {s.laughCount} 😂 · {s.totalReactions} total reactions
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────
function msUntil(iso: string): number {
  const t = new Date(iso).getTime()
  return Math.max(0, t - Date.now())
}

function emojiFor(r: JokeReactionType): string {
  return REACTIONS.find((x) => x.type === r)?.emoji ?? ''
}
