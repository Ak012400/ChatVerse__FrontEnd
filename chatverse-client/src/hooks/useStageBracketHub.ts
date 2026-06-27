import { useCallback, useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useStageBracketStore } from '../stores/stageBracketStore'
import type {
  StageBracketRoomState, StageBracketNominationPrivate,
  StageBracketChatMessageDto, StageBracketLiveKitToken,
  StageBracketKickedEvent, StageBracketBannedEvent,
  StageBracketMode, StageBracketPrivacy, StageBracketPreferredSide,
  StageBracketSide,
} from '../types/stageBracket'

// ============================================================
//  useStageBracketHub — singleton SignalR client for /hubs/stage-bracket.
//
//  Shared by DebateV2RoomPage + RoastRoomPage. Theme/labels come from
//  the page-level component; the hub wire protocol is identical.
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/stage-bracket'

const sharedConnRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnPromiseRef: { current: Promise<void> | null } = { current: null }

export function useStageBracketHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const [connState, setConnState] = useState<signalR.HubConnectionState>(
    sharedConnRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )

  const {
    setRoomState, appendChat,
    upsertSeatNomination, removeSeatNomination, setSeatNominations,
    upsertChallengeNomination, removeChallengeNomination,
    setMicLivekit,
  } = useStageBracketStore()

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

    // ─── Server push wiring ──────────────────────────────────
    const applyState = (s: StageBracketRoomState) => useStageBracketStore.getState().setRoomState(s)

    hub.on('RoomStateChanged', applyState)
    hub.on('RoundOpened',      applyState)
    hub.on('RoundLive',        applyState)
    hub.on('RoundEnded', (s: StageBracketRoomState) => {
      applyState(s)
      useStageBracketStore.getState().setMicLivekit(null)
    })
    hub.on('SeatChanged', applyState)
    hub.on('TurnAdvanced', (payload: { round?: any; seats?: any[] }) => {
      // Lightweight projection from the ticker — patch in place.
      const cur = useStageBracketStore.getState().roomState
      if (cur && payload?.round) {
        useStageBracketStore.getState().setRoomState({
          ...cur,
          round: { ...(cur.round ?? {} as any), ...payload.round },
          seats: payload.seats ?? cur.seats,
        })
        // New active speaker → invalidate cached LiveKit creds so the
        // page re-requests + grants/revokes publish capability.
        useStageBracketStore.getState().setMicLivekit(null)
      }
    })
    hub.on('ChallengeStarted', applyState)
    hub.on('ChallengeEnded', (payload: { round?: any; seats?: any[] }) => {
      const cur = useStageBracketStore.getState().roomState
      if (cur && payload?.round) {
        useStageBracketStore.getState().setRoomState({
          ...cur,
          round: { ...(cur.round ?? {} as any), ...payload.round },
          seats: payload.seats ?? cur.seats,
        })
        useStageBracketStore.getState().setMicLivekit(null)
      }
    })

    hub.on('NominationCountChanged', (e: { count: number }) => {
      useStageBracketStore.getState().patchRoom({ pendingNominationCount: e.count })
    })
    hub.on('NominationRaisedPrivate', (n: StageBracketNominationPrivate) => {
      if (n.intent === 'seat') useStageBracketStore.getState().upsertSeatNomination(n)
      else useStageBracketStore.getState().upsertChallengeNomination(n)
    })
    hub.on('NominationWithdrawnPrivate', (e: { userId: string }) => {
      useStageBracketStore.getState().removeSeatNomination(e.userId)
    })
    hub.on('ChallengeRaisedPrivate', (n: StageBracketNominationPrivate) => {
      useStageBracketStore.getState().upsertChallengeNomination(n)
    })
    hub.on('ChallengeWithdrawnPrivate', (e: { nominationId: string }) => {
      useStageBracketStore.getState().removeChallengeNomination(e.nominationId)
    })

    hub.on('ChatMessage', (m: StageBracketChatMessageDto) => {
      useStageBracketStore.getState().appendChat(m)
    })

    hub.on('UserKicked', (e: StageBracketKickedEvent) => {
      showToast({
        type: 'warning', title: 'Removed from stage',
        message: e.reason ?? 'The host removed you from the room.',
        duration: 5000,
      })
      window.dispatchEvent(new CustomEvent('cv:sb-kicked', { detail: e }))
    })
    hub.on('UserBanned', (e: StageBracketBannedEvent) => {
      showToast({
        type: 'error', title: 'Banned from stage',
        message: e.reason ?? 'You can no longer enter this room.',
        duration: 6000,
      })
      window.dispatchEvent(new CustomEvent('cv:sb-banned', { detail: e }))
    })

    // Bind unused destructures so TS / lint don't complain.
    void appendChat; void upsertSeatNomination; void removeSeatNomination
    void setSeatNominations; void upsertChallengeNomination; void removeChallengeNomination
    void setMicLivekit; void setRoomState

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
  }, [token, showToast,
      appendChat, upsertSeatNomination, removeSeatNomination, setSeatNominations,
      upsertChallengeNomination, removeChallengeNomination, setMicLivekit, setRoomState])

  useEffect(() => { connect() }, [connect])

  const ensure = useCallback(async () => {
    if (sharedConnRef.current?.state !== signalR.HubConnectionState.Connected) await connect()
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
        title: 'Stage action failed',
        message: msg && msg.length < 200 ? msg : 'Try again.',
        duration: 3500,
      })
      return null
    }
  }

  return {
    isConnected: () => connState === signalR.HubConnectionState.Connected,
    connectionState: connState,

    joinRoom: async (roomId: string, inviteCode?: string) => {
      const s = await safeInvoke<StageBracketRoomState>('JoinStageRoom', roomId, inviteCode ?? null)
      if (s) setRoomState(s)
      return s
    },
    leaveRoom: (roomId: string) => safeInvoke('LeaveStageRoom', roomId),
    refresh: async (roomId: string) => {
      const s = await safeInvoke<StageBracketRoomState>('GetRoomState', roomId)
      if (s) setRoomState(s)
      return s
    },

    // Host
    configureRoom: (
      roomId: string, mode: StageBracketMode, privacy: StageBracketPrivacy,
      secondsPerTurn: number, roundDurationMinutes: number,
      challengeSlotSeconds: number, hostTopic: string | null,
    ) =>
      safeInvoke('ConfigureRoom', roomId, mode, privacy, secondsPerTurn, roundDurationMinutes, challengeSlotSeconds, hostTopic),
    startRound: (roomId: string) => safeInvoke<string>('StartRound', roomId),
    /** One-shot host action — configure + open round + go live in a
     *  single server call. Lets the host jump straight from "empty
     *  room" to "live with mic open" without manually clicking through
     *  three steps. */
    quickStart: async (roomId: string, mode: StageBracketMode, hostTopic?: string) => {
      const s = await safeInvoke<StageBracketRoomState>('QuickStart', roomId, mode, hostTopic ?? null)
      if (s) setRoomState(s)
      return s
    },
    goLive: (roomId: string) => safeInvoke('GoLive', roomId),
    endRound: (roomId: string) => safeInvoke('EndRound', roomId),
    assignSeat: (roomId: string, nominationId: string, side: StageBracketSide, position: number) =>
      safeInvoke('AssignSeat', roomId, nominationId, side, position),
    unseatUser: (roomId: string, targetUserId: string) =>
      safeInvoke('UnseatUser', roomId, targetUserId),
    approveChallenge: (roomId: string, nominationId: string) =>
      safeInvoke('ApproveChallenge', roomId, nominationId),
    rejectChallenge: (roomId: string, nominationId: string) =>
      safeInvoke('RejectChallenge', roomId, nominationId),
    kick: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('KickFromStage', roomId, targetUserId, reason ?? null),
    ban: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('BanFromStage', roomId, targetUserId, reason ?? null),
    getNominationsForHost: async (roomId: string, intent?: 'seat' | 'challenge') => {
      const rows = await safeInvoke<StageBracketNominationPrivate[]>('GetNominationsForHost', roomId, intent ?? null)
      if (rows && (!intent || intent === 'seat')) setSeatNominations(rows.filter((n) => n.intent === 'seat'))
      return rows ?? []
    },

    // Audience
    nominateForSeat: (roomId: string, preferredSide: StageBracketPreferredSide, note: string) =>
      safeInvoke<string>('NominateForSeat', roomId, preferredSide, note),
    withdrawNomination: (roomId: string) => safeInvoke('WithdrawNomination', roomId),
    raiseHandToChallenge: (roomId: string, note: string) =>
      safeInvoke<string>('RaiseHandToChallenge', roomId, note),
    sendChat: (roomId: string, content: string) =>
      safeInvoke<string>('SendChatMessage', roomId, content),

    // LiveKit
    getActiveMicToken: async (roomId: string) => {
      const creds = await safeInvoke<StageBracketLiveKitToken>('GetActiveMicToken', roomId)
      if (creds) setMicLivekit(creds)
      return creds
    },
  }
}
