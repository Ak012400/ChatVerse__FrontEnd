import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useConfessionStore } from '../stores/confessionStore'
import type {
  ConfessionCard,
  FeedResponse,
  LoreWallResponse,
  TopOfferResponse,
  ConfessionPostedEvent,
  ReactionUpdatedEvent,
  ConfessionRevealedEvent,
  TopConfessionOfferedEvent,
} from '../types/confession'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/confessions'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useConfessionHub() {
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

    hub.on('ConfessionPosted', (payload: ConfessionPostedEvent) => {
      if (!payload?.id) return
      useConfessionStore.getState().prependFeed(payload)
    })
    hub.on('ReactionUpdated', (payload: ReactionUpdatedEvent) => {
      if (!payload?.id) return
      useConfessionStore.getState().upsertCard(payload)
    })
    hub.on('ConfessionRevealed', (payload: ConfessionRevealedEvent) => {
      if (!payload?.id) return
      useConfessionStore.getState().applyRevealed(payload.id, payload.authorUsername)
      showToast({
        type: 'success',
        title: `🪪  ${payload.authorUsername} just stepped out of the shadows`,
        message: 'They wrote yesterday\'s top confession.',
        duration: 7000,
      })
    })
    hub.on('TopConfessionOffered', (payload: TopConfessionOfferedEvent) => {
      if (!payload?.id) return
      useConfessionStore.getState().setPendingOffer({
        hasOffer: true,
        id: payload.id,
        content: payload.content,
        totalReactions: payload.totalReactions,
      })
      showToast({
        type: 'info',
        title: '👑  You wrote yesterday\'s top confession',
        message: 'Open the Confessions page to choose: reveal or Ghost Voice.',
        duration: 8000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[ConfessionHub] connect failed', err)
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
      throw new Error('Confessions service is offline. Try again in a moment.')
    }
  }

  const post = async (content: string): Promise<ConfessionCard> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ConfessionCard>('Post', content)
  }
  const getTodaysFeed = async (skip = 0, limit = 20): Promise<FeedResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<FeedResponse>('GetTodaysFeed', skip, limit)
  }
  const react = async (confessionId: string, emoji: string): Promise<ConfessionCard> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ConfessionCard>('React', confessionId, emoji)
  }
  const getMyTopOffer = async (): Promise<TopOfferResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<TopOfferResponse>('GetMyTopOffer')
  }
  const acceptReveal = async (confessionId: string): Promise<ConfessionCard> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ConfessionCard>('AcceptReveal', confessionId)
  }
  const declineReveal = async (confessionId: string): Promise<boolean> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<boolean>('DeclineReveal', confessionId)
  }
  const getLoreWall = async (weeksAgo = 0): Promise<LoreWallResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<LoreWallResponse>('GetLoreWall', weeksAgo)
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    post, getTodaysFeed, react, getMyTopOffer, acceptReveal, declineReveal, getLoreWall,
  }
}
