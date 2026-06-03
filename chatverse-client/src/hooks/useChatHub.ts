import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useDmStore, type DmMessage } from '../stores/dmStore'
import type { Message } from '../types'

const HUB_URL = (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api').replace('/api', '') + '/hubs/chat'

let globalLastWarnedScore: number | null = null

export function useChatHub() {
  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const connectionPromiseRef = useRef<Promise<void> | null>(null)

  const token = useAuthStore((s) => s.token)
  const { addMessage, updateMsgStatus, removeMessage, setMessages, setOnlineCount, setTyping } = useChatStore()
  const { showToast } = useToastStore()

  const connect = useCallback(async () => {
    if (!token) return
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) return
    if (connectionPromiseRef.current) return connectionPromiseRef.current

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_URL}?access_token=${token}`, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .build()

    hub.on('ReceiveMessage', (msg: Message) => { if (msg.modStatus !== 'blocked') addMessage(msg.roomId, msg) })
    hub.on('RoomHistory', ({ roomSlug, messages }: { roomSlug: string; messages: Message[] }) => {
      const clean = [...messages].reverse().filter((m) => m.modStatus !== 'blocked')
      setMessages(roomSlug, clean)
    })
    hub.on('MessageBlocked', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) removeMessage(slug, messageId)
      showToast({ type: 'danger', title: '🚫 Blocked', message: 'Message removed.', duration: 5000 })
    })
    hub.on('MessageFlagged', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) updateMsgStatus(slug, messageId, 'flagged')
    })
    hub.on('TrustWarning', ({ score }: { score: number }) => {
      const auth = useAuthStore.getState()
      if (globalLastWarnedScore !== score && score < (auth.user?.trustScore ?? 100)) {
        globalLastWarnedScore = score
        showToast({ type: 'warning', title: '⚠️ Score dropped', message: `Score: ${score}/100`, duration: 5000 })
      }
    })
    hub.on('UserTyping', ({ username }: { username: string }) => {
      const activeRoom = useChatStore.getState().activeRoom
      if (activeRoom) setTyping(activeRoom, username)
    })
    hub.on('UserJoined', ({ activeCount, roomSlug }: any) => setOnlineCount(roomSlug, activeCount))
    hub.on('UserLeft', ({ activeCount, roomSlug }: any) => setOnlineCount(roomSlug, activeCount))
    hub.on('Error', (msg: string) => showToast({ type: 'error', title: 'Error', message: msg, duration: 4000 }))

    // ─── DM events ────────────────────────────────────────────
    hub.on('ReceiveDm', (msg: DmMessage) => {
      const me = useAuthStore.getState().user?.userId
      if (!me) return
      const dm = useDmStore.getState()
      const otherUserId = msg.senderId === me ? msg.recipientId : msg.senderId
      dm.appendToThread(otherUserId, msg)
      dm.upsertConversationFromMessage(msg, me)
    })

    hub.on('DmTyping', ({ conversationId, senderName }: { conversationId: string; senderName: string }) => {
      useDmStore.getState().setTyping(conversationId, senderName)
    })

    hub.on('DmRead', ({ readerId }: { conversationId: string; readerId: string }) => {
      void readerId
    })

    const startPromise = hub.start()
      .then(() => { connectionRef.current = hub })
      .catch(() => { connectionRef.current = null })
      .finally(() => { connectionPromiseRef.current = null })

    connectionPromiseRef.current = startPromise
    return startPromise
  }, [token])

  const disconnect = useCallback(async () => {
    if (connectionPromiseRef.current) {
      try { await connectionPromiseRef.current } catch { /* ignore */ }
    }
    if (connectionRef.current) {
      await connectionRef.current.stop()
      connectionRef.current = null
    }
  }, [])

  useEffect(() => {
    connect()
    return () => { disconnect() }
  }, [connect, disconnect])

  /* Smart + silent auto-reconnect — quiet for ambient calls */
  const safeInvoke = async (method: string, ...args: any[]) => {
    try {
      if (connectionRef.current?.state === signalR.HubConnectionState.Disconnected) {
        await connect()
      } else if (!connectionRef.current && connectionPromiseRef.current) {
        await connectionPromiseRef.current
      } else if (!connectionRef.current) {
        await connect()
      }

      if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
        await connectionRef.current.invoke(method, ...args)
      } else if (method !== 'JoinRoom' && method !== 'LeaveRoom' && method !== 'SendTyping' && method !== 'SendDmTyping') {
        showToast({ type: 'error', title: 'Network issue', message: 'Reconnecting to chat…', duration: 2000 })
      }
    } catch (err) {
      console.error(`[ChatHub] Action ${method} failed:`, err)
      if (method !== 'JoinRoom' && method !== 'LeaveRoom' && method !== 'SendTyping' && method !== 'SendDmTyping') {
        showToast({ type: 'error', title: 'Action failed', message: 'Could not complete request.', duration: 2000 })
      }
    }
  }

  return {
    getConnection: () => connectionRef.current,
    joinRoom: (slug: string) => safeInvoke('JoinRoom', slug),
    leaveRoom: (slug: string) => safeInvoke('LeaveRoom', slug),
    sendMessage: (slug: string, content: string, type = 'text', mediaUrl: string | null = null, replyToId?: string) =>
      safeInvoke('SendMessage', slug, content, type, mediaUrl, replyToId ?? null),
    sendTyping: (slug: string) => safeInvoke('SendTyping', slug),
    reactToMessage: (slug: string, messageId: string, emoji: string) => safeInvoke('ReactToMessage', slug, messageId, emoji),
    sendDm: (recipientId: string, content: string) => safeInvoke('SendDm', recipientId, content),
    sendDmTyping: (recipientId: string) => safeInvoke('SendDmTyping', recipientId),
    markDmRead: (otherUserId: string) => safeInvoke('MarkDmRead', otherUserId),
    isConnected: () => connectionRef.current?.state === signalR.HubConnectionState.Connected,
    safeInvoke,
  }
}
