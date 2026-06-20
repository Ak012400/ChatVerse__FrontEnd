import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useTokensStore } from '../stores/tokensStore'
import type {
  TokenBalance, SignupBonusResponse, LedgerResponse,
  PacksResponse, TopupOrder, OrdersResponse, BalanceChangedEvent,
} from '../types/tokens'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/tokens'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useTokensHub() {
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

    hub.on('BalanceChanged', (p: BalanceChangedEvent) => {
      if (typeof p?.balance !== 'number') return
      useTokensStore.getState().applyBalanceChange(p.balance)
    })

    const startPromise = hub.start()
      .then(async () => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
        // Idempotent signup bonus on first connect — the server only
        // grants the +100 the very first time. Toast on grant.
        try {
          const r = await hub.invoke<SignupBonusResponse>('EnsureSignupBonus')
          if (r.granted) {
            showToast({
              type: 'success',
              title: '🎁  Welcome — 100 tokens credited',
              message: 'Tip Mehfil hosts, fund prize pools, more coming.',
              duration: 7000,
            })
          }
        } catch { /* network hiccup is fine; user can retry from /tokens */ }
      })
      .catch((err) => {
        console.error('[TokensHub] connect failed', err)
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
      throw new Error('Tokens service is offline. Try again in a moment.')
    }
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    getBalance: async (): Promise<TokenBalance> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<TokenBalance>('GetBalance')
    },
    ensureSignupBonus: async (): Promise<SignupBonusResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<SignupBonusResponse>('EnsureSignupBonus')
    },
    getLedger: async (limit = 30): Promise<LedgerResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<LedgerResponse>('GetLedger', limit)
    },
    getPacks: async (): Promise<PacksResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PacksResponse>('GetPacks')
    },
    getMyOrders: async (limit = 20): Promise<OrdersResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<OrdersResponse>('GetMyOrders', limit)
    },
    createTopupOrder: async (packKey: string): Promise<TopupOrder> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<TopupOrder>('CreateTopupOrder', packKey)
    },
    confirmMockPayment: async (orderId: string): Promise<TopupOrder> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<TopupOrder>('ConfirmMockPayment', orderId)
    },
    cancelTopupOrder: async (orderId: string): Promise<{ ok: boolean; order: TopupOrder | null }> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<{ ok: boolean; order: TopupOrder | null }>('CancelTopupOrder', orderId)
    },
  }
}
