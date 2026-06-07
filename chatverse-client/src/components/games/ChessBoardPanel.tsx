import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
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

  const handlePieceDrop = (sourceSquare: Square, targetSquare: Square): boolean => {
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
      if (!result) return false
      const fenAfter = chessRef.current.fen()
      const uci = `${result.from}${result.to}${result.promotion ?? ''}`
      onMove(result.san, uci, fenAfter)
      return true
    } catch {
      return false
    }
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
        {snapshot.turn === (myColor === 'white' ? 'Black' : 'White')
          && snapshot.result === 'InProgress' && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-warning-fg)]">
            Their turn
          </span>
        )}
      </div>

      <div className="w-full max-w-[560px]">
        <Chessboard
          position={snapshot.fen}
          onPieceDrop={handlePieceDrop}
          boardOrientation={myColor}
          customSquareStyles={lastMoveSquares}
          arePiecesDraggable={isMyTurn}
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
            Your turn
          </span>
        )}
      </div>

      {!isLoggedIn && (
        <p className="text-[11px] text-[var(--color-fg-mute)] italic">
          Spectator mode — sign in to play.
        </p>
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
