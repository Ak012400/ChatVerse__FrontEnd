import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import type { Message } from '../types'

const HUB_URL = (import.meta.env.VITE_API_URL ?? 'https://localhost:7217')
  .replace('/api', '') + '/hubs/chat'

export function useChatHub() {
  const connection = useRef<signalR.HubConnection | null>(null)
  const token      = useAuthStore((s) => s.token)
  const {
    addMessage,
    updateMsgStatus,
    removeMessage,
    setMessages,
    setOnlineCount,
  } = useChatStore()

  // Build + connect
  useEffect(() => {
    if (!token) return

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    // ── Event handlers ──────────────────────────────────────
    hub.on('ReceiveMessage', (msg: Message) => {
      addMessage(msg.roomId, msg)
    })

    hub.on('RoomHistory', ({ roomSlug, messages }: { roomSlug: string; messages: Message[] }) => {
      setMessages(roomSlug, [...messages].reverse())
    })

    hub.on('MessageBlocked', ({ messageId }: { messageId: string }) => {
      // Remove blocked message from all rooms
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) {
        removeMessage(slug, messageId)
      }
    })

    hub.on('MessageFlagged', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) {
        updateMsgStatus(slug, messageId, 'flagged')
      }
    })

    hub.on('UserJoined', ({ activeCount, roomSlug }: { activeCount: number; roomSlug: string }) => {
      setOnlineCount(roomSlug, activeCount)
    })

    hub.on('UserLeft', ({ activeCount, roomSlug }: { activeCount: number; roomSlug: string }) => {
      setOnlineCount(roomSlug, activeCount)
    })

    hub.on('Error', (msg: string) => {
      console.error('[ChatHub]', msg)
    })

    hub.start()
      .then(() => console.log('[ChatHub] connected'))
      .catch((err) => console.error('[ChatHub] connection error', err))

    connection.current = hub

    return () => {
      hub.stop()
      connection.current = null
    }
  }, [token])

  // ── Methods exposed to components ───────────────────────────
  const joinRoom = useCallback(async (slug: string) => {
    await connection.current?.invoke('JoinRoom', slug)
  }, [])

  const leaveRoom = useCallback(async (slug: string) => {
    await connection.current?.invoke('LeaveRoom', slug)
  }, [])

  const sendMessage = useCallback(async (
    slug: string, content: string, replyToId?: string
  ) => {
    await connection.current?.invoke('SendMessage', slug, content, replyToId ?? null)
  }, [])

  const sendTyping = useCallback(async (slug: string) => {
    await connection.current?.invoke('SendTyping', slug)
  }, [])

  const reactToMessage = useCallback(async (
    slug: string, messageId: string, emoji: string
  ) => {
    await connection.current?.invoke('ReactToMessage', slug, messageId, emoji)
  }, [])

  const isConnected = () =>
    connection.current?.state === signalR.HubConnectionState.Connected

  return { joinRoom, leaveRoom, sendMessage, sendTyping, reactToMessage, isConnected }
}