import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { usePersonaStore } from '../stores/personaStore'
import type {
  PersonaCard,
  StreakRow,
  PersonaMessage,
  PersonaMessageReceivedEvent,
  StreakUnmaskedEvent,
} from '../types/persona'

// ============================================================
//  usePersonaHub — singleton SignalR client for /hubs/persona.
//
//  Same shape as useTimeCapsuleHub: one shared WebSocket per tab,
//  ref-counted, push-event listeners owned by the hook (so any
//  consumer triggers the same store update).
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/persona'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

// ── Server response shapes (anonymous DTOs from PersonaHub.cs).
interface StreaksResponse  { count: number; streaks: StreakRow[] }
interface DiscoverResponse { count: number; personas: PersonaCard[] }
interface ThreadResponse   { count: number; messages: PersonaMessage[] }
interface UnmaskResponse   {
  ok: boolean
  reason?: string
  consecutiveDays?: number
  myRequested?: boolean
  bothRequested?: boolean
}

export function usePersonaHub() {
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

    // ─── Server push: a new persona-DM landed on this user.
    hub.on('PersonaMessageReceived', (payload: PersonaMessageReceivedEvent) => {
      if (!payload?.id) return
      const store = usePersonaStore.getState()
      // Look up which thread this belongs to: the message's
      // senderPersonaId IS the otherPersonaId from the recipient's
      // perspective. That's the key the local store uses.
      store.appendToThread(payload.senderPersonaId, payload)
      showToast({
        type: 'info',
        title: `💭 ${payload.senderDisplayName}`,
        message: payload.content.length > 80
          ? payload.content.slice(0, 77) + '…'
          : payload.content,
        duration: 5000,
      })
    })

    // ─── Server push: a streak handshake just completed.
    hub.on('StreakUnmasked', (payload: StreakUnmaskedEvent) => {
      if (!payload?.streakId) return
      usePersonaStore.getState().applyStreakUnmasked(payload.streakId)
      showToast({
        type: 'success',
        title: '✨ You\'ve been unmasked',
        message: 'A streak just revealed both real identities. Check your streaks.',
        duration: 7000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[PersonaHub] connect failed', err)
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

  // ── Invocation wrappers ─────────────────────────────────────

  async function ensureConnected() {
    if (sharedConnectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (sharedConnectionPromiseRef.current) {
      try { await sharedConnectionPromiseRef.current } catch { /* surface below */ }
    } else {
      await connect()
    }
    if (sharedConnectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Persona service is offline. Try again in a moment.')
    }
  }

  const getMyPersona = async (): Promise<PersonaCard> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<PersonaCard>('GetMyPersona')
  }

  const getActiveStreaks = async (): Promise<StreaksResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<StreaksResponse>('GetActiveStreaks')
  }

  const discoverPersonas = async (): Promise<DiscoverResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<DiscoverResponse>('DiscoverPersonas')
  }

  const sendPersonaMessage = async (
    toPersonaId: string,
    content:     string,
  ): Promise<PersonaMessage> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<PersonaMessage>(
      'SendPersonaMessage', toPersonaId, content,
    )
  }

  const getThreadWithPersona = async (otherPersonaId: string): Promise<ThreadResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ThreadResponse>(
      'GetThreadWithPersona', otherPersonaId,
    )
  }

  const requestMutualUnmask = async (streakId: string): Promise<UnmaskResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<UnmaskResponse>(
      'RequestMutualUnmask', streakId,
    )
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    getMyPersona,
    getActiveStreaks,
    discoverPersonas,
    sendPersonaMessage,
    getThreadWithPersona,
    requestMutualUnmask,
  }
}
