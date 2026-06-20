import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useLoveTriangleStore } from '../stores/loveTriangleStore'
import type {
  LoveTriangleRegistration,
  MyTriangle,
  PublicTriangle,
  MyStatusResponse,
  PublicTrianglesResponse,
  ExcerptsResponse,
  HistoryResponse,
  PairMessage,
  PairThread,
  PairKey,
  TriangleFormedEvent,
  PairMessageEvent,
  ExcerptSharedEvent,
  VotingOpenedEvent,
  TriangleCompletedEvent,
} from '../types/loveTriangle'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/love-triangle'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useLoveTriangleHub() {
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

    hub.on('TriangleFormed', (payload: TriangleFormedEvent) => {
      if (!payload?.triangleId) return
      showToast({
        type: 'success', title: '💕  Your triangle just formed',
        message: 'Three voyagers. Seven days. One winning pair.',
        duration: 8000,
      })
    })

    hub.on('PairMessage', (payload: PairMessageEvent) => {
      if (!payload?.message?.id) return
      useLoveTriangleStore.getState().appendPairMessage(payload.pairKey, payload.message)
    })

    hub.on('ExcerptShared', (payload: ExcerptSharedEvent) => {
      if (!payload?.excerpt?.id) return
      useLoveTriangleStore.getState().appendExcerpt(payload.triangleId, payload.excerpt)
      // Also flip the IsShared flag on my own thread view if I'm in
      // this pair (because someone else shared something I sent).
      useLoveTriangleStore.getState().applyExcerptToggle(
        payload.pairKey, payload.excerpt.id, true, false,
      )
    })

    hub.on('VotingOpened', (payload: VotingOpenedEvent) => {
      if (!payload?.triangleId) return
      useLoveTriangleStore.getState().applyVotingOpened(payload.triangleId)
      showToast({
        type: 'info', title: '🗳  Voting just opened',
        message: 'The audience has 24 hours to pick the winning pair.',
        duration: 7000,
      })
    })

    hub.on('TriangleCompleted', (payload: TriangleCompletedEvent) => {
      if (!payload?.triangleId) return
      useLoveTriangleStore.getState().applyCompleted(payload.triangleId, payload.winningPair)
      const label = payload.winningPair === 'tie' ? 'a tie'
        : payload.winningPair === 'no_votes' ? 'no clear winner'
        : payload.winningPair.toUpperCase()
      showToast({
        type: 'success', title: '🎬  Triangle just wrapped',
        message: `Winning pair: ${label}.`,
        duration: 7000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[LoveTriangleHub] connect failed', err)
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
      throw new Error('Love Triangle service is offline. Try again in a moment.')
    }
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    register: async (): Promise<LoveTriangleRegistration> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<LoveTriangleRegistration>('Register')
    },
    withdraw: async (): Promise<LoveTriangleRegistration> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<LoveTriangleRegistration>('Withdraw')
    },
    getMyStatus: async (): Promise<MyStatusResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MyStatusResponse>('GetMyStatus')
    },
    getMyTriangle: async (): Promise<MyTriangle> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MyTriangle>('GetMyTriangle')
    },
    getPairThread: async (pairKey: PairKey): Promise<{ pairKey: PairKey } & PairThread> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ pairKey: PairKey } & PairThread>('GetPairThread', pairKey)
    },
    sendPairMessage: async (pairKey: PairKey, content: string): Promise<PairMessage> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PairMessage>('SendPairMessage', pairKey, content)
    },
    toggleShareExcerpt: async (messageId: string): Promise<PairMessage> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PairMessage>('ToggleShareExcerpt', messageId)
    },
    getPublicTriangles: async (weekOffset = 0): Promise<PublicTrianglesResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PublicTrianglesResponse>('GetPublicTriangles', weekOffset)
    },
    getTriangleExcerpts: async (triangleId: string): Promise<ExcerptsResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<ExcerptsResponse>('GetTriangleExcerpts', triangleId)
    },
    vote: async (triangleId: string, pairKey: PairKey): Promise<PublicTriangle> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PublicTriangle>('Vote', triangleId, pairKey)
    },
    getMyHistory: async (): Promise<HistoryResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<HistoryResponse>('GetMyHistory')
    },
  }
}
