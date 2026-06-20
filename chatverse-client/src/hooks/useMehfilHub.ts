import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useMehfilStore } from '../stores/mehfilStore'
import type {
  MehfilRoomCard, MehfilMessage, DiscoverResponse, RoomDetailResponse,
  RoomMessageEvent, RoomAudienceEvent, RoomTipEvent, MehfilTemplate,
} from '../types/mehfil'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/mehfil'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useMehfilHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const [connState, setLocalConnState] = useState<signalR.HubConnectionState>(
    sharedConnectionRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )
  const setConnState = useCallback((s: signalR.HubConnectionState) => {
    setLocalConnState(s); broadcastConnState(s)
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

    hub.on('RoomMessage', (m: RoomMessageEvent) => {
      if (!m?.id) return
      useMehfilStore.getState().appendMessage(m)
    })
    hub.on('RoomAudience', (p: RoomAudienceEvent) => {
      if (!p?.roomId) return
      useMehfilStore.getState().applyAudienceChange(p.currentAudienceCount)
    })
    hub.on('RoomTip', (p: RoomTipEvent) => {
      if (!p?.roomId) return
      useMehfilStore.getState().applyTip({
        senderUsername: p.senderUsername,
        giftType:       p.giftType,
        tokenAmount:    p.tokenAmount,
        createdAt:      new Date().toISOString(),
      }, p.totalTipsTokens)
      showToast({
        type: 'info',
        title: `🎁  ${p.senderUsername} sent a ${p.giftType}`,
        message: `+${p.tokenAmount} tokens to the host`,
        duration: 4000,
      })
    })
    hub.on('RoomStarted', (room: MehfilRoomCard) => {
      if (!room?.id) return
      useMehfilStore.getState().applyStatusChange('live')
      showToast({ type: 'success', title: `🎙  ${room.title} is live`, message: 'Tap to join.', duration: 6000 })
    })
    hub.on('RoomEnded', (room: MehfilRoomCard) => {
      if (!room?.id) return
      useMehfilStore.getState().applyStatusChange('ended')
      showToast({ type: 'info', title: `🎬  ${room.title} wrapped`, message: 'See you next time.', duration: 5000 })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[MehfilHub] connect failed', err)
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
      throw new Error('Mehfil service is offline. Try again in a moment.')
    }
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    discover: async (filter: string, template?: string): Promise<DiscoverResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<DiscoverResponse>('Discover', filter, template ?? null)
    },
    getRoom: async (roomId: string): Promise<RoomDetailResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<RoomDetailResponse>('GetRoom', roomId)
    },
    myRooms: async (): Promise<{ count: number; rooms: MehfilRoomCard[] }> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ count: number; rooms: MehfilRoomCard[] }>('MyRooms')
    },
    createRoom: async (
      templateKind: MehfilTemplate, title: string, description: string,
      scheduledFor: string, maxAudience: number,
    ): Promise<MehfilRoomCard> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MehfilRoomCard>(
        'CreateRoom', templateKind, title, description, scheduledFor, maxAudience,
      )
    },
    cancelRoom: async (roomId: string): Promise<{ ok: boolean }> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ ok: boolean }>('CancelRoom', roomId)
    },
    startRoom: async (roomId: string): Promise<MehfilRoomCard> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MehfilRoomCard>('StartRoom', roomId)
    },
    endRoom: async (roomId: string): Promise<MehfilRoomCard> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MehfilRoomCard>('EndRoom', roomId)
    },
    joinRoom: async (roomId: string): Promise<MehfilRoomCard> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MehfilRoomCard>('JoinRoom', roomId)
    },
    leaveRoom: async (roomId: string): Promise<{ ok: boolean }> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ ok: boolean }>('LeaveRoom', roomId)
    },
    sendMessage: async (roomId: string, content: string): Promise<MehfilMessage> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MehfilMessage>('SendMessage', roomId, content)
    },
    tip: async (roomId: string, giftType: string): Promise<{ id: string; giftType: string; tokenAmount: number }> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ id: string; giftType: string; tokenAmount: number }>('Tip', roomId, giftType)
    },
  }
}
