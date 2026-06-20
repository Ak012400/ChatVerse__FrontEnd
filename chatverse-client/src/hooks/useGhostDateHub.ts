import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useGhostDateStore } from '../stores/ghostDateStore'
import type {
  GhostDateRegistration,
  ActiveGhostDate,
  MyStatusResponse,
  ThreadResponse,
  HistoryResponse,
  GhostDateMessage,
  GhostDateMatchedEvent,
  GhostDateMessageEvent,
  GhostDateEndedEvent,
  GhostDateOutcomeEvent,
} from '../types/ghostDate'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/ghost-date'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useGhostDateHub() {
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

    // ─── Server push: pairing service just matched me with someone.
    hub.on('GhostDateMatched', (payload: GhostDateMatchedEvent) => {
      if (!payload?.dateId) return
      useGhostDateStore.getState().setActiveDate({
        id:               payload.dateId,
        scheduledFor:     payload.scheduledFor,
        expiresAt:        payload.expiresAt,
        decisionDeadline: payload.decisionDeadline,
        theirDisplay:     'Voyager',
        myDecision:       null,
        theirDecided:     false,
        outcome:          null,
      })
      showToast({
        type:     'success',
        title:    '🌙  Your ghost date just started',
        message:  'Anonymous text — 30 minutes. Open Ghost Date.',
        duration: 7000,
      })
    })

    hub.on('GhostDateMessage', (payload: GhostDateMessageEvent) => {
      if (!payload?.id) return
      useGhostDateStore.getState().appendMessage(payload)
    })

    hub.on('GhostDateEnded', (payload: GhostDateEndedEvent) => {
      if (!payload?.dateId) return
      // Just nudge the user — the page reads activeDate and pivots to
      // the decision view based on now > expiresAt.
      showToast({
        type:     'info',
        title:    '🕯  The chat just ended',
        message:  'You have 5 minutes to decide: reveal or pass.',
        duration: 8000,
      })
    })

    hub.on('GhostDateOutcome', (payload: GhostDateOutcomeEvent) => {
      if (!payload?.id) return
      useGhostDateStore.getState().applyOutcome(
        payload.id, payload.outcome, payload.theirDisplay,
      )
      const titles: Record<typeof payload.outcome, string> = {
        mutual_reveal: '✨  Both said yes — meet your match',
        bittersweet:   '🌒  Bittersweet ending',
        mutual_pass:   '👻  You both passed — the system remembers',
        expired:       '⏳  Decision window passed',
      }
      const messages: Record<typeof payload.outcome, string> = {
        mutual_reveal: `${payload.theirDisplay} stepped out of the shadows.`,
        bittersweet:   'One of you said yes, the other passed. No reveal either way.',
        mutual_pass:   'No reveal — but if you both opt in again in a couple of months, the system may pair you again.',
        expired:       'At least one of you missed the 5-min window.',
      }
      showToast({
        type:     payload.outcome === 'mutual_reveal' ? 'success' : 'info',
        title:    titles[payload.outcome],
        message:  messages[payload.outcome],
        duration: 9000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[GhostDateHub] connect failed', err)
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

  async function ensureConnected() {
    if (sharedConnectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (sharedConnectionPromiseRef.current) {
      try { await sharedConnectionPromiseRef.current } catch { /* surface below */ }
    } else {
      await connect()
    }
    if (sharedConnectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      throw new Error('Ghost Date service is offline. Try again in a moment.')
    }
  }

  const register      = async (): Promise<GhostDateRegistration> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<GhostDateRegistration>('Register')
  }
  const withdraw      = async (): Promise<GhostDateRegistration> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<GhostDateRegistration>('Withdraw')
  }
  const getMyStatus   = async (): Promise<MyStatusResponse> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<MyStatusResponse>('GetMyStatus')
  }
  const getActiveDate = async (): Promise<ActiveGhostDate> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<ActiveGhostDate>('GetActiveDate')
  }
  const sendMessage   = async (content: string): Promise<GhostDateMessage> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<GhostDateMessage>('SendMessage', content)
  }
  const getThread     = async (): Promise<ThreadResponse> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<ThreadResponse>('GetThread')
  }
  const submitDecision = async (dateId: string, reveal: boolean): Promise<ActiveGhostDate> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<ActiveGhostDate>('SubmitDecision', dateId, reveal)
  }
  const getMyHistory  = async (): Promise<HistoryResponse> => {
    await ensureConnected()
    return sharedConnectionRef.current!.invoke<HistoryResponse>('GetMyHistory')
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    register, withdraw, getMyStatus, getActiveDate,
    sendMessage, getThread, submitDecision, getMyHistory,
  }
}
