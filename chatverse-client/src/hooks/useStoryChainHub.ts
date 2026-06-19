import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useStoryChainStore } from '../stores/storyChainStore'
import type {
  ChainState,
  ArchivedChain,
  TurnAssignedEvent,
  ContributionAddedEvent,
  QueueUpdatedEvent,
  ChainLockedEvent,
} from '../types/storyChain'

// ============================================================
//  useStoryChainHub — singleton SignalR client for /hubs/story-chain.
//
//  Same shape as the other Phase 1 hubs: one shared WebSocket per
//  tab, ref-counted, push-event listeners owned here.
//
//  All client-method invocations return the SAME fresh ChainState
//  envelope so the page rarely needs a separate "refresh".
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/story-chain'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

interface ArchiveResponse { count: number; chains: ArchivedChain[] }

export function useStoryChainHub() {
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

    // ─── Server push: it's MY turn. 10-min reservation starts now.
    hub.on('TurnAssigned', (payload: TurnAssignedEvent) => {
      if (!payload?.chainId) return
      useStoryChainStore.getState().setMyTurnExpiresAt(payload.expiresAt)
      showToast({
        type:     'success',
        title:    '✍️  Your turn',
        message:  'You have 10 minutes to add one sentence to today\'s story.',
        duration: 6000,
      })
    })

    // ─── Server push: someone added a new sentence.
    hub.on('ContributionAdded', (payload: ContributionAddedEvent) => {
      if (!payload?.chainId) return
      useStoryChainStore.getState().applyContribution(
        {
          sentence:       payload.sentence,
          authorUsername: payload.authorUsername,
          addedAt:        payload.addedAt,
        },
        payload.totalSentences,
      )
    })

    // ─── Server push: queue length changed.
    hub.on('QueueUpdated', (payload: QueueUpdatedEvent) => {
      if (!payload?.chainId) return
      useStoryChainStore.getState().applyQueueUpdate(
        payload.queueLength, payload.hasActiveTurn,
      )
    })

    // ─── Server push: chain locked (cap reached OR day ended).
    hub.on('ChainLocked', (payload: ChainLockedEvent) => {
      if (!payload?.chainId) return
      useStoryChainStore.getState().applyChainLocked()
      showToast({
        type:     'info',
        title:    '📖  Today\'s story is sealed',
        message:  payload.reason === 'cap_reached'
          ? '50 voices joined in. It\'s now in the archive.'
          : 'Midnight came. Tomorrow brings a fresh prompt.',
        duration: 6000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[StoryChainHub] connect failed', err)
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
      throw new Error('Story Chain service is offline. Try again in a moment.')
    }
  }

  const getCurrentChain = async (): Promise<ChainState> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ChainState>('GetCurrentChain')
  }

  const joinQueue = async (): Promise<ChainState> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ChainState>('JoinQueue')
  }

  const leaveQueue = async (): Promise<ChainState> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ChainState>('LeaveQueue')
  }

  const addSentence = async (text: string): Promise<ChainState> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ChainState>('AddSentence', text)
  }

  const getArchive = async (): Promise<ArchiveResponse> => {
    await ensureConnected()
    return await sharedConnectionRef.current!.invoke<ArchiveResponse>('GetArchive')
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    getCurrentChain,
    joinQueue,
    leaveQueue,
    addSentence,
    getArchive,
  }
}
