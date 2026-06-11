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
  ChessStateSnapshot,
  ChessMovePushed,
  JoinRequestDto,
  JoinRequestResolution,
  GameRoomInviteDto,
  ChessPlayerDisconnectedPayload,
  ChessPlayerReturnedPayload,
  ChessSeatTimedOutPayload,
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

    // ─── Chess event handlers ──────────────────────────────────────
    hub.on('ChessGameStarted', (snap: ChessStateSnapshot) => {
      if (!snap) return
      useGameStore.getState().applyChessSnapshot(snap)
    })
    hub.on('ChessStateSnapshot', (snap: ChessStateSnapshot) => {
      if (!snap) return
      useGameStore.getState().applyChessSnapshot(snap)
    })
    hub.on('ChessMovePushed', (move: ChessMovePushed) => {
      if (!move?.move) return
      useGameStore.getState().applyChessMove(move)
    })
    hub.on('ChessMoveAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (!accepted && reason) {
        showToast({ type: 'warning', title: 'Move rejected', message: reason, duration: 2500 })
      }
    })

    // ─── Join request events ──────────────────────────────────────
    hub.on('JoinRequested', (req: JoinRequestDto) => {
      if (!req?.id) return
      // Host's view: a new pending row appears in the requests panel.
      useGameStore.getState().applyJoinRequested(req)
      showToast({
        type: 'info',
        title: 'Join request',
        message: `${req.username} wants to join.`,
        duration: 4000,
      })
    })
    hub.on('JoinRequestResolved', (res: JoinRequestResolution) => {
      if (!res?.requestId) return
      useGameStore.getState().applyJoinResolved(res.requestId)
      // If this resolution was for THIS user, clear pending flag.
      // (We can't compare userIds without authStore here — we just
      // optimistically clear; the snapshot push after admission
      // will reset everything correctly anyway.)
      if (res.status === 'Approved' || res.status === 'Declined') {
        const pending = useGameStore.getState().joinRequestPending
        if (pending) {
          useGameStore.getState().setJoinRequestPending(false)
          if (res.status === 'Declined') {
            showToast({
              type: 'warning',
              title: 'Request declined',
              message: 'Host did not approve your join.',
              duration: 4000,
            })
          }
        }
        // Best-effort cleanup of the refresh-survival flag too. We
        // don't know for certain this resolution is OURS without
        // userIds; conservatively clear if the local pending was set.
        const slug = useGameStore.getState().activeSlug
        if (slug) {
          try { sessionStorage.removeItem(`cv:seat-pending:${slug}`) } catch { /* private mode */ }
          // CRITICAL: removeItem does NOT fire a 'storage' event in the
          // same tab, so PlayRoomPage's seatPending state never updated —
          // the "Request pending" pill kept spinning forever after the
          // host approved. Dispatch the same custom event SeatRequestAck
          // uses so the pill clears reactively.
          window.dispatchEvent(new CustomEvent('cv:seat-pending-changed', {
            detail: { slug, pending: false },
          }))
      }
    })
    hub.on('PendingRequests', (list: JoinRequestDto[]) => {
      useGameStore.getState().setPendingJoinRequests(list ?? [])
    })
    hub.on('JoinRequestAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (!accepted && reason) {
        showToast({ type: 'warning', title: 'Action rejected', message: reason, duration: 2500 })
      }
    })

    // ─── Director-mode + reconnect-grace events ───────────────────
    // ChessSeatChanged is just a fresh snapshot — same handler as
    // ChessGameStarted / ChessStateSnapshot. Keeps client logic simple.
    hub.on('ChessSeatChanged', (snap: ChessStateSnapshot) => {
      if (!snap) return
      useGameStore.getState().applyChessSnapshot(snap)
    })

    // Seated player disconnected — start the countdown banner.
    hub.on('ChessPlayerDisconnected', (payload: ChessPlayerDisconnectedPayload) => {
      if (!payload?.userId) return
      useGameStore.getState().markPlayerOffline(payload.userId, {
        username: payload.username,
        seatColor: payload.seatColor,
        atUtc: payload.atUtc,
        graceSeconds: payload.graceSeconds,
      })
      showToast({
        type: 'warning',
        title: `${payload.username} disconnected`,
        message: `${payload.seatColor} seat held for ${payload.graceSeconds}s.`,
        duration: 3000,
      })
    })

    // Player returned inside the grace window — dismiss banner.
    hub.on('ChessPlayerReturned', (payload: ChessPlayerReturnedPayload) => {
      if (!payload?.userId) return
      useGameStore.getState().clearPlayerOffline(payload.userId)
      showToast({
        type: 'success',
        title: 'Welcome back',
        message: `${payload.username} is back at the board.`,
        duration: 2000,
      })
    })

    // Grace expired — seat freed; snapshot reflects board reset if
    // the timeout happened mid-game.
    hub.on('ChessSeatTimedOut', (payload: ChessSeatTimedOutPayload) => {
      if (!payload?.userId) return
      useGameStore.getState().clearPlayerOffline(payload.userId)
      if (payload.snapshot) {
        useGameStore.getState().applyChessSnapshot(payload.snapshot)
      }
      showToast({
        type: 'info',
        title: 'Seat reset',
        message: `${payload.username}'s ${payload.seatColor} seat is open — host can assign a new player.`,
        duration: 4000,
      })
    })

    // Acks for director-mode seat ops + grace override
    hub.on('SeatAssignAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (!accepted && reason) {
        showToast({ type: 'warning', title: 'Seat change rejected', message: reason, duration: 2500 })
      }
    })
    hub.on('GraceOverrideAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (!accepted && reason) {
        showToast({ type: 'warning', title: 'Cannot skip wait', message: reason, duration: 2500 })
      }
    })

    // Seat-upgrade ack — spectator clicked "Request to play".
    // Cross-component signal: fire a custom window event instead of
    // letting consumers poll sessionStorage. Listeners update their
    // local state without a setInterval tax — async + reactive.
    hub.on('SeatRequestAck', ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
      if (accepted) {
        const slug = useGameStore.getState().activeSlug
        if (slug) {
          try { sessionStorage.setItem(`cv:seat-pending:${slug}`, '1') } catch { /* private mode */ }
          window.dispatchEvent(new CustomEvent('cv:seat-pending-changed', {
            detail: { slug, pending: true },
          }))
        }
        showToast({
          type: 'success',
          title: 'Request sent',
          message: reason ?? 'Waiting for host.',
          duration: 2500,
        })
      } else if (reason) {
        showToast({ type: 'warning', title: 'Cannot request seat', message: reason, duration: 2500 })
      }
    })

    // Incoming invite — host invited THIS user to a game
    hub.on('GameRoomInvite', (invite: GameRoomInviteDto) => {
      if (!invite?.inviteId) return
      // 1) Dispatch a window event so the global InviteListener
      //    (mounted in AppLayout) can render the toast banner.
      window.dispatchEvent(new CustomEvent('chatverse:game-invite', { detail: invite }))
      // 2) Also log it in the persistent notification center so the
      //    user can find it later if they dismissed the toast.
      try {
        const { useNotificationStore } = require('../stores/notificationStore') as
          typeof import('../stores/notificationStore')
        useNotificationStore.getState().add({
          type: 'game-invite',
          title: `${invite.fromUsername} invited you`,
          body: `${invite.type} · ${invite.roomName}`,
          payload: { ...invite },
        })
      } catch { /* notification store optional — never break invites if it errors */ }
    })
    hub.on('InviteSent', ({ inviteId, targetUserId }: { inviteId: string; targetUserId: string }) => {
      void inviteId; void targetUserId
      showToast({
        type: 'success', title: 'Invite sent',
        message: 'They\'ll get a notification.',
        duration: 2000,
      })
    })
    hub.on('InviteAck', ({ accepted, slug, reason }: { accepted: boolean; slug?: string; reason?: string }) => {
      if (accepted && slug) {
        // The component that called acceptInvite is responsible for
        // navigating to /play/{slug}; we just toast confirmation.
        showToast({ type: 'success', title: 'Joining…', message: '', duration: 1500 })
      } else if (reason) {
        showToast({ type: 'warning', title: 'Invite issue', message: reason, duration: 3000 })
      }
    })

    // Room was closed by the host (explicit EndRoom OR host leave).
    // Dispatch a window event so PlayRoomPage / any open room view
    // can react (navigate back to chat). We don't navigate from inside
    // the hook itself — the router isn't accessible here.
    hub.on('RoomClosed', (payload: { slug: string; reason?: string }) => {
      if (!payload?.slug) return
      window.dispatchEvent(new CustomEvent('cv:room-closed', { detail: payload }))
      showToast({
        type: 'info',
        title: 'Room closed',
        message: payload.reason ?? 'The host ended the room.',
        duration: 4000,
      })
      try {
        const { useNotificationStore } = require('../stores/notificationStore') as
          typeof import('../stores/notificationStore')
        useNotificationStore.getState().add({
          type: 'room-closed',
          title: 'Room closed',
          body: payload.reason ?? 'The host ended the room.',
          payload: { slug: payload.slug },
        })
      } catch { /* non-fatal */ }
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
    //
    // CRITICAL (#148): also clear both refs. connectionPromiseRef stays
    // resolved after a successful start, so without this reset every
    // later connect() short-circuits on the stale promise, ensureConnected
    // throws forever, and quiz answer clicks die silently until a full
    // page refresh.
    hub.onclose(() => {
      setHubState('disconnected')
      connectionRef.current = null
      connectionPromiseRef.current = null
    })

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
    try {
      await connectionRef.current!.invoke('SubmitAnswer', slug, questionId, choiceIndex)
    } catch (err) {
      // Invoke never reached the server → AnswerAck will never arrive.
      // Roll the optimistic lock back so the buttons re-enable and
      // rethrow so the page can toast (#148).
      useGameStore.getState().rollbackAnswer()
      throw err
    }
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
    const prevReaction = useGameStore.getState().myReaction
    useGameStore.getState().markReacted(reaction)
    try {
      await connectionRef.current!.invoke('ReactToJoke', slug, jokeId, reaction)
    } catch (err) {
      // Same rollback contract as submitAnswer (#148).
      useGameStore.getState().rollbackReaction(prevReaction)
      throw err
    }
  }, [ensureConnected])

  // ─── Chess methods ───────────────────────────────────────────────
  const submitChessMove = useCallback(async (
    slug: string, san: string, uci: string, fenAfter: string,
  ) => {
    await ensureConnected()
    await connectionRef.current!.invoke('SubmitChessMove', slug, san, uci, fenAfter)
  }, [ensureConnected])

  const resignChess = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('ResignChess', slug)
  }, [ensureConnected])

  const fetchChessState = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('GetChessState', slug)
  }, [ensureConnected])

  // ─── Join request methods ───────────────────────────────────────
  const fetchPendingRequests = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('GetPendingRequests', slug)
  }, [ensureConnected])

  const approveJoinRequest = useCallback(async (slug: string, requestId: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('ApproveJoinRequest', slug, requestId)
  }, [ensureConnected])

  const declineJoinRequest = useCallback(async (slug: string, requestId: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('DeclineJoinRequest', slug, requestId)
  }, [ensureConnected])

  // ─── Seat upgrade ───────────────────────────────────────────────
  const requestPlayerSeat = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('RequestPlayerSeat', slug)
  }, [ensureConnected])

  // ─── Invites ────────────────────────────────────────────────────
  const inviteToGameRoom = useCallback(async (targetUserId: string, slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('InviteToGameRoom', targetUserId, slug)
  }, [ensureConnected])

  const acceptInvite = useCallback(async (inviteId: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('AcceptInvite', inviteId)
  }, [ensureConnected])

  // Host explicitly ends the room — broadcasts RoomClosed to everyone
  // and drops the registry entry server-side.
  const endRoom = useCallback(async (slug: string) => {
    await ensureConnected()
    await connectionRef.current!.invoke('EndRoom', slug)
  }, [ensureConnected])

  // ─── Director-mode seat controls (host-only) ─────────────────────
  // color is sent as "White" / "Black" — backend Enum.TryParse handles it.
  const assignChessSeat = useCallback(async (
    slug: string, targetUserId: string, color: 'White' | 'Black',
  ) => {
    await ensureConnected()
    await connectionRef.current!.invoke('AssignChessSeat', slug, targetUserId, color)
  }, [ensureConnected])

  const unassignChessSeat = useCallback(async (
    slug: string, color: 'White' | 'Black',
  ) => {
    await ensureConnected()
    await connectionRef.current!.invoke('UnassignChessSeat', slug, color)
  }, [ensureConnected])

  /** Host's "Don't wait, reassign now" button — skips the remaining
   *  grace timer for a disconnected seated player. */
  const overrideGraceWait = useCallback(async (
    slug: string, targetUserId: string,
  ) => {
    await ensureConnected()
    await connectionRef.current!.invoke('OverrideGraceWait', slug, targetUserId)
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
    // Chess
    submitChessMove,
    resignChess,
    fetchChessState,
    // Join requests
    fetchPendingRequests,
    approveJoinRequest,
    declineJoinRequest,
    // Seat upgrade + invites
    requestPlayerSeat,
    inviteToGameRoom,
    acceptInvite,
    // Director mode + grace
    assignChessSeat,
    unassignChessSeat,
    overrideGraceWait,
    // Room lifecycle
    endRoom,
  }
}
