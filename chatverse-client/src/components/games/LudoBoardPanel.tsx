import { useMemo } from 'react'
import type { LudoColor, LudoStateSnapshot } from '../../types/games'

// ============================================================
//  LudoBoardPanel — pure-render SVG board.
//
//  The server owns ALL game state (dice, legality, captures); this
//  component only draws the snapshot and reports token clicks. That
//  is the entire anti-drift / anti-lag strategy: there is nothing
//  here that can disagree with the backend.
//
//  Geometry: classic 15×15 grid (viewBox 0 0 15 15, 1 unit = 1 cell).
//  Token "steps" encoding mirrors the backend:
//    -1 base · 0..50 main track · 51..55 home column · 56 finished
//  Absolute track square = (startSquare[colour] + steps) % 52.
//
//  Animations: tokens are positioned via cx/cy with a CSS transition,
//  so every server update glides the pieces instead of teleporting.
// ============================================================

export const LUDO_COLORS: Record<LudoColor, { fill: string; soft: string }> = {
  Red:    { fill: '#ef4444', soft: 'rgba(239,68,68,0.18)' },
  Green:  { fill: '#22c55e', soft: 'rgba(34,197,94,0.18)' },
  Yellow: { fill: '#eab308', soft: 'rgba(234,179,8,0.18)' },
  Blue:   { fill: '#3b82f6', soft: 'rgba(59,130,246,0.18)' },
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

// Home columns — 5 cells each, steps 51..55 (index steps-51).
const HOME_COLUMN: Record<LudoColor, [number, number][]> = {
  Red:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  Green:  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  Yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  Blue:   [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
}

// Base quadrants (top-left cell of each 6×6 base) + token parking spots.
const BASE_ORIGIN: Record<LudoColor, [number, number]> = {
  Red: [0, 0], Green: [9, 0], Yellow: [9, 9], Blue: [0, 9],
}
const BASE_SPOTS: [number, number][] = [[1.8, 1.8], [4.2, 1.8], [1.8, 4.2], [4.2, 4.2]]

// Finished tokens park near the centre, nudged toward their own side.
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

interface Props {
  snapshot: LudoStateSnapshot
  /** My colour if seated, else null (spectator / not my board). */
  myColor: LudoColor | null
  /** Token indexes I'm currently allowed to move (server's pending
   *  roll exists + it's my turn). Parent computes from snapshot. */
  movableTokens: number[]
  onTokenClick: (tokenIndex: number) => void
}

export default function LudoBoardPanel({
  snapshot, myColor, movableTokens, onTokenClick,
}: Props) {
  // Stagger stacked tokens slightly so co-located pieces stay visible.
  const stackOffsets = useMemo(() => {
    const seen = new Map<string, number>()
    const offsets: Record<string, number> = {}
    for (const seat of snapshot.seats) {
      const tokens = snapshot.tokens[seat.color] ?? []
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
  }, [snapshot])

  return (
    <svg
      viewBox="0 0 15 15"
      className="w-full max-w-[560px] aspect-square select-none"
      role="img"
      aria-label="Ludo board"
    >
      <style>{`
        .cv-ludo-token { transition: cx 0.35s ease, cy 0.35s ease; }
        @keyframes cv-ludo-pulse {
          0%, 100% { stroke-width: 0.07; }
          50% { stroke-width: 0.16; }
        }
        .cv-ludo-movable { animation: cv-ludo-pulse 0.9s ease-in-out infinite; cursor: pointer; }
      `}</style>

      {/* Board background */}
      <rect x="0" y="0" width="15" height="15" rx="0.4" fill="var(--color-surface-1)" stroke="var(--color-line)" strokeWidth="0.06" />

      {/* Base quadrants */}
      {(Object.keys(BASE_ORIGIN) as LudoColor[]).map((color) => {
        const [ox, oy] = BASE_ORIGIN[color]
        const seated = snapshot.seats.some((s) => s.color === color)
        return (
          <g key={color} opacity={seated ? 1 : 0.35}>
            <rect x={ox} y={oy} width="6" height="6" rx="0.3" fill={LUDO_COLORS[color].soft} stroke={LUDO_COLORS[color].fill} strokeWidth="0.08" />
            <rect x={ox + 1.1} y={oy + 1.1} width="3.8" height="3.8" rx="0.25" fill="var(--color-surface-1)" stroke={LUDO_COLORS[color].fill} strokeWidth="0.05" />
            {BASE_SPOTS.map(([sx, sy], i) => (
              <circle key={i} cx={ox + sx + 0.5} cy={oy + sy + 0.5} r="0.42" fill="none" stroke={LUDO_COLORS[color].fill} strokeWidth="0.04" opacity="0.5" />
            ))}
          </g>
        )
      })}

      {/* Main track cells */}
      {TRACK.map(([c, r], idx) => {
        // Colour the four start cells; tint safe stars.
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

      {/* Centre home — four triangles */}
      <g>
        <polygon points="6,6 7.5,7.5 6,9" fill={LUDO_COLORS.Red.fill} opacity="0.8" />
        <polygon points="6,6 7.5,7.5 9,6" fill={LUDO_COLORS.Green.fill} opacity="0.8" />
        <polygon points="9,6 7.5,7.5 9,9" fill={LUDO_COLORS.Yellow.fill} opacity="0.8" />
        <polygon points="6,9 7.5,7.5 9,9" fill={LUDO_COLORS.Blue.fill} opacity="0.8" />
      </g>

      {/* Tokens — rendered last so they sit on top. */}
      {snapshot.seats.map((seat) => {
        const tokens = snapshot.tokens[seat.color] ?? []
        const isMine = myColor === seat.color
        return tokens.map((steps, i) => {
          const [x, y] = tokenXY(seat.color, steps, i)
          const stack = stackOffsets[`${seat.color}-${i}`] ?? 0
          const movable = isMine && movableTokens.includes(i)
          return (
            <circle
              key={`${seat.color}-${i}`}
              className={`cv-ludo-token ${movable ? 'cv-ludo-movable' : ''}`}
              cx={x + stack * 0.18}
              cy={y - stack * 0.12}
              r="0.36"
              fill={LUDO_COLORS[seat.color].fill}
              stroke={movable ? 'white' : 'rgba(0,0,0,0.45)'}
              strokeWidth={movable ? 0.1 : 0.05}
              onClick={() => movable && onTokenClick(i)}
            />
          )
        })
      })}
    </svg>
  )
}

/** Shared helper for the page: which of my tokens can legally move
 *  with the pending roll. Mirrors the server's legality rules — used
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
