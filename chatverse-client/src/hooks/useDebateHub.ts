import { useCallback, useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useDebateStore } from '../stores/debateStore'
import type {
  DebateRoomState,
  DebateChatMessageDto,
  DebateNominationPrivate,
  DebateUserHighlightedEvent,
  DebateNominationCountEvent,
  DebateKickedEvent,
  DebateBannedEvent,
  DebateFormat,
  DebatePreferredSide,
  DebateSide,
} from '../types/debate'

// ============================================================
//  useDebateHub — singleton SignalR client for /hubs/debate.
//
//  STANDALONE per the per-feature isolation policy. Doesn't share
//  any state with mehfilStore or useMehfilHub — its own hub, its
//  own store, its own listeners.
//
//  Mounted by DebateRoomPage when the user opens a debate room.
//  Unmounted on leave. The DebateHub on the server uses a private
//  monitor sub-group, so even on the same socket the privileged
//  nomination bios only arrive when the connected user IS the host.
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/debate'

const sharedConnRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnPromiseRef: { current: Promise<void> | null } = { current: null }

export function useDebateHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const [connState, setConnState] = useState<signalR.HubConnectionState>(
    sharedConnRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )

  const {
    setRoomState, appendChat, applyHighlight, patchRoom,
    upsertNomination, removeNomination, setMonitorNominations,
  } = useDebateStore()

  // ─── Connection lifecycle ───────────────────────────────────────

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

    // ─── Server push: round lifecycle ────────────────────────────
    hub.on('RoundOpened', (state: DebateRoomState) => {
      useDebateStore.getState().setRoomState(state)
    })
    hub.on('RoundUpdated', (state: DebateRoomState) => {
      useDebateStore.getState().setRoomState(state)
    })
    hub.on('RoundEnded', (state: DebateRoomState) => {
      useDebateStore.getState().setRoomState(state)
    })

    // ─── Server push: seats ──────────────────────────────────────
    hub.on('SeatChanged', (state: DebateRoomState) => {
      useDebateStore.getState().setRoomState(state)
    })

    // ─── Server push: nomination count (public, no bios) ─────────
    hub.on('NominationCountChanged', (e: DebateNominationCountEvent) => {
      useDebateStore.getState().patchRoom({ pendingNominationCount: e.count })
    })

    // ─── Server push: PRIVATE nomination bio (monitor sub-channel) ─
    hub.on('NominationRaisedPrivate', (n: DebateNominationPrivate) => {
      useDebateStore.getState().upsertNomination(n)
    })
    hub.on('NominationWithdrawnPrivate', (e: { userId: string }) => {
      useDebateStore.getState().removeNomination(e.userId)
    })

    // ─── Server push: chat ───────────────────────────────────────
    hub.on('ChatMessage', (m: DebateChatMessageDto) => {
      useDebateStore.getState().appendChat(m)
    })

    // ─── Server push: highlight ──────────────────────────────────
    hub.on('UserHighlighted', (e: DebateUserHighlightedEvent) => {
      useDebateStore.getState().applyHighlight(e)
    })

    // ─── Server push: kick / ban (user-scoped) ──────────────────
    hub.on('UserKicked', (e: DebateKickedEvent) => {
      showToast({
        type: 'warning',
        title: 'Removed from debate',
        message: e.reason ?? 'The monitor removed you from the room.',
        duration: 5000,
      })
      window.dispatchEvent(new CustomEvent('cv:debate-kicked', { detail: e }))
    })
    hub.on('UserBanned', (e: DebateBannedEvent) => {
      showToast({
        type: 'error',
        title: 'Banned from debate',
        message: e.reason ?? 'You can no longer enter this room.',
        duration: 6000,
      })
      window.dispatchEvent(new CustomEvent('cv:debate-banned', { detail: e }))
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

  useEffect(() => {
    connect()
    return () => {
      // Refcount-less for simplicity: the only consumer of this hub is
      // DebateRoomPage (one at a time). Cleanup happens when that page
      // calls leaveDebateRoom + we drop the connection on unmount.
    }
  }, [connect])

  // ─── Method invokers ────────────────────────────────────────────

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
      // Server-side HubExceptions arrive with the message in clear text.
      showToast({
        type: 'error',
        title: 'Debate action failed',
        message: msg && msg.length < 200 ? msg : 'Try again.',
        duration: 3500,
      })
      return null
    }
  }

  // Public API ─ same shape used by DebateRoomPage.
  return {
    isConnected: () => connState === signalR.HubConnectionState.Connected,
    connectionState: connState,

    // Room lifecycle
    joinRoom: async (roomId: string) => {
      const state = await safeInvoke<DebateRoomState>('JoinDebateRoom', roomId)
      if (state) setRoomState(state)
      return state
    },
    leaveRoom: (roomId: string) => safeInvoke('LeaveDebateRoom', roomId),
    refresh: async (roomId: string) => {
      const state = await safeInvoke<DebateRoomState>('GetRoomState', roomId)
      if (state) setRoomState(state)
      return state
    },

    // Round (monitor)
    openRound: (roomId: string, format: DebateFormat, durationMinutes?: number) =>
      safeInvoke('OpenRound', roomId, format, durationMinutes ?? null),
    startLive: (roomId: string, durationMinutes: number) =>
      safeInvoke('StartLive', roomId, durationMinutes),
    endRound: (roomId: string) => safeInvoke('EndRound', roomId),

    // Nominations (audience)
    nominate: (roomId: string, realName: string, age: number, gender: string, preferredSide: DebatePreferredSide) =>
      safeInvoke<string>('NominateForSeat', roomId, realName, age, gender, preferredSide),
    withdrawNomination: (roomId: string) => safeInvoke('WithdrawNomination', roomId),

    // Nominations (monitor)
    getNominationsForMonitor: async (roomId: string) => {
      const rows = await safeInvoke<DebateNominationPrivate[]>('GetNominationsForMonitor', roomId)
      if (rows) setMonitorNominations(rows)
      return rows ?? []
    },

    // Seats (monitor)
    assignSeat: (roomId: string, nominationId: string, side: DebateSide, position: number) =>
      safeInvoke('AssignSeat', roomId, nominationId, side, position),
    unseatUser: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('UnseatUser', roomId, targetUserId, reason ?? null),

    // Moderation (monitor)
    kick: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('KickFromDebate', roomId, targetUserId, reason ?? null),
    ban: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('BanFromDebate', roomId, targetUserId, reason ?? null),
    highlight: (roomId: string, targetUserId: string, messageId?: string) =>
      safeInvoke('HighlightGoodQuestion', roomId, targetUserId, messageId ?? null),

    // Chat (audience + monitor + seated)
    sendChat: (roomId: string, content: string) =>
      safeInvoke<string>('SendChatMessage', roomId, content),
    sendQuestion: (roomId: string, content: string) =>
      safeInvoke<string>('SendQuestion', roomId, content),
  }
}
