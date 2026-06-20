import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { usePyaarLiveStore } from '../stores/pyaarLiveStore'
import type {
  PyaarRegistration, ShowDto, MyCoupleDto, MyStatusResponse, SpectatorView,
  HistoryResponse, PyaarMessage,
  ShowStartedEvent, RoundAdvancedEvent, CoupleMessageEvent, SpectatorMessageEvent,
  EliminationAnnouncedEvent, ShowEndedEvent,
} from '../types/pyaarLive'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/pyaar-live'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function usePyaarLiveHub() {
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

    hub.on('ShowStarted', (p: ShowStartedEvent) => {
      if (!p?.showId) return
      showToast({
        type: 'success',
        title: '🎬  PYAAR LIVE just started',
        message: `${p.coupleCount} couples · Round 1: ${p.currentRoundLabel}`,
        duration: 8000,
      })
    })

    hub.on('RoundAdvanced', (p: RoundAdvancedEvent) => {
      if (!p?.showId) return
      usePyaarLiveStore.getState().applyRoundAdvanced(
        p.currentRound, p.currentRoundLabel, p.currentRoundEndsAt,
      )
      showToast({
        type: 'info',
        title: `🎙  Round ${p.currentRound} · ${p.currentRoundLabel}`,
        message: 'Show advanced.',
        duration: 6000,
      })
    })

    hub.on('CoupleMessage', (m: CoupleMessageEvent) => {
      if (!m?.id) return
      usePyaarLiveStore.getState().appendCoupleMessage({
        ...m,
        mine: m.senderUserId === useAuthStore.getState().user?.userId,
      })
    })

    hub.on('SpectatorMessage', (m: SpectatorMessageEvent) => {
      if (!m?.id) return
      usePyaarLiveStore.getState().appendSpectatorMessage(m)
    })

    hub.on('EliminationAnnounced', (p: EliminationAnnouncedEvent) => {
      if (!p?.showId) return
      usePyaarLiveStore.getState().applyElimination(p.eliminatedCoupleIds)
      showToast({
        type: 'warning',
        title: '⚡  3 couples just eliminated',
        message: 'The audience has spoken. Round 3 begins.',
        duration: 7000,
      })
    })

    hub.on('ShowEnded', (p: ShowEndedEvent) => {
      if (!p?.showId) return
      usePyaarLiveStore.getState().applyShowEnded(p.winners)
      const top = p.winners.find((w) => w.rank === 1)
      showToast({
        type: 'success',
        title: '🏆  Show wrapped',
        message: top ? `${top.codename} took the crown.` : 'See you next Saturday.',
        duration: 9000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[PyaarLiveHub] connect failed', err)
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
      throw new Error('PYAAR LIVE service is offline. Try again in a moment.')
    }
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    register: async (): Promise<PyaarRegistration> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PyaarRegistration>('Register')
    },
    withdraw: async (): Promise<PyaarRegistration> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PyaarRegistration>('Withdraw')
    },
    getMyStatus: async (): Promise<MyStatusResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MyStatusResponse>('GetMyStatus')
    },
    getActiveShow: async (): Promise<ShowDto> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<ShowDto>('GetActiveShow')
    },
    getMyCouple: async (): Promise<MyCoupleDto> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MyCoupleDto>('GetMyCouple')
    },
    sendCoupleMessage: async (content: string): Promise<PyaarMessage> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<PyaarMessage>('SendCoupleMessage', content)
    },
    getSpectatorView: async (): Promise<SpectatorView> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<SpectatorView>('GetSpectatorView')
    },
    vote: async (coupleId: string): Promise<ShowDto> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<ShowDto>('Vote', coupleId)
    },
    getMyHistory: async (): Promise<HistoryResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<HistoryResponse>('GetMyHistory')
    },
  }
}
