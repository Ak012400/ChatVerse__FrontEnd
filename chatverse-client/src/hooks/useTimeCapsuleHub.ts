import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useTimeCapsuleStore } from '../stores/timeCapsuleStore'
import type {
  InboxCapsule,
  SentCapsule,
  ComposeCapsuleInput,
  TimeCapsuleDeliveredEvent,
  TimeCapsuleReplyDeliveredEvent,
} from '../types/timeCapsule'

// ============================================================
//  useTimeCapsuleHub — SignalR client for /hubs/time-capsule.
//
//  Mirrors the singleton pattern from useChatHub: ONE shared
//  WebSocket per browser tab, ref-counted, so mounting the hook
//  at AppLayout (for toasts) and again on TimeCapsulePage (for
//  invocations) doesn't spin up duplicate connections.
//
//  Key difference vs useChatHub: this hub's invocations RETURN
//  data (WriteCapsule → string id, GetMyInbox → list, etc).
//  We expose those returns rather than fire-and-forget.
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/time-capsule'

// ── Shared singleton state. See useChatHub.ts for the rationale.
const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

// ── Server-event payload shape returned by GetMyInbox/GetMySent.
//   Hub returns anonymous object — we mirror it here so TS catches
//   field renames on either side.
interface InboxResponse { count: number; capsules: InboxCapsule[] }
interface SentResponse  { count: number; capsules: SentCapsule[] }

export function useTimeCapsuleHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()

  const [connState, setLocalConnState] = useState<signalR.HubConnectionState>(
    sharedConnectionRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )

  const setConnState = useCallback((s: signalR.HubConnectionState) => {
    setLocalConnState(s)
    broadcastConnState(s)
  }, [])

  useEffect(() => {
    const sub = (s: signalR.HubConnectionState) => setLocalConnState(s)
    sharedStateSubscribers.add(sub)
    return () => { sharedStateSubscribers.delete(sub) }
  }, [])

  const connect = useCallback(async () => {
    if (!token) return
    if (sharedConnectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (sharedConnectionPromiseRef.current) return sharedConnectionPromiseRef.current

    setConnState(signalR.HubConnectionState.Connecting)

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${token}`, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .build()

    hub.onreconnecting(() => setConnState(signalR.HubConnectionState.Reconnecting))
    hub.onreconnected(() => setConnState(signalR.HubConnectionState.Connected))
    hub.onclose(()        => setConnState(signalR.HubConnectionState.Disconnected))

    // ─── Server-push: a fresh capsule has landed in your inbox.
    hub.on('TimeCapsuleDelivered', (payload: TimeCapsuleDeliveredEvent) => {
      if (!payload?.id) return
      // Build an InboxCapsule from the event so the store stays the
      // single source of truth — page just reads, no extra fetch.
      const item: InboxCapsule = {
        id:           payload.id,
        content:      payload.content,
        type:         payload.type,
        mediaUrl:     payload.mediaUrl,
        deliveryDays: payload.deliveryDays,
        authorName:   payload.authorName,
        deliveredAt:  payload.deliveredAt,
        canReply:     true,
        repliedAt:    null,
      }
      const store = useTimeCapsuleStore.getState()
      store.prependInbox(item)
      store.bumpUnread()

      showToast({
        type:     'info',
        title:    '⏳ A time capsule arrived',
        message:  payload.authorName
          ? `From ${payload.authorName} — open your time capsule to read it.`
          : 'From an anonymous voyager — open your time capsule to read it.',
        duration: 6000,
      })
    })

    // ─── Server-push: a recipient's reply finally caught up with the author.
    hub.on('TimeCapsuleReplyDelivered', (payload: TimeCapsuleReplyDeliveredEvent) => {
      if (!payload?.capsuleId) return
      useTimeCapsuleStore.getState().applyReplyDelivered(
        payload.capsuleId,
        payload.replyContent,
        payload.replyDeliveredAt,
      )
      showToast({
        type:     'success',
        title:    '💌 Reply to your capsule',
        message:  'Someone wrote back to a capsule you sent. Check your Sent tab.',
        duration: 6000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        // Surface only once — repeated reconnect attempts shouldn't spam.
        console.error('[TimeCapsuleHub] connect failed', err)
        sharedConnectionRef.current = null
        setConnState(signalR.HubConnectionState.Disconnected)
      })
      .finally(() => { sharedConnectionPromiseRef.current = null })

    sharedConnectionPromiseRef.current = startPromise
    return startPromise
  }, [token, setConnState, showToast])

  const disconnect = useCallback(async () => {
    if (sharedConnectionPromiseRef.current) {
      try { await sharedConnectionPromiseRef.current } catch { /* ignore */ }
    }
    if (sharedConnectionRef.current) {
      await sharedConnectionRef.current.stop()
      sharedConnectionRef.current = null
    }
    setConnState(signalR.HubConnectionState.Disconnected)
  }, [setConnState])

  // Ref-counted mount/unmount — see useChatHub for full reasoning.
  useEffect(() => {
    if (!token) return
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
  }, [token])

  // ── Invocation wrappers. These RETURN the server response (unlike
  //    the chat hub's fire-and-forget pattern) because the UI needs
  //    the new capsule id, the inbox list, etc.

  async function ensureConnected() {
    if (sharedConnectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (sharedConnectionPromiseRef.current) {
      try { await sharedConnectionPromiseRef.current } catch { /* will surface below */ }
    } else {
      await connect()
    }
    if (sharedConnectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Time capsule service is offline. Try again in a moment.')
    }
  }

  const writeCapsule = async (input: ComposeCapsuleInput): Promise<string> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<string>(
      'WriteCapsule',
      input.content,
      input.type,
      input.mediaUrl,
      input.deliveryDays,
      input.revealAuthor,
    )
  }

  const replyToCapsule = async (capsuleId: string, replyContent: string): Promise<boolean> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<boolean>(
      'ReplyToCapsule',
      capsuleId,
      replyContent,
    )
  }

  const getMyInbox = async (): Promise<InboxResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<InboxResponse>('GetMyInbox')
  }

  const getMySent = async (): Promise<SentResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<SentResponse>('GetMySent')
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    writeCapsule,
    replyToCapsule,
    getMyInbox,
    getMySent,
  }
}
