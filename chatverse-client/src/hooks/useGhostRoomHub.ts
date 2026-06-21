import { useCallback, useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useGhostRoomStore } from '../stores/ghostRoomStore'
import type {
  GhostRoomState,
  GhostPairAssignedEvent,
  GhostPairOutcomeEvent,
  GhostPairCreatedPublicEvent,
  GhostPairMessageDto,
  GhostNominationPrivate,
  GhostNominationCountEvent,
  GhostKickedEvent,
  GhostBannedEvent,
  GhostVoyagerHighlightedEvent,
  GhostLiveKitToken,
  GhostPrivacy,
  GhostInterest,
} from '../types/ghostRoom'

// ============================================================
//  useGhostRoomHub — singleton SignalR client for /hubs/ghost-room.
//
//  STANDALONE per the per-feature isolation policy. Used only by
//  GhostRoomPage. Doesn't share state with mehfilStore or the
//  legacy ghostDateStore.
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/ghost-room'

const sharedConnRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnPromiseRef: { current: Promise<void> | null } = { current: null }

export function useGhostRoomHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const [connState, setConnState] = useState<signalR.HubConnectionState>(
    sharedConnRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )

  const connect = useCallback(async () => {
    if (!token) return
    if (sharedConnRef.current?.state === signalR.HubConnectionState.Connected) return
    if (sharedConnPromiseRef.current) return sharedConnPromiseRef.current

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
    hub.onclose(() => {
      setConnState(signalR.HubConnectionState.Disconnected)
      sharedConnRef.current = null
      sharedConnPromiseRef.current = null
    })

    // ─── Room lifecycle ──────────────────────────────────────────
    hub.on('RoomConfigured', (state: GhostRoomState) => {
      useGhostRoomStore.getState().setRoomState(state)
    })
    hub.on('RoundEnded', () => {
      // Clear active pair on round end (matchmaker shut it down).
      const s = useGhostRoomStore.getState()
      s.setActivePair(null)
      s.setPairLivekit(null)
      s.setPairOutcome(null)
    })

    // ─── Public push (room group) ────────────────────────────────
    hub.on('NominationCountChanged', (e: GhostNominationCountEvent) => {
      useGhostRoomStore.getState().patchRoom({ pendingNominationCount: e.count })
    })
    hub.on('PairCreatedPublic', (_e: GhostPairCreatedPublicEvent) => {
      // Other voyagers are getting paired; refresh the public hall.
      // The pair-creators themselves get PairAssigned (user-scoped) below.
    })
    hub.on('VoyagerHighlighted', (e: GhostVoyagerHighlightedEvent) => {
      useGhostRoomStore.getState().setLastHighlighted(e.targetVoyagerTag)
      window.setTimeout(() => useGhostRoomStore.getState().setLastHighlighted(null), 1800)
    })

    // ─── Private push (matchmaker sub-group) ─────────────────────
    hub.on('NominationRaisedPrivate', (n: GhostNominationPrivate) => {
      useGhostRoomStore.getState().upsertNomination(n)
    })
    hub.on('NominationWithdrawnPrivate', (e: { userId: string }) => {
      useGhostRoomStore.getState().removeNomination(e.userId)
    })

    // ─── User-scoped: pair assigned to me ────────────────────────
    hub.on('PairAssigned', (p: GhostPairAssignedEvent) => {
      useGhostRoomStore.getState().setActivePair(p)
      showToast({
        type: 'success',
        title: '💞 You are paired',
        message: `You're matched with ${p.voyagerATag === p.voyagerBTag ? '…' : (p.voyagerATag + ' / ' + p.voyagerBTag)}`,
        duration: 3500,
      })
    })

    // ─── Pair-group push (chat + outcome) ────────────────────────
    hub.on('PairMessage', (m: GhostPairMessageDto) => {
      useGhostRoomStore.getState().appendPairMessage(m)
    })
    hub.on('PairOutcome', (e: GhostPairOutcomeEvent) => {
      useGhostRoomStore.getState().setPairOutcome(e.outcome)
    })

    // ─── User-scoped moderation ──────────────────────────────────
    hub.on('GhostKicked', (e: GhostKickedEvent) => {
      showToast({
        type: 'warning',
        title: 'Removed from room',
        message: e.reason ?? 'The matchmaker removed you.',
        duration: 5000,
      })
      window.dispatchEvent(new CustomEvent('cv:ghost-kicked', { detail: e }))
    })
    hub.on('GhostBanned', (e: GhostBannedEvent) => {
      showToast({
        type: 'error',
        title: 'Banned from room',
        message: e.reason ?? 'You can no longer enter this room.',
        duration: 6000,
      })
      window.dispatchEvent(new CustomEvent('cv:ghost-banned', { detail: e }))
    })

    sharedConnPromiseRef.current = hub.start()
      .then(() => {
        sharedConnRef.current = hub
        setConnState(signalR.HubConnectionState.Connected)
      })
      .catch(() => {
        sharedConnRef.current = null
        setConnState(signalR.HubConnectionState.Disconnected)
      })
      .finally(() => { sharedConnPromiseRef.current = null })
    return sharedConnPromiseRef.current
  }, [token, showToast])

  useEffect(() => { connect() }, [connect])

  const ensure = useCallback(async () => {
    if (sharedConnRef.current?.state !== signalR.HubConnectionState.Connected) {
      await connect()
    }
    return sharedConnRef.current
  }, [connect])

  const safeInvoke = async <T = void>(method: string, ...args: any[]): Promise<T | null> => {
    const hub = await ensure()
    if (!hub) return null
    try {
      return await hub.invoke<T>(method, ...args)
    } catch (err: any) {
      const msg = String(err?.message ?? '')
      showToast({
        type: 'error',
        title: 'Ghost-room action failed',
        message: msg && msg.length < 200 ? msg : 'Try again.',
        duration: 3500,
      })
      return null
    }
  }

  return {
    isConnected: () => connState === signalR.HubConnectionState.Connected,
    connectionState: connState,

    // Lifecycle
    joinRoom: async (roomId: string, inviteCode?: string) => {
      const s = await safeInvoke<GhostRoomState>('JoinGhostRoom', roomId, inviteCode ?? null)
      if (s) useGhostRoomStore.getState().setRoomState(s)
      return s
    },
    leaveRoom: (roomId: string) => safeInvoke('LeaveGhostRoom', roomId),

    // Matchmaker config
    configureRoom: (roomId: string, privacy: GhostPrivacy, maxVoyagers: number, roundDurationMinutes: number) =>
      safeInvoke<GhostRoomState>('ConfigureRoom', roomId, privacy, maxVoyagers, roundDurationMinutes),

    // Voyager
    nominate: (roomId: string, realName: string, age: number, gender: string, interestedIn: GhostInterest, shortBio: string) =>
      safeInvoke<string>('NominateForPairing', roomId, realName, age, gender, interestedIn, shortBio),
    withdrawNomination: (roomId: string) => safeInvoke('WithdrawNomination', roomId),

    // Matchmaker pair
    getNominationsForMatchmaker: async (roomId: string) => {
      const rows = await safeInvoke<GhostNominationPrivate[]>('GetNominationsForMatchmaker', roomId)
      if (rows) useGhostRoomStore.getState().setMonitorNominations(rows)
      return rows ?? []
    },
    assignPair: (roomId: string, nominationAId: string, nominationBId: string) =>
      safeInvoke<string>('AssignPair', roomId, nominationAId, nominationBId),
    autoPairRemaining: (roomId: string, interestBalanced: boolean) =>
      safeInvoke<number>('AutoPairRemaining', roomId, interestBalanced),

    // Pair (voyager)
    joinPairGroup: (pairId: string) => safeInvoke('JoinPairGroup', pairId),
    sendPairMessage: (pairId: string, content: string) =>
      safeInvoke<string>('SendPairMessage', pairId, content),
    voteReveal: (pairId: string, wantsReveal: boolean) =>
      safeInvoke('VoteRevealAtRoundEnd', pairId, wantsReveal),

    // Matchmaker round / moderation
    endRound: (roomId: string) => safeInvoke('EndRound', roomId),
    highlight: (roomId: string, targetUserId: string) =>
      safeInvoke('HighlightGoodVibe', roomId, targetUserId),
    kick: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('KickFromGhost', roomId, targetUserId, reason ?? null),
    ban: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('BanFromGhost', roomId, targetUserId, reason ?? null),

    // LiveKit
    getPairLiveKitToken: async (pairId: string) => {
      const t = await safeInvoke<GhostLiveKitToken>('GetPairLiveKitToken', pairId)
      if (t) {
        useGhostRoomStore.getState().setPairLivekit({
          roomName: t.roomName,
          serverUrl: t.serverUrl,
          token: t.token,
        })
      }
      return t
    },
  }
}
