import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { Crown } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useGameStore } from '../../stores/gameStore'
import type { ChessStateSnapshot } from '../../types/games'

// ============================================================
//  ChessBoardPanel — wraps react-chessboard + chess.js so the
//  parent (PlayRoomPage) just hands us the latest snapshot.
//
//  Architecture:
//   • The store's snapshot.fen drives the rendered position.
//   • Local chess.js instance mirrors that FEN for legality
//     checks on drag-attempts (refusing illegal moves before
//     they leave the browser).
//   • When a move is legal locally, we hand the SAN/UCI/FEN
//     to the parent's onMove(), which invokes the hub.
//
//  Orientation:
//   • You see your own colour at the bottom (white at bottom
//     for White player, black at bottom for Black). Spectators
//     see white at the bottom by convention.
//
//  Guest gate:
//   • If isLoggedIn is false, board is in read-only mode —
//     drags are blocked, "Sign in to play" shown.
// ============================================================

interface Props {
  snapshot: ChessStateSnapshot
  isLoggedIn: boolean
  /** Called when local validation accepts a move. Hub takes over. */
  onMove: (san: string, uci: string, fenAfter: string) => void
}

export default function ChessBoardPanel({ snapshot, isLoggedIn, onMove }: Props) {
  const me = useAuthStore((s) => s.user)
  const lastMove = useGameStore((s) => s.lastChessMove)

  // Determine MY colour. If I'm White or Black, board orients
  // accordingly; spectator gets White at the bottom.
  const myColor: 'white' | 'black' =
    snapshot.blackPlayerId === me?.userId ? 'black' : 'white'

  // chess.js mirror — we resync on every snapshot.fen change.
  const chessRef = useRef<Chess>(new Chess(snapshot.fen))
  useEffect(() => {
    try {
      chessRef.current = new Chess(snapshot.fen)
    } catch {
      // Bad FEN somehow — fall back to start.
      chessRef.current = new Chess()
    }
  }, [snapshot.fen])

  const isMyTurn = useMemo(() => {
    if (snapshot.result !== 'InProgress') return false
    if (!isLoggedIn) return false
    if (snapshot.turn === 'White') return snapshot.whitePlayerId === me?.userId
    return snapshot.blackPlayerId === me?.userId
  }, [snapshot, me, isLoggedIn])

  // Last-move highlight squares for a subtle visual cue.
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({})
  useEffect(() => {
    if (!lastMove?.move?.uci) {
      setLastMoveSquares({})
      return
    }
    const uci = lastMove.move.uci
    if (uci.length < 4) return
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    setLastMoveSquares({
      [from]: { background: 'rgba(99,102,241,0.25)' },
      [to]: { background: 'rgba(99,102,241,0.35)' },
    })
  }, [lastMove])

  // ─── Check highlight ───────────────────────────────────────────
  // The side TO MOVE is the one in check — find their king's square
  // and paint it red, the way every online chess site signals check.
  // Recomputed per FEN; cheap (single board scan).
  const { checkSquares, inCheck } = useMemo(() => {
    try {
      const c = new Chess(snapshot.fen)
      if (!c.inCheck()) return { checkSquares: {}, inCheck: false }
      const sideToMove = c.turn()
      for (const row of c.board()) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === sideToMove) {
            return {
              inCheck: true,
              checkSquares: {
                [sq.square]: {
                  background:
                    'radial-gradient(circle, rgba(239,68,68,0.8) 22%, rgba(239,68,68,0.35) 55%, transparent 72%)',
                  boxShadow: 'inset 0 0 14px rgba(239,68,68,0.55)',
                } as React.CSSProperties,
              },
            }
          }
        }
      }
    } catch { /* bad FEN — no highlight */ }
    return { checkSquares: {}, inCheck: false }
  }, [snapshot.fen])

  // ─── Legal-move dots (click-to-move + drag preview) ────────────
  // Selecting one of my pieces (click or drag-start) shows a dot on
  // every legal destination; capture squares get a ring instead.
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)

  const legalTargetStyles = useMemo(() => {
    if (!selectedSquare || !isMyTurn) return {}
    const styles: Record<string, React.CSSProperties> = {
      [selectedSquare]: { background: 'rgba(99,102,241,0.35)' },
    }
    try {
      const moves = chessRef.current.moves({ square: selectedSquare, verbose: true })
      for (const m of moves) {
        styles[m.to] = m.captured
          // Capture target — ring around the occupied square.
          ? { background: 'radial-gradient(circle, transparent 56%, rgba(239,68,68,0.55) 62%, rgba(239,68,68,0.55) 72%, transparent 78%)' }
          // Quiet move target — centre dot.
          : { background: 'radial-gradient(circle, rgba(99,102,241,0.5) 20%, transparent 26%)' }
      }
    } catch { /* ignore — stale square */ }
    return styles
  }, [selectedSquare, isMyTurn, snapshot.fen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Illegal-move shake feedback ───────────────────────────────
  const [shaking, setShaking] = useState(false)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerShake = () => {
    setShaking(true)
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = setTimeout(() => setShaking(false), 380)
  }
  useEffect(() => () => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
  }, [])

  /** Shared move gate for drag-drop AND click-to-move. Returns true
   *  if the move was legal and dispatched to the hub. */
  const tryMove = (sourceSquare: Square, targetSquare: Square): boolean => {
    if (!isMyTurn) return false
    try {
      // chess.js's move() returns null for illegal moves; we use
      // it as our gate. Auto-promote to queen for simplicity in
      // v1 — promotion picker is a v2 nicety.
      const result = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      })
      if (!result) { triggerShake(); return false }
      const fenAfter = chessRef.current.fen()
      const uci = `${result.from}${result.to}${result.promotion ?? ''}`
      setSelectedSquare(null)
      onMove(result.san, uci, fenAfter)
      return true
    } catch {
      triggerShake()
      return false
    }
  }

  const handlePieceDrop = (sourceSquare: Square, targetSquare: Square): boolean =>
    tryMove(sourceSquare, targetSquare)

  // Drag-start shows the same dots as a click-select.
  const handlePieceDragBegin = (_piece: string, sourceSquare: Square) => {
    if (isMyTurn) setSelectedSquare(sourceSquare)
  }

  /** Click-to-move: first click selects own piece (dots appear),
   *  second click on a dotted square moves; clicking another own
   *  piece re-selects; anything else deselects. */
  const handleSquareClick = (square: Square) => {
    if (!isMyTurn) return
    const myShortColor = myColor === 'white' ? 'w' : 'b'
    const piece = chessRef.current.get(square)

    if (selectedSquare && square !== selectedSquare) {
      // Re-select if clicking another of my pieces…
      if (piece && piece.color === myShortColor) {
        setSelectedSquare(square)
        return
      }
      // …otherwise attempt the move (tryMove shakes on illegal).
      tryMove(selectedSquare, square)
      return
    }
    if (piece && piece.color === myShortColor) {
      setSelectedSquare(square === selectedSquare ? null : square)
    } else {
      setSelectedSquare(null)
    }
  }

  // Merged square decorations — later spreads win on conflicts, so
  // selection/dots paint over last-move tint, and check stays visible.
  const mergedSquareStyles = {
    ...lastMoveSquares,
    ...checkSquares,
    ...legalTargetStyles,
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Player labels — opponent on top, you on bottom (matches board orientation). */}
      <div className="w-full max-w-[560px] flex items-center justify-between text-xs">
        <span className="text-[var(--color-fg-dim)]">
          {myColor === 'white' ? snapshot.blackPlayerName ?? 'Waiting…' : snapshot.whitePlayerName ?? 'Waiting…'}
          <span className="ml-1 text-[var(--color-fg-mute)]">
            ({myColor === 'white' ? 'Black' : 'White'})
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          {inCheck && snapshot.result === 'InProgress' && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-danger-fg)] animate-pulse">
              Check!
            </span>
          )}
          {snapshot.turn === (myColor === 'white' ? 'Black' : 'White')
            && snapshot.result === 'InProgress' && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-warning-fg)]">
              Their turn
            </span>
          )}
        </span>
      </div>

      {/* Scoped keyframes for the illegal-move shake — kept inline so
          the component stays self-contained (no Tailwind config edit). */}
      <style>{`
        @keyframes cv-board-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .cv-board-shake { animation: cv-board-shake 0.35s ease; }
      `}</style>

      <div className={`w-full max-w-[560px] ${shaking ? 'cv-board-shake' : ''}`}>
        <Chessboard
          position={snapshot.fen}
          onPieceDrop={handlePieceDrop}
          onPieceDragBegin={handlePieceDragBegin}
          onSquareClick={handleSquareClick}
          boardOrientation={myColor}
          customSquareStyles={mergedSquareStyles}
          arePiecesDraggable={isMyTurn}
          animationDuration={250}
        />
      </div>

      <div className="w-full max-w-[560px] flex items-center justify-between text-xs">
        <span className="text-[var(--color-fg-dim)]">
          {myColor === 'white' ? snapshot.whitePlayerName ?? 'Waiting…' : snapshot.blackPlayerName ?? 'Waiting…'}
          <span className="ml-1 text-[var(--color-fg-mute)]">
            ({myColor === 'white' ? 'White' : 'Black'}{me ? ' · you' : ''})
          </span>
        </span>
        {isMyTurn && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-success-fg)]">
            {inCheck ? 'Your turn — get out of check!' : 'Your turn'}
          </span>
        )}
      </div>

      {!isLoggedIn && (
        // Guest spectator CTA — converts a watching guest into a
        // signed-in user. Keeps it inline (not a modal) so it doesn't
        // interrupt their watching.
        <div className="w-full max-w-[560px] rounded-md bg-[var(--color-accent-soft)] border border-[var(--color-accent-fg)] px-3 py-2 flex items-center gap-2">
          <Crown size={12} className="text-[var(--color-accent-fg)] shrink-0" />
          <span className="text-[11px] flex-1">
            You're watching as a guest. <strong>Sign up</strong> to play, request a seat, or invite friends.
          </span>
          <a
            href="/register"
            className="h-7 px-2.5 rounded-md text-[10px] font-medium bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white inline-flex items-center transition-colors"
          >
            Sign up
          </a>
        </div>
      )}
      {snapshot.result !== 'InProgress' && (
        <p className="text-xs font-medium text-[var(--color-accent-fg)]">
          {snapshot.result === 'WhiteWins' && '🏆 White wins'}
          {snapshot.result === 'BlackWins' && '🏆 Black wins'}
          {snapshot.result === 'Draw' && '🤝 Draw'}
          {snapshot.result === 'Aborted' && 'Game aborted'}
        </p>
      )}
    </div>
  )
}
