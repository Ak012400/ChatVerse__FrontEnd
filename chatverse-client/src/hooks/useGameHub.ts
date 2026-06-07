import { useEffect, useRef, useCallback, useState } from 'react'
import * as signalR from '@microsoft/signalr'

// ============================================================
//  HubConnectionState — what callers consume.
//
//  We deliberately surface a SIMPLER state machine than SignalR's
//  underlying one. The hub library has 5 states (Disconnected,
//  Connecting, Connected, Disconnecting, Reconnecting) but for our
//  UI purposes the distinctions that matter are:
//    'disconnected' — never tried, OR tried and failed
//    'connecting'   — initial connect or reconnect in flight
//    'connected'    — fully ready, can invoke
//    'failed'       — last connect attempt errored (e.g. /hubs/game
//                     endpoint not deployed). Distinct from 'disconnected'
//                     because UI can show "server unavailable" vs
//                     "not started yet" differently.
// ============================================================
export type GameHubState = 'disconnected' | 'connecting' | 'connected' | 'failed'

/**
 * Typed error thrown when a server invoke is attempted before the hub
 * is ready. The page layer catches this and shows a friendly toast
 * instead of the cryptic underlying SignalR error.
 */
export class HubNotReadyError extends Error {
  constructor(public readonly state: GameHubState, message?: string) {
    super(message ?? `Game hub is ${state}`)
    this.name = 'HubNotReadyError'
  }
}
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
  JokePushed,
  JokeReactionsUpdated,
  JokeRevealed,
  JokeFinalStat,
  JokeReactionType,
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

  // Surfaceable connection state — drives the UI's connection badge
  // and Start button guards. Mirror of the ref's underlying state but
  // React-friendly (triggers re-renders).
  const [hubState, setHubState] = useState<GameHubState>('disconnected')

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

    // ─── Jokes-mode event handlers ──────────────────────────────
    // Same defensive pattern — bail on malformed payload, fold the
    // rest into the store via getState() so the latest store action
    // wins (not a stale closure-captured one).
    hub.on('JokePushed', (j: JokePushed) => {
      if (!j?.id) return
      useGameStore.getState().applyJokePushed(j)
    })

    hub.on('ReactionsUpdated', (u: JokeReactionsUpdated) => {
      if (!u?.jokeId) return
      useGameStore.getState().applyReactionsUpdated(u)
    })

    hub.on('JokeRevealed', (r: JokeRevealed) => {
      if (!r?.jokeId) return
      useGameStore.getState().applyJokeRevealed(r)
    })

    hub.on('JokesFinished', (payload: {
      finalStats: JokeFinalStat[]
      reason?: string
    }) => {
      useGameStore.getState().applyJokesFinished(payload?.finalStats ?? [])
      if (payload?.reason) {
        showToast({
          type: 'info',
          title: 'Jokes finished',
          message: payload.reason,
          duration: 4000,
        })
      }
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
      setHubState('connecting')
      showToast({
        type: 'warning',
        title: 'Reconnecting',
        message: 'Trying to restore the game connection…',
        duration: 2500,
      })
    })

    hub.onreconnected(async () => {
      setHubState('connected')
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

    // onclose covers the case where the hub gives up reconnecting OR
    // where the initial start() succeeded but the socket dropped soon
    // after. Without this, hubState would lie about being 'connected'.
    hub.onclose(() => { setHubState('disconnected') })

    setHubState('connecting')
    connectionPromiseRef.current = hub.start().then(() => {
      connectionRef.current = hub
      setHubState('connected')
    }).catch((err) => {
      console.error('[useGameHub] connect failed', err)
      connectionPromiseRef.current = null
      setHubState('failed')
      throw err
    })

    return connectionPromiseRef.current
  }, [token, showToast])

  // Server-call wrappers. Each one ensures the connection is up before
  // invoking. If the connect attempt fails (e.g. /hubs/game endpoint
  // isn't deployed yet) we throw a typed HubNotReadyError so the page
  // layer can show a friendly toast instead of leaking the raw SignalR
  // "WebSocket failed to connect" message into the UI.

  const ensureConnected = useCallback(async () => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) return
    try {
      await connect()
    } catch (err) {
      throw new HubNotReadyError(
        'failed',
        'Game server is not reachable. Please wait or refresh the page.',
      )
    }
    // Double-check — connect() resolved but the socket may have closed
    // immediately (e.g. server kicked us). Don't proceed to invoke().
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      throw new HubNotReadyError('disconnected', 'Connection dropped before invoke.')
    }
  }, [connect])

  const joinRoom = useCallback(async (slug: string) => {
    await ensureConnected()
    useGameStore.getState().setActiveSlug(slug)
    await connectionRef.current!.invoke('JoinRoom', slug)
  }, [ensureConnected])

  const leaveRoom = useCallback(async (slug: string) => {
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      // Already gone — just clear the store so the page can navigate cleanly.
      useGameStore.getState().resetRoom()
      return
    }
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

  /**
   * Submit a joke reaction. Last-write-wins so players can change
   * their pick until the deadline. Optimistically updates the
   * `myReaction` store key so the UI confirms instantly without
   * waiting for the server's ack roundtrip.
   */
  const submitReaction = useCallback(async (
    slug: string, jokeId: string, reaction: JokeReactionType,
  ) => {
    await ensureConnected()
    useGameStore.getState().markReacted(reaction)
    await connectionRef.current!.invoke('ReactToJoke', slug, jokeId, reaction)
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
    /** Current connection state — bind to UI for indicators / button guards. */
    hubState,
    connect,
    joinRoom,
    leaveRoom,
    startQuiz,
    submitAnswer,
    sendChat,
    submitReaction,
  }
}
