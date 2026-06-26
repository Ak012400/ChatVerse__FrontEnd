import { useCallback, useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useOpenMicStore } from '../stores/openMicStore'
import type {
  OpenMicRoomState, OpenMicQueueEntryPrivate,
  OpenMicReactionEvent, OpenMicQueueCountEvent,
  OpenMicHighlightEvent, OpenMicKickedEvent, OpenMicBannedEvent,
  OpenMicLiveKitToken,
} from '../types/openMic'

// ============================================================
//  useOpenMicHub — singleton SignalR client for /hubs/open-mic.
//
//  Standalone per the per-feature isolation policy. No shared state
//  with mehfilStore or other template hubs.
// ============================================================

const HUB_URL =
  (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
    .replace('/api', '') + '/hubs/open-mic'

const sharedConnRef: { current: signalR.HubConnection | null } = { current: null }
const sharedConnPromiseRef: { current: Promise<void> | null } = { current: null }

export function useOpenMicHub() {
  const token = useAuthStore((s) => s.token)
  const { showToast } = useToastStore()
  const [connState, setConnState] = useState<signalR.HubConnectionState>(
    sharedConnRef.current?.state ?? signalR.HubConnectionState.Disconnected,
  )

  const { setRoomState, patchRoom, upsertMcQueueEntry, removeMcQueueEntry, setMcQueue, setSlotLivekit, pushFloatingReaction } = useOpenMicStore()

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
    hub.on('SetOpened', (s: OpenMicRoomState) => {
      useOpenMicStore.getState().setRoomState(s)
    })
    hub.on('SetEnded', (s: OpenMicRoomState) => {
      useOpenMicStore.getState().setRoomState(s)
    })
    hub.on('RoomStateChanged', (s: OpenMicRoomState) => {
      useOpenMicStore.getState().setRoomState(s)
    })
    hub.on('SlotChanged', (s: OpenMicRoomState) => {
      useOpenMicStore.getState().setRoomState(s)
      // New slot → clear stale LiveKit creds; consumer re-requests.
      useOpenMicStore.getState().setSlotLivekit(null)
    })

    hub.on('QueueCountChanged', (e: OpenMicQueueCountEvent) => {
      useOpenMicStore.getState().patchRoom({ pendingQueueCount: e.count })
    })

    hub.on('QueueRaisedPrivate', (entry: OpenMicQueueEntryPrivate) => {
      useOpenMicStore.getState().upsertMcQueueEntry(entry)
    })
    hub.on('QueueWithdrawnPrivate', (e: { userId: string }) => {
      useOpenMicStore.getState().removeMcQueueEntry(e.userId)
    })

    hub.on('ReactionFlashed', (e: OpenMicReactionEvent) => {
      useOpenMicStore.getState().pushFloatingReaction(e.emoji)
    })

    hub.on('PerformanceHighlighted', (_e: OpenMicHighlightEvent) => {
      // RoomStateChanged will arrive with isHighlighted=true; no action.
    })

    hub.on('UserKicked', (e: OpenMicKickedEvent) => {
      showToast({
        type: 'warning',
        title: 'Removed from open mic',
        message: e.reason ?? 'The MC removed you from the room.',
        duration: 5000,
      })
      window.dispatchEvent(new CustomEvent('cv:openmic-kicked', { detail: e }))
    })
    hub.on('UserBanned', (e: OpenMicBannedEvent) => {
      showToast({
        type: 'error',
        title: 'Banned from open mic',
        message: e.reason ?? 'You can no longer enter this room.',
        duration: 6000,
      })
      window.dispatchEvent(new CustomEvent('cv:openmic-banned', { detail: e }))
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
        title: 'Open mic action failed',
        message: msg && msg.length < 200 ? msg : 'Try again.',
        duration: 3500,
      })
      return null
    }
  }

  return {
    isConnected: () => connState === signalR.HubConnectionState.Connected,
    connectionState: connState,

    // View
    joinRoom: async (roomId: string, inviteCode?: string) => {
      const s = await safeInvoke<OpenMicRoomState>('JoinOpenMicRoom', roomId, inviteCode ?? null)
      if (s) setRoomState(s)
      return s
    },
    leaveRoom: (roomId: string) => safeInvoke('LeaveOpenMicRoom', roomId),
    refresh: async (roomId: string) => {
      const s = await safeInvoke<OpenMicRoomState>('GetRoomState', roomId)
      if (s) setRoomState(s)
      return s
    },

    // MC config + set
    configureRoom: (roomId: string, privacy: 'public' | 'private', slotDurationSeconds: number) =>
      safeInvoke('ConfigureRoom', roomId, privacy, slotDurationSeconds),
    startSet: (roomId: string) => safeInvoke('StartSet', roomId),
    endSet: (roomId: string) => safeInvoke('EndSet', roomId),
    nextPerformer: (roomId: string, queueEntryId: string) =>
      safeInvoke('NextPerformer', roomId, queueEntryId),
    endCurrentSlot: (roomId: string) => safeInvoke('EndCurrentSlot', roomId),
    highlightPerformance: (roomId: string, slotId: string) =>
      safeInvoke('HighlightPerformance', roomId, slotId),
    kick: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('KickFromOpenMic', roomId, targetUserId, reason ?? null),
    ban: (roomId: string, targetUserId: string, reason?: string) =>
      safeInvoke('BanFromOpenMic', roomId, targetUserId, reason ?? null),
    getQueueForMc: async (roomId: string) => {
      const rows = await safeInvoke<OpenMicQueueEntryPrivate[]>('GetQueueForMc', roomId)
      if (rows) setMcQueue(rows)
      return rows ?? []
    },

    // Audience
    joinQueue: (roomId: string, realName: string, age: number, gender: string, performanceTitle: string) =>
      safeInvoke<string>('JoinQueue', roomId, realName, age, gender, performanceTitle),
    leaveQueue: (roomId: string) => safeInvoke('LeaveQueue', roomId),
    sendReaction: (roomId: string, emoji: string) =>
      safeInvoke('SendReaction', roomId, emoji),

    // LiveKit
    getSlotLiveKitToken: async (roomId: string, slotId: string) => {
      const creds = await safeInvoke<OpenMicLiveKitToken>('GetSlotLiveKitToken', roomId, slotId)
      if (creds) setSlotLivekit(creds)
      return creds
    },
  }
}
