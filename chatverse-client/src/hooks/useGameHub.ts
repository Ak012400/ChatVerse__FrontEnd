import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useGameStore } from '../stores/gameStore'
import type {
  GameRoomSnapshot,
  QuizQuestionPublic,
  QuizAnswerReveal,
  ScoreEntry,
  GameParticipant,
  GameChatMessage,
} from '../types/games'

// ============================================================
//  useGameHub — SignalR client for the Gaming Hall.
//
//  Lifecycle:
//    connect()       → builds + starts the hub connection (idempotent)
//    joinRoom(slug)  → server-side group attach + RoomSnapshot
//    server pushes   → events folded into useGameStore
//    leaveRoom(slug) → explicit leave (vs disconnect = transient)
//
//  Why one shared connection per page rather than per-component?
//    SignalR multiplexes events well — opening one connection and
//    routing events through Zustand is far cheaper than the alternative.
//    Pattern matches the existing useChatHub.ts.
//
//  Server method names (must match GameHub.cs exactly):
//    Client → Server: JoinRoom, StartQuiz, SubmitAnswer, SendChat, LeaveRoom
//    Server → Client: RoomSnapshot, QuestionPushed, QuestionRevealed,
//                     ScoreUpdated, GameEnded, ParticipantJoined,
//                     ParticipantLeft, ChatMessage, AnswerAck, Error
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/game'

export function useGameHub() {
  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const connectionPromiseRef = useRef<Promise<void> | null>(null)

  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()

  // Pull store actions once — they're stable references because Zustand
  // stores don't recreate functions across renders.
  const {
    applySnapshot,
    applyQuestionPushed,
    applyQuestionRevealed,
    applyScoreUpdated,
    applyGameEnded,
    applyParticipantJoined,
    applyParticipantLeft,
    applyChatMessage,
  } = useGameStore.getState()

  // ─── Connect ──────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!token) return
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) return
    // Coalesce concurrent connect() calls — multiple components mounting
    // on the same tick would otherwise spin up duplicate hubs.
    if (connectionPromiseRef.current) return connectionPromiseRef.current

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${token}`, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      // Default backoff: 0s, 2s, 10s, 30s.
      .withAutomaticReconnect()
      .build()

    // ─── Event subscriptions ───────────────────────────────────
    // Be defensive on payload shapes — backend version drift could
    // ship a slightly-different field. Falling back to a no-op
    // beats crashing the whole hub on a single bad event.

    hub.on('RoomSnapshot', (snap: GameRoomSnapshot) => {
      if (!snap?.room) return
      // Use the FRESH store actions, not the captured ones from above —
      // getState() reads the latest store on every event so a reset
      // mid-stream is honored.
      useGameStore.getState().applySnapshot(snap)
    })

    hub.on('QuestionPushed', (q: QuizQuestionPublic) => {
      if (!q?.id) return
      useGameStore.getState().applyQuestionPushed(q)
    })

    hub.on('QuestionRevealed', (payload: {
      reveal: QuizAnswerReveal
      scoreboard: ScoreEntry[]
    }) => {
      if (!payload?.reveal) return
      useGameStore.getState().applyQuestionRevealed(
        payload.reveal,
        payload.scoreboard ?? [],
      )
    })

    hub.on('ScoreUpdated', (scoreboard: ScoreEntry[]) => {
      useGameStore.getState().applyScoreUpdated(scoreboard ?? [])
    })

    hub.on('GameEnded', (payload: {
      finalScoreboard: ScoreEntry[]
      reason?: string
    }) => {
      useGameStore.getState().applyGameEnded(payload?.finalScoreboard ?? [])
      if (payload?.reason) {
        showToast({
          type: 'info',
          title: 'Game over',
          message: payload.reason,
          duration: 4000,
        })
      }
    })

    hub.on('ParticipantJoined', (p: GameParticipant) => {
      if (!p?.userId) return
      useGameStore.getState().applyParticipantJoined(p)
    })

    hub.on('ParticipantLeft', ({ userId }: { userId: string }) => {
      if (!userId) return
      useGameStore.getState().applyParticipantLeft(userId)
    })

    hub.on('ChatMessage', (msg: GameChatMessage) => {
      if (!msg?.id) return
      useGameStore.getState().applyChatMessage(msg)
    })

    // Personal ack on SubmitAnswer — only the caller sees it. Lets
    // us either lock the UI in or show a "stale" toast if the deadline
    // beat the request.
    hub.on('AnswerAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (!accepted && reason) {
        showToast({
          type: 'warning',
          title: 'Answer rejected',
          message: reason,
          duration: 2500,
        })
      }
    })

    // Generic server errors — surfaced as toasts. Distinct from AnswerAck
    // so the user knows they can retry vs "the round just moved on".
    hub.on('Error', ({ message }: { message?: string }) => {
      showToast({
        type: 'danger',
        title: 'Game error',
        message: message ?? 'Something went wrong.',
        duration: 3000,
      })
    })

    hub.onreconnecting(() => {
      showToast({
        type: 'warning',
        title: 'Reconnecting',
        message: 'Trying to restore the game connection…',
        duration: 2500,
      })
    })

    hub.onreconnected(async () => {
      showToast({
        type: 'success',
        title: 'Reconnected',
        message: 'Back in the game.',
        duration: 1800,
      })
      // After a reconnect, we lose group membership server-side — re-attach
      // to the active room if there was one.
      const slug = useGameStore.getState().activeSlug
      if (slug) {
        try { await hub.invoke('JoinRoom', slug) } catch { /* swallow */ }
      }
    })

    connectionPromiseRef.current = hub.start().then(() => {
      connectionRef.current = hub
    }).catch((err) => {
      console.error('[useGameHub] connect failed', err)
      connectionPromiseRef.current = null
      throw err
    })

    return connectionPromiseRef.current
  }, [token, showToast])

  // Server-call wrappers. Each one ensures the connection is up before
  // invoking, so callers don't have to chain connect() → invoke() by hand.

  const ensureConnected = useCallback(async () => {
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      await connect()
    }
  }, [connect])

  const joinRoom = useCallback(async (slug: string) => {
    await ensureConnected()
    useGameStore.getState().setActiveSlug(slug)
    await connectionRef.current!.invoke('JoinRoom', slug)
  }, [ensureConnected])

  const leaveRoom = useCallback(async (slug: string) => {
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) return
    try { await connectionRef.current.invoke('LeaveRoom', slug) }
    catch { /* swallow — disconnect path already removes us */ }
    useGameStore.getState().resetRoom()
  }, [])

  const startQuiz = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('StartQuiz', slug)
  }, [ensureConnected])

  const submitAnswer = useCallback(async (
    slug: string, questionId: string, choiceIndex: number,
  ) => {
    await ensureConnected()
    // Optimistically mark answered BEFORE the round-trip so the UI
    // locks in immediately. The server's AnswerAck will roll us back
    // (via toast) if it was rejected.
    useGameStore.getState().markAnswered(choiceIndex)
    await connectionRef.current!.invoke('SubmitAnswer', slug, questionId, choiceIndex)
  }, [ensureConnected])

  const sendChat = useCallback(async (slug: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    await ensureConnected()
    await connectionRef.current!.invoke('SendChat', slug, trimmed)
  }, [ensureConnected])

  // Auto-tear-down on unmount. We DON'T leave the active room here —
  // the user might be navigating between pages within the room route.
  // Leaving is the responsibility of the page itself.
  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {})
        connectionRef.current = null
      }
      connectionPromiseRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    connect,
    joinRoom,
    leaveRoom,
    startQuiz,
    submitAnswer,
    sendChat,
  }
}
