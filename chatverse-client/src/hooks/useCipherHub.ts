import { useEffect, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useCipherStore } from '../stores/cipherStore'
import type {
  CurrentRoundState, MyFragmentState, MySubmissionResponse,
  SubmissionConfirmation, LeaderboardResponse, ArchiveResponse,
  CipherRoundStartedEvent, CipherFragmentAssignedEvent, CipherRoundClosedEvent,
} from '../types/cipher'

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/cipher'

const sharedConnectionRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnectionPromiseRef: { current: Promise<void> | null } = { current: null }
let sharedConsumerCount = 0
const sharedStateSubscribers = new Set<(s: signalR.HubConnectionState) => void>()
function broadcastConnState(s: signalR.HubConnectionState) {
  for (const fn of sharedStateSubscribers) fn(s)
}

export function useCipherHub() {
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

    hub.on('CipherRoundStarted', (p: CipherRoundStartedEvent) => {
      if (!p?.roundId) return
      useCipherStore.getState().applyRoundStarted(p.roundId, p.weekLabel, p.endsAt, p.phraseLength)
      showToast({
        type: 'info',
        title: `🗝  Cipher ${p.weekLabel} begins`,
        message: `A ${p.phraseLength}-word phrase is being whispered. Find the Members. Decode the line.`,
        duration: 9000,
      })
    })

    hub.on('CipherFragmentAssigned', (p: CipherFragmentAssignedEvent) => {
      if (!p?.assignedFragment) return
      useCipherStore.getState().setFragment({
        hasFragment:      true,
        weekLabel:        p.weekLabel,
        roundEndsAt:      p.roundEndsAt,
        assignedFragment: p.assignedFragment,
      })
      showToast({
        type: 'success',
        title: '🤫  You\'re a Cipher Member this week',
        message: 'Your secret word is waiting on the Cipher page.',
        duration: 10000,
      })
    })

    hub.on('CipherRoundClosed', (p: CipherRoundClosedEvent) => {
      if (!p?.roundId) return
      useCipherStore.getState().applyRoundClosed(p.roundId)
      showToast({
        type: 'info',
        title: `📜  Cipher ${p.weekLabel} unsealed`,
        message: `"${p.phrase}" — ${p.winningHunters} Hunter(s) scored ≥ 50%.`,
        duration: 10000,
      })
    })

    const startPromise = hub.start()
      .then(() => {
        sharedConnectionRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch((err) => {
        console.error('[CipherHub] connect failed', err)
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
      throw new Error('Cipher service is offline. Try again in a moment.')
    }
  }

  return {
    isConnected: connState === signalR.HubConnectionState.Connected,
    connectionState: connState,
    getCurrentRound: async (): Promise<CurrentRoundState> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<CurrentRoundState>('GetCurrentRound')
    },
    getMyFragment: async (): Promise<MyFragmentState> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MyFragmentState>('GetMyFragment')
    },
    submitGuess: async (phrase: string, namedUserIds: string[]): Promise<SubmissionConfirmation> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<SubmissionConfirmation>('SubmitGuess', phrase, namedUserIds)
    },
    getMySubmission: async (): Promise<MySubmissionResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<MySubmissionResponse>('GetMySubmission')
    },
    getLeaderboard: async (roundId?: string): Promise<LeaderboardResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<LeaderboardResponse>('GetLeaderboard', roundId ?? null)
    },
    getArchive: async (): Promise<ArchiveResponse> => {
      await ensureConnected()
      return sharedConnectionRef.current!.invoke<ArchiveResponse>('GetArchive')
    },
  }
}
