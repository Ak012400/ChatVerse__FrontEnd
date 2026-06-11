import { useEffect, useMemo, useRef, useState } from 'react'
import type { LudoColor, LudoStateSnapshot } from '../../types/games'

// ============================================================
//  LudoBoardPanel — animated SVG board (pure render).
//
//  The server owns ALL game state; this component only draws it.
//  What it ADDS on top of the raw snapshot is presentation motion:
//
//  • HOP ENGINE — when the server says a token went from step 4 to
//    step 9, we don't teleport it: a 150ms ticker walks the visible
//    position one cell at a time, and the CSS transition glides each
//    hop, so pieces "walk" the track like a physical board.
//  • CAPTURE BURSTS — a captured token snaps home, leaving an
//    expanding ring + shrinking ghost at the spot it died.
//  • FINISH SPARKLE — a token reaching home pops a star at centre.
//  • MOVABLE HALO — your playable tokens breathe with a glow ring.
//
//  Geometry: classic 15×15 grid (viewBox 0 0 15 15).
//  Token "steps" encoding mirrors the backend:
//    -1 base · 0..50 main track · 51..55 home column · 56 finished
// ============================================================

export const LUDO_COLORS: Record<LudoColor, { fill: string; soft: string; dark: string }> = {
  Red:    { fill: '#ef4444', soft: 'rgba(239,68,68,0.18)',  dark: '#b91c1c' },
  Green:  { fill: '#22c55e', soft: 'rgba(34,197,94,0.18)',  dark: '#15803d' },
  Yellow: { fill: '#eab308', soft: 'rgba(234,179,8,0.18)',  dark: '#a16207' },
  Blue:   { fill: '#3b82f6', soft: 'rgba(59,130,246,0.18)', dark: '#1d4ed8' },
}

const START_SQUARE: Record<LudoColor, number> = {
  Red: 0, Green: 13, Yellow: 26, Blue: 39,
}

// 52 main-track cells, clockwise from Red's start. (col,row) pairs.
const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],          // 0-4
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],  // 5-10
  [7, 0],                                           // 11
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],  // 12-17
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 18-23
  [14, 7],                                          // 24
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 25-30
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 31-36
  [7, 14],                                          // 37
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 38-43
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],  // 44-49
  [0, 7],                                           // 50
  [0, 6],                                           // 51
]

const SAFE_SQUARES = new Set([0, 13, 26, 39, 8, 21, 34, 47])

