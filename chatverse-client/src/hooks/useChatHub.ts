import { useEffect, useRef, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useDmStore, type DmMessage } from '../stores/dmStore'
import { useCallStore } from '../stores/callStore'
import { usePollsStore } from '../stores/pollsStore'
import type { Message } from '../types'
import type {
  AmbientQuestion,
  RollingQuizQuestion,
  RollingQuizRevealed,
  RollingQuizLeaderboard,
  RollingQuizScored,
} from '../types/games'
import type { PollDto } from '../types/polls'

const HUB_URL = (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api').replace('/api', '') + '/hubs/chat'

let globalLastWarnedScore: number | null = null

// ────────────────────────────────────────────────────────────────────
// SINGLETON SignalR CONNECTION
// ────────────────────────────────────────────────────────────────────
// Before this, every component calling `useChatHub()` got its OWN
// `connectionRef`, which meant the hook spun up a SEPARATE WebSocket
// per consumer. The captions feature exposed this brutally — when
// DirectCallPage + useCaptions + useCaptionBroadcaster + useYouTubeSync
// all called useChatHub independently, we ended up with FOUR concurrent
// connections to the same backend. JoinCaptionRoom fired on one
// connection but IncomingCaption listeners were attached to another →
// captions silently dropped. Worse, each cleanup ran `.stop()` on its
// own connection, which often killed the one the rest of the UI was
// still using → "site crash" symptom.
//
// Fix: module-level shared state. Every useChatHub instance reads from
// the same `sharedConnectionRef`. A ref count tracks active consumers
// so we only tear the connection down when the LAST one unmounts.
//
// Event handlers are still attached/detached per-instance via conn.on /
// conn.off — that's fine, multiple handlers for the same event coexist.
const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useChatHub() {
  // Aliases that match the old per-instance ref names so the rest of
  // the hook body stays readable.
  const connectionRef = sharedConnectionRef
  const connectionPromiseRef = sharedConnectionPromiseRef
  // React state mirror of the underlying SignalR connection. The ref
  // alone isn't enough because React doesn't re-render on ref mutation
  // — without this, consumers calling `isConnected()` get a stale
  // `false` forever and the "Connecting…" loader never goes away even
  // though the websocket is open (101 Switching Protocols).
  //
  // With the singleton refactor: each useChatHub instance subscribes to
  // the shared broadcast so all consumers re-render together when the
  // connection state changes. Initial value reflects the live ref so
  // late-mounted consumers don't get a misleading "Disconnected" flash.
  const [connState, setLocalConnState] = useState<signalR.HubConnectionState>(
    sharedConnectionRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )
  // Wrapper that updates both this instance AND broadcasts to all
  // other subscribers — so the in-flight connect() calls only need to
  // call setConnState() once and every instance re-renders.
  const setConnState = useCallback((s: signalR.HubConnectionState) => {
    setLocalConnState(s)
    broadcastConnState(s)
  }, [])
  // Subscribe to the broadcast so events fired from OTHER instances
  // (or from SignalR lifecycle callbacks) reach this hook too.
  useEffect(() => {
    const sub = (s: signalR.HubConnectionState) => setLocalConnState(s)
    sharedStateSubscribers.add(sub)
    return () => { sharedStateSubscribers.delete(sub) }
  }, [])

  const token = useAuthStore((s) => s.token)
  const {
    addMessage, updateMsgStatus, updateMsgReactions, removeMessage,
    setMessages, setOnlineCount, setTyping,
  } = useChatStore()
  const { showToast } = useToastStore()

  const connect = useCallback(async () => {
    if (!token) return
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (connectionPromiseRef.current) return connectionPromiseRef.current

    // Reflect "we're trying to connect" in state so the UI loader knows
    // a handshake is in flight. Set BEFORE the build/start so the first
    // paint after this effect already shows the Connecting loader.
    setConnState(signalR.HubConnectionState.Connecting)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${token}`, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .build()

    // ── Lifecycle bridges from SignalR → React state.
    //    Without these, the ref-only mutation in `.then()` below would
    //    never trigger a re-render and consumers calling isConnected()
    //    would see `false` forever.
    hub.onreconnecting(() => {
      setConnState(signalR.HubConnectionState.Reconnecting)
    })
    hub.onreconnected(() => {
      setConnState(signalR.HubConnectionState.Connected)
    })
    hub.onclose(() => {
      setConnState(signalR.HubConnectionState.Disconnected)
    })

    hub.on('ReceiveMessage', (msg: Message) => { if (msg.modStatus !== 'blocked') addMessage(msg.roomId, msg) })
    hub.on('RoomHistory', ({ roomSlug, messages }: { roomSlug: string; messages: Message[] }) => {
      const clean = [...messages].reverse().filter((m) => m.modStatus !== 'blocked')
      setMessages(roomSlug, clean)
    })
    hub.on('MessageBlocked', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) removeMessage(slug, messageId)
      showToast({ type: 'danger', title: '🚫 Blocked', message: 'Message removed.', duration: 5000 })
    })
    hub.on('MessageFlagged', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) updateMsgStatus(slug, messageId, 'flagged')
    })
    // Reactions — the server broadcasts the full authoritative reactions
    // map after each toggle. We scan all loaded rooms and update wherever
    // we find the message id (it lives in exactly one slug, but we don't
    // know which without a room hint in the payload).
    hub.on('MessageReaction', (payload: {
      messageId: string
      reactions?: Record<string, string[]>
    }) => {
      if (!payload?.messageId || !payload.reactions) return
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) {
        if (rooms[slug].some((m) => m.id === payload.messageId)) {
          updateMsgReactions(slug, payload.messageId, payload.reactions)
        }
      }
    })
    hub.on('TrustWarning', ({ score }: { score: number }) => {
      const auth = useAuthStore.getState()
      if (globalLastWarnedScore !== score && score < (auth.user?.trustScore ?? 100)) {
        globalLastWarnedScore = score
        showToast({ type: 'warning', title: '⚠️ Score dropped', message: `Score: ${score}/100`, duration: 5000 })
      }
    })
    hub.on('UserTyping', ({ username }: { username: string }) => {
      const activeRoom = useChatStore.getState().activeRoom
      if (activeRoom) setTyping(activeRoom, username)
    })
    hub.on('UserJoined', ({ activeCount, roomSlug }: any) => setOnlineCount(roomSlug, activeCount))
    hub.on('UserLeft', ({ activeCount, roomSlug }: any) => setOnlineCount(roomSlug, activeCount))
    hub.on('Error', (msg: string) => showToast({ type: 'error', title: 'Error', message: msg, duration: 4000 }))

    // ─── Ambient question ticker ──────────────────────────────
    // The server pushes one of these to gameable rooms (Gaming
    // Lounge / Mini Game) every few minutes. The room slug is the
    // SignalR group it lands in, so we resolve it from the active
    // room — but only update if the user is actually IN that room.
    // For other rooms it's a no-op until they navigate there.
    hub.on('AmbientQuestion', (q: AmbientQuestion) => {
      if (!q?.id) return
      const activeRoom = useChatStore.getState().activeRoom
      if (activeRoom) useChatStore.getState().setAmbientQuestion(activeRoom, q)
    })

    // ─── Rolling Quiz (#general only) ──────────────────────────
    // The server pushes these only to the "general" SignalR group,
    // so we don't need to filter by activeRoom here — the channel
    // membership already handles that.
    hub.on('RollingQuizQuestion', (q: RollingQuizQuestion) => {
      if (!q?.id) return
      useChatStore.getState().setRollingQuizQuestion(q)
    })
    hub.on('RollingQuizRevealed', (r: RollingQuizRevealed) => {
      if (!r?.questionId) return
      useChatStore.getState().setRollingQuizReveal(r)
    })
    hub.on('RollingQuizLeaderboard', (b: RollingQuizLeaderboard) => {
      if (!b) return
      useChatStore.getState().setRollingQuizBoard(b)
    })
    hub.on('RollingQuizScored', (s: RollingQuizScored) => {
      if (!s?.userId) return
      useChatStore.getState().pushRollingQuizScored(s)
    })
    hub.on('RollingQuizAck', (ack: {
      accepted: boolean; reason?: string; isCorrect?: boolean; choiceIndex?: number
    }) => {
      // The submit method already set an optimistic record; here we
      // just update the isCorrect flag for the colour reveal.
      const current = useChatStore.getState().rollingQuizMyAnswer
      if (!current) return
      if (!ack.accepted) {
        // Roll back the local optimistic update if the server rejected.
        useChatStore.getState().setRollingQuizMyAnswer(null)
        if (ack.reason) {
          showToast({
            type: 'warning',
            title: 'Answer rejected',
            message: ack.reason,
            duration: 2500,
          })
        }
        return
      }
      useChatStore.getState().setRollingQuizMyAnswer({
        questionId: current.questionId,
        choiceIndex: current.choiceIndex,
        isCorrect: ack.isCorrect,
      })
    })

    // ─── DM events ────────────────────────────────────────────
    hub.on('ReceiveDm', (msg: DmMessage) => {
      const me = useAuthStore.getState().user?.userId
      if (!me) return
      const dm = useDmStore.getState()
      const otherUserId = msg.senderId === me ? msg.recipientId : msg.senderId
      dm.appendToThread(otherUserId, msg)
      dm.upsertConversationFromMessage(msg, me)
    })

    hub.on('DmTyping', ({ conversationId, senderName }: { conversationId: string; senderName: string }) => {
      useDmStore.getState().setTyping(conversationId, senderName)
    })

    hub.on('DmRead', ({ readerId }: { conversationId: string; readerId: string }) => {
      void readerId
    })

    // ─── Direct-call invite events (GLOBAL — not page-scoped) ─
    // Without these here, an invite that arrives while the user is on
    // /chat or /profile or anywhere outside the DirectCallPage simply
    // gets swallowed and the recipient has no idea they were called.
    //
    // Writes to useCallStore so a single global <IncomingCallModal>
    // mounted in AppLayout can render the ringing UI regardless of
    // route.
    hub.on('IncomingCall', (payload: {
      inviteId: string
      callerId: string
      callerName: string
      roomName: string
      message?: string
      expiresInSeconds?: number
    }) => {
      useCallStore.getState().setIncoming({
        inviteId: payload.inviteId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        roomName: payload.roomName,
        message: payload.message,
        receivedAt: Date.now(),
      })

      // Multi-call beep cap — if more than 1 already ringing, don't
      // try a second OS notification; one is enough.

      // Desktop notification (only if user has granted permission).
      // No-op on mobile / when permission denied.
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification(`Incoming call from ${payload.callerName}`, {
            body: payload.message || 'Tap to answer',
            icon: '/favicon.svg',
            tag: `incoming-call-${payload.inviteId}`,
            requireInteraction: false,
          })
          // Clicking the OS notification focuses the tab so the user
          // can hit Accept/Decline in the in-app modal.
          n.onclick = () => { window.focus(); n.close() }
        }
      } catch { /* notifications are best-effort */ }
    })

    // BlockedCallAttempt — fired when someone you've blocked tries to
    // ring you. No full-screen modal, just a silent log entry surfaced
    // as a toast so you know they tried but isn't disruptive.
    hub.on('BlockedCallAttempt', (a: {
      callerId: string
      callerName: string
      attemptedAt: string
      message?: string
    }) => {
      useCallStore.getState().pushBlockedAttempt({
        callerId: a.callerId,
        callerName: a.callerName,
        attemptedAt: Date.parse(a.attemptedAt) || Date.now(),
        message: a.message,
      })
      showToast({
        type: 'info',
        title: 'Blocked caller',
        message: `${a.callerName} tried to call you.`,
        duration: 3500,
      })
    })

    // Caller receives this when the OTHER party accepts — IncomingCallModal
    // or DirectCallPage uses this to navigate into the live call.
    hub.on('CallAccepted', ({ inviteId, roomName }: { inviteId: string; roomName: string }) => {
      window.dispatchEvent(new CustomEvent('chatverse:call-accepted', { detail: { inviteId, roomName } }))
    })

    hub.on('CallDeclined', ({ inviteId }: { inviteId: string }) => {
      window.dispatchEvent(new CustomEvent('chatverse:call-declined', { detail: { inviteId } }))
      showToast({ type: 'info', title: 'Call declined', message: 'The other person didn\'t pick up.', duration: 4000 })
    })

    hub.on('CallInviteSent', ({ inviteId, targetUserId, roomName }: { inviteId: string; targetUserId: string; roomName: string }) => {
      window.dispatchEvent(new CustomEvent('chatverse:call-invite-sent', { detail: { inviteId, targetUserId, roomName } }))
    })

    hub.on('CallError', ({ reason }: { reason: string }) => {
      const msg = reason === 'expired_or_invalid' ? 'Call invite expired' : 'Call failed'
      showToast({ type: 'error', title: 'Call error', message: msg, duration: 4000 })
    })

    // ── In-room polls (parity polish) ───────────────────────────
    // ChatHub fans all three lifecycle events to the room SignalR
    // group. We mirror them into pollsStore so any open ChatPage
    // re-renders without polling.
    hub.on('PollCreated', (p: PollDto) => {
      if (!p?.id || !p?.roomSlug) return
      usePollsStore.getState().upsertPoll(p)
    })
    hub.on('PollUpdated', (p: PollDto) => {
      if (!p?.id || !p?.roomSlug) return
      usePollsStore.getState().upsertPoll(p)
    })
    hub.on('PollClosed', (p: PollDto) => {
      if (!p?.id || !p?.roomSlug) return
      usePollsStore.getState().closePoll(p)
    })

    const startPromise = hub.start()
      .then(() => {
        connectionRef.current = hub
        // Critical: flip React state so consumers re-render and the
        // Connecting loader unmounts in favour of the real input.
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch(() => {
        connectionRef.current = null
        setConnState(signalR.HubConnectionState.Disconnected)
      })
      .finally(() => { connectionPromiseRef.current = null })

    connectionPromiseRef.current = startPromise
    return startPromise
  }, [token])

  const disconnect = useCallback(async () => {
    if (connectionPromiseRef.current) {
      try { await connectionPromiseRef.current } catch { /* ignore */ }
    }
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }
    setConnState(signalR.HubConnectionState.Disconnected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ref-counted mount/unmount. ONLY the last consumer to leave actually
  // tears the connection down. Without this, mounting a feature hook
  // (captions, YT sync) and then unmounting it would kill the main
  // app's connection too — even though many other components still
  // hold a useChatHub.
  useEffect(() => {
    sharedConsumerCount += 1
    connect()
    return () => {
      sharedConsumerCount -= 1
      if (sharedConsumerCount <= 0) {
        sharedConsumerCount = 0
        disconnect()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Smart + silent auto-reconnect — quiet for ambient calls */
  const safeInvoke = async (method: string, ...args: any[]) => {
    try {
      if (connectionRef.current?.state === signalR.HubConnectionState.Disconnected) {
        await connect()
      } else if (!connectionRef.current && connectionPromiseRef.current) {
        await connectionPromiseRef.current
      } else if (!connectionRef.current) {
        await connect()
      }

      if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
        await connectionRef.current.invoke(method, ...args)
      } else if (method !== 'JoinRoom' && method !== 'LeaveRoom' && method !== 'SendTyping' && method !== 'SendDmTyping') {
        showToast({ type: 'error', title: 'Network issue', message: 'Reconnecting to chat…', duration: 2000 })
      }
    } catch (err) {
      console.error(`[ChatHub] Action ${method} failed:`, err)
      if (method !== 'JoinRoom' && method !== 'LeaveRoom' && method !== 'SendTyping' && method !== 'SendDmTyping') {
        showToast({ type: 'error', title: 'Action failed', message: 'Could not complete request.', duration: 2000 })
      }
    }
  }

  return {
    getConnection: () => connectionRef.current,
    joinRoom: (slug: string) => safeInvoke('JoinRoom', slug),
    leaveRoom: (slug: string) => safeInvoke('LeaveRoom', slug),
    sendMessage: (slug: string, content: string, type = 'text', mediaUrl: string | null = null, replyToId?: string) =>
      safeInvoke('SendMessage', slug, content, type, mediaUrl, replyToId ?? null),
    sendTyping: (slug: string) => safeInvoke('SendTyping', slug),
    reactToMessage: (slug: string, messageId: string, emoji: string) => safeInvoke('ReactToMessage', slug, messageId, emoji),
    sendDm: (recipientId: string, content: string) => safeInvoke('SendDm', recipientId, content),
    sendDmTyping: (recipientId: string) => safeInvoke('SendDmTyping', recipientId),
    markDmRead: (otherUserId: string) => safeInvoke('MarkDmRead', otherUserId),

    // ── Direct-call helpers ─────────────────────────────────────
    inviteToCall: (targetUserId: string, message?: string) =>
      safeInvoke('InviteToCall', targetUserId, message ?? null),
    acceptCall: (inviteId: string) => safeInvoke('AcceptCall', inviteId),
    declineCall: (inviteId: string) => safeInvoke('DeclineCall', inviteId),

    // ── Rolling quiz (#general) ─────────────────────────────────
    // Submit lock-in: store the optimistic choice locally so the UI
    // greys out the buttons before the server ack lands. The server's
    // RollingQuizAck event upgrades the record with isCorrect.
    submitRollingQuizAnswer: (questionId: string, choiceIndex: number) => {
      useChatStore.getState().setRollingQuizMyAnswer({ questionId, choiceIndex })
      return safeInvoke('SubmitRollingQuizAnswer', questionId, choiceIndex)
    },
    getRollingQuizState: () => safeInvoke('GetRollingQuizState'),

    // ── In-room polls (parity polish) ───────────────────────────
    // CreatePoll returns the new pollId; GetActivePollsForRoom returns
    // a fresh array. Both bypass safeInvoke because we want the result.
    createPoll: async (
      slug: string, question: string, options: string[],
      durationSeconds: number, multiSelect: boolean, anonymous: boolean,
    ): Promise<string | null> => {
      if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) {
        await connect()
      }
      if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) return null
      try {
        const id = await connectionRef.current.invoke<string | null>(
          'CreatePoll', slug, question, options, durationSeconds, multiSelect, anonymous,
        )
        return id
      } catch (err: any) {
        const msg = String(err?.message ?? '')
        showToast({
          type: 'error',
          title: 'Poll failed',
          message: msg.length > 0 && msg.length < 120 ? msg : 'Could not create the poll.',
          duration: 3000,
        })
        return null
      }
    },
    votePoll: (pollId: string, optionIndex: number) =>
      safeInvoke('Vote', pollId, optionIndex),
    closePoll: (pollId: string) => safeInvoke('ClosePoll', pollId),
    getActivePollsForRoom: async (slug: string): Promise<PollDto[]> => {
      if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) return []
      try {
        const rows = await connectionRef.current.invoke<PollDto[]>('GetActivePollsForRoom', slug)
        return Array.isArray(rows) ? rows : []
      } catch {
        return []
      }
    },

    // Read from React state — calling consumers re-render when this
    // flips. The ref check (`connectionRef.current?.state`) was the
    // root of the "Connecting… 95%" stuck-forever bug because mutating
    // a ref doesn't tell React anything changed.
    isConnected: () => connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    safeInvoke,
  }
}