const HOME_COLUMN: Record<LudoColor, [number, number][]> = {
  Red:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  Green:  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  Yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  Blue:   [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
}

const BASE_ORIGIN: Record<LudoColor, [number, number]> = {
  Red: [0, 0], Green: [9, 0], Yellow: [9, 9], Blue: [0, 9],
}
const BASE_SPOTS: [number, number][] = [[1.8, 1.8], [4.2, 1.8], [1.8, 4.2], [4.2, 4.2]]

const CENTER_NUDGE: Record<LudoColor, [number, number]> = {
  Red: [-0.55, 0], Green: [0, -0.55], Yellow: [0.55, 0], Blue: [0, 0.55],
}

/** Token steps → board coordinates (centre of cell). */
function tokenXY(color: LudoColor, steps: number, tokenIndex: number): [number, number] {
  if (steps === -1) {
    const [ox, oy] = BASE_ORIGIN[color]
    const [sx, sy] = BASE_SPOTS[tokenIndex]
    return [ox + sx + 0.5, oy + sy + 0.5]
  }
  if (steps >= 56) {
    const [nx, ny] = CENTER_NUDGE[color]
    return [7.5 + nx, 7.5 + ny]
  }
  if (steps >= 51) {
    const [c, r] = HOME_COLUMN[color][steps - 51]
    return [c + 0.5, r + 0.5]
  }
  const [c, r] = TRACK[(START_SQUARE[color] + steps) % 52]
  return [c + 0.5, r + 0.5]
}

interface Ghost {
  id: number
  x: number
  y: number
  color: LudoColor
  kind: 'capture' | 'finish'
}

interface Props {
  snapshot: LudoStateSnapshot
  myColor: LudoColor | null
  movableTokens: number[]
  onTokenClick: (tokenIndex: number) => void
}

export default function LudoBoardPanel({
  snapshot, myColor, movableTokens, onTokenClick,
}: Props) {
  // ─── Hop engine ─────────────────────────────────────────────────
  // `display` is what we DRAW; snapshot.tokens is the server truth.
  // A 150ms ticker advances display one cell toward truth, so multi-
  // step moves walk the track. Captures snap (with a burst); brand-new
  // colours (game start) snap silently.
  const [display, setDisplay] = useState<Record<string, number[]>>(snapshot.tokens)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const targetRef = useRef(snapshot.tokens)
  const ghostIdRef = useRef(0)

  // Fold a fresh server snapshot in: handle snaps (captures, resets,
  // newly-seated colours) immediately; leave forward motion to ticker.
  useEffect(() => {
    targetRef.current = snapshot.tokens
    setDisplay((prev) => {
      const next: Record<string, number[]> = {}
      const newGhosts: Ghost[] = []
      for (const color of Object.keys(snapshot.tokens) as LudoColor[]) {
        const tgt = snapshot.tokens[color]
        const cur = prev[color]
        if (!cur) { next[color] = [...tgt]; continue }   // new colour → snap
        next[color] = cur.map((p, i) => {
          const t = tgt[i]
          if (t < p) {
            // Backwards = capture (or reset). Burst where it stood,
            // then snap home — gliding backwards across the board
            // would look like a glitch, not a kill.
            if (p >= 0 && t === -1) {
              const [x, y] = tokenXY(color, p, i)
              newGhosts.push({ id: ++ghostIdRef.current, x, y, color, kind: 'capture' })
            }
            return t
          }
          if (t === 56 && p < 56 && t - p <= 1) {
            const [nx, ny] = CENTER_NUDGE[color]
            newGhosts.push({ id: ++ghostIdRef.current, x: 7.5 + nx, y: 7.5 + ny, color, kind: 'finish' })
          }
          return p   // forward motion handled by the ticker
        })
      }
      if (newGhosts.length) setGhosts((g) => [...g, ...newGhosts])
      return next
    })
  }, [snapshot.tokens])

  // The ticker — one hop per 150ms toward the server truth.
  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((prev) => {
        const target = targetRef.current
        let changed = false
        const next: Record<string, number[]> = {}
        for (const color of Object.keys(target) as LudoColor[]) {
          const tArr = target[color]
          const pArr = prev[color] ?? tArr
          next[color] = pArr.map((p, i) => {
            const t = tArr[i]
            if (p === t || t < p) return Math.min(p, t) === t ? t : p
            changed = true
            if (p === -1) return 0          // hop out of base
            if (t === 56 && t - p === 1) {
              // final hop — sparkle handled in the fold effect
              return t
            }
            return p + 1
          })
        }
        return changed ? next : prev
      })
    }, 150)
    return () => clearInterval(id)
  }, [])

  // Ghost cleanup.
  useEffect(() => {
    if (ghosts.length === 0) return
    const id = setTimeout(() => setGhosts((g) => g.slice(1)), 650)
    return () => clearTimeout(id)
  }, [ghosts])

  // Stagger stacked tokens so co-located pieces stay visible.
  const stackOffsets = useMemo(() => {
    const seen = new Map<string, number>()
    const offsets: Record<string, number> = {}
    for (const seat of snapshot.seats) {
      const tokens = display[seat.color] ?? []
      tokens.forEach((steps, i) => {
        if (steps === -1) return
        const [x, y] = tokenXY(seat.color, steps, i)
        const key = `${x},${y}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        offsets[`${seat.color}-${i}`] = n
      })
    }
    return offsets
  }, [display, snapshot.seats])

  const turnColor = snapshot.currentTurn

  return (
    <svg
      viewBox="0 0 15 15"
      className="w-full max-w-[560px] aspect-square select-none cv-ludo-board"
      role="img"
      aria-label="Ludo board"
    >
      <style>{`
        .cv-ludo-board { animation: cv-ludo-boardin 0.45s ease; }
        @keyframes cv-ludo-boardin {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        .cv-ludo-token {
          transition: cx 0.15s ease-in-out, cy 0.15s ease-in-out, r 0.15s ease;
        }
        .cv-ludo-shadow { transition: cx 0.15s ease-in-out, cy 0.15s ease-in-out; }
        @keyframes cv-ludo-halo {
          0%, 100% { r: 0.46; opacity: 0.85; }
          50%      { r: 0.62; opacity: 0.25; }
        }
        .cv-ludo-haloring { animation: cv-ludo-halo 0.95s ease-in-out infinite; cursor: pointer; }
        @keyframes cv-ludo-turnpulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.15; }
        }
        .cv-ludo-turnglow { animation: cv-ludo-turnpulse 1.4s ease-in-out infinite; }
        @keyframes cv-ludo-burst {
          from { r: 0.2;  opacity: 0.9; stroke-width: 0.16; }
          to   { r: 1.05; opacity: 0;   stroke-width: 0.02; }
        }
        .cv-ludo-burstring { animation: cv-ludo-burst 0.6s ease-out forwards; }
        @keyframes cv-ludo-ghostdie {
          from { opacity: 0.85; }
          to   { opacity: 0; }
        }
        .cv-ludo-ghost { animation: cv-ludo-ghostdie 0.55s ease-out forwards; }
        @keyframes cv-ludo-star {
          0%   { opacity: 0;   font-size: 0.2px; }
          35%  { opacity: 1;   font-size: 1.1px; }
          100% { opacity: 0;   font-size: 1.5px; }
        }
        .cv-ludo-starpop { animation: cv-ludo-star 0.65s ease-out forwards; }
      `}</style>

      {/* Board background */}
      <rect x="0" y="0" width="15" height="15" rx="0.4" fill="var(--color-surface-1)" stroke="var(--color-line)" strokeWidth="0.06" />

      {/* Base quadrants — current player's base breathes */}
      {(Object.keys(BASE_ORIGIN) as LudoColor[]).map((color) => {
        const [ox, oy] = BASE_ORIGIN[color]
        const seated = snapshot.seats.some((s) => s.color === color)
        const isTurn = turnColor === color && snapshot.status === 'Playing'
        return (
          <g key={color} opacity={seated ? 1 : 0.35}>
            <rect x={ox} y={oy} width="6" height="6" rx="0.3" fill={LUDO_COLORS[color].soft} stroke={LUDO_COLORS[color].fill} strokeWidth="0.08" />
            {isTurn && (
              <rect
                className="cv-ludo-turnglow"
                x={ox + 0.12} y={oy + 0.12} width="5.76" height="5.76" rx="0.25"
                fill="none" stroke={LUDO_COLORS[color].fill} strokeWidth="0.18"
              />
            )}
            <rect x={ox + 1.1} y={oy + 1.1} width="3.8" height="3.8" rx="0.25" fill="var(--color-surface-1)" stroke={LUDO_COLORS[color].fill} strokeWidth="0.05" />
            {BASE_SPOTS.map(([sx, sy], i) => (
              <circle key={i} cx={ox + sx + 0.5} cy={oy + sy + 0.5} r="0.42" fill="none" stroke={LUDO_COLORS[color].fill} strokeWidth="0.04" opacity="0.5" />
            ))}
          </g>
        )
      })}

      {/* Main track */}
      {TRACK.map(([c, r], idx) => {
        const startOf = (Object.keys(START_SQUARE) as LudoColor[])
          .find((col) => START_SQUARE[col] === idx)
        return (
          <g key={idx}>
            <rect
              x={c} y={r} width="1" height="1"
              fill={startOf ? LUDO_COLORS[startOf].soft : 'var(--color-surface-2)'}
              stroke="var(--color-line)"
              strokeWidth="0.03"
            />
            {SAFE_SQUARES.has(idx) && (
              <text x={c + 0.5} y={r + 0.72} fontSize="0.55" textAnchor="middle" fill="var(--color-fg-mute)">★</text>
            )}
            {startOf && (
              <text x={c + 0.5} y={r + 0.7} fontSize="0.45" textAnchor="middle" fill={LUDO_COLORS[startOf].fill}>▶</text>
            )}
          </g>
        )
      })}

      {/* Home columns */}
      {(Object.keys(HOME_COLUMN) as LudoColor[]).map((color) =>
        HOME_COLUMN[color].map(([c, r], i) => (
          <rect key={`${color}-${i}`} x={c} y={r} width="1" height="1" fill={LUDO_COLORS[color].soft} stroke="var(--color-line)" strokeWidth="0.03" />
        )))}

      {/* Centre home */}
      <g>
        <polygon points="6,6 7.5,7.5 6,9" fill={LUDO_COLORS.Red.fill} opacity="0.8" />
        <polygon points="6,6 7.5,7.5 9,6" fill={LUDO_COLORS.Green.fill} opacity="0.8" />
        <polygon points="9,6 7.5,7.5 9,9" fill={LUDO_COLORS.Yellow.fill} opacity="0.8" />
        <polygon points="6,9 7.5,7.5 9,9" fill={LUDO_COLORS.Blue.fill} opacity="0.8" />
      </g>

      {/* Capture bursts + finish sparkles */}
      {ghosts.map((g) => g.kind === 'capture' ? (
        <g key={g.id}>
          <circle className="cv-ludo-burstring" cx={g.x} cy={g.y} r="0.2" fill="none" stroke={LUDO_COLORS[g.color].fill} />
          <circle className="cv-ludo-ghost" cx={g.x} cy={g.y} r="0.32" fill={LUDO_COLORS[g.color].fill} />
        </g>
      ) : (
        <text key={g.id} className="cv-ludo-starpop" x={g.x} y={g.y + 0.3} textAnchor="middle" fill={LUDO_COLORS[g.color].fill}>✦</text>
      ))}

      {/* Tokens — drawn from the HOP-ANIMATED display positions. */}
      {snapshot.seats.map((seat) => {
        const tokens = display[seat.color] ?? []
        const serverTokens = snapshot.tokens[seat.color] ?? []
        const isMine = myColor === seat.color
        return tokens.map((steps, i) => {
          const [x, y] = tokenXY(seat.color, steps, i)
          const stack = stackOffsets[`${seat.color}-${i}`] ?? 0
          const cx = x + stack * 0.18
          const cy = y - stack * 0.12
          // Clickability follows SERVER truth, not the animated ghost.
          const movable = isMine && movableTokens.includes(i)
          const hopping = steps !== serverTokens[i]
          return (
            <g key={`${seat.color}-${i}`} onClick={() => movable && onTokenClick(i)}>
              {/* soft drop shadow for depth */}
              <ellipse
                className="cv-ludo-shadow"
                cx={cx + 0.05} cy={cy + 0.16} rx="0.3" ry="0.12"
                fill="rgba(0,0,0,0.3)"
              />
              {movable && (
                <circle className="cv-ludo-haloring" cx={cx} cy={cy} r="0.5" fill="none" stroke="white" strokeWidth="0.07" />
              )}
              <circle
                className="cv-ludo-token"
                cx={cx} cy={cy}
                r={hopping ? 0.42 : 0.36}
                fill={LUDO_COLORS[seat.color].fill}
                stroke={movable ? 'white' : LUDO_COLORS[seat.color].dark}
                strokeWidth={movable ? 0.09 : 0.06}
                style={{ cursor: movable ? 'pointer' : 'default' }}
              />
              {/* glossy highlight — gives the flat circle a "piece" feel */}
              <circle
                className="cv-ludo-token"
                cx={cx - 0.1} cy={cy - 0.12}
                r={hopping ? 0.16 : 0.13}
                fill="rgba(255,255,255,0.45)"
                pointerEvents="none"
              />
            </g>
          )
        })
      })}
    </svg>
  )
}

/** Which of my tokens can legally move with the pending roll — used
 *  ONLY for highlighting; the server re-validates every move. */
export function movableTokenIndexes(
  snapshot: LudoStateSnapshot, myColor: LudoColor | null,
): number[] {
  if (!myColor) return []
  if (snapshot.currentTurn !== myColor) return []
  if (snapshot.pendingRoll == null) return []
  const roll = snapshot.pendingRoll
  const tokens = snapshot.tokens[myColor] ?? []
  const result: number[] = []
  tokens.forEach((steps, i) => {
    if (steps === 56) return
    if (steps === -1) {
      if (roll === 6) result.push(i)
      return
    }
    if (steps + roll <= 56) result.push(i)
  })
  return result
}
