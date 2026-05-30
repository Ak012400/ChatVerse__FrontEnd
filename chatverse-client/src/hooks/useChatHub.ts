import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import type { Message } from '../types'

const HUB_URL = (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
  .replace('/api', '') + '/hubs/chat'

export function useChatHub() {
  const connection = useRef<signalR.HubConnection | null>(null)
  const token      = useAuthStore((s) => s.token)
  const user       = useAuthStore((s) => s.user)
  const {
    addMessage,
    updateMsgStatus,
    removeMessage,
    setMessages,
    setOnlineCount,
  } = useChatStore()
  const { showToast } = useToastStore()

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

    // ── Message received ─────────────────────────────────────
    hub.on('ReceiveMessage', (msg: Message) => {
      // Never show blocked messages
      if (msg.modStatus === 'blocked') return
      addMessage(msg.roomId, msg)
    })

    // ── Room history ─────────────────────────────────────────
    hub.on('RoomHistory', ({ roomSlug, messages }: { roomSlug: string; messages: Message[] }) => {
      // Filter out blocked messages from history too
      const clean = [...messages]
        .reverse()
        .filter((m) => m.modStatus !== 'blocked')
      setMessages(roomSlug, clean)
    })

    // ── Message BLOCKED ───────────────────────────────────────
    hub.on('MessageBlocked', ({ messageId }: { messageId: string }) => {
      // Remove from ALL rooms immediately
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) {
        removeMessage(slug, messageId)
      }

      // Show warning toast only if it was THIS user's message
      const myMessages = Object.values(useChatStore.getState().messages)
        .flat()
        .find((m) => m.id === messageId)

      // Always show if sender — check by looking at store before removal
      showToast({
        type:    'warning',
        title:   '⚠️ Message Removed',
        message: 'Your message was removed by AI moderation. Repeated violations will reduce your trust score and limit your access.',
        duration: 6000,
      })
    })

    // ── Message FLAGGED ───────────────────────────────────────
    hub.on('MessageFlagged', ({ messageId, reason }: { messageId: string; reason: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) {
        updateMsgStatus(slug, messageId, 'flagged')
      }
    })

    // ── Trust score warning ───────────────────────────────────
    hub.on('TrustWarning', ({ score, band }: { score: number; band: string }) => {
      if (score <= 40) {
        showToast({
          type:    'danger',
          title:   '🛡️ Trust Score Critical',
          message: `Your trust score is ${score}/100 (${band}). You may lose access to rooms and video chat. Stop sending harmful content.`,
          duration: 8000,
        })
      } else if (score <= 60) {
        showToast({
          type:    'warning',
          title:   '⚠️ Trust Score Low',
          message: `Your trust score dropped to ${score}/100. Continued violations may restrict your access to ChatVerse features.`,
          duration: 6000,
        })
      }
    })

    hub.on('UserJoined', ({ activeCount, roomSlug }: { activeCount: number; roomSlug: string }) => {
      setOnlineCount(roomSlug, activeCount)
    })

    hub.on('UserLeft', ({ activeCount, roomSlug }: { activeCount: number; roomSlug: string }) => {
      setOnlineCount(roomSlug, activeCount)
    })

    hub.on('Error', (msg: string) => {
      showToast({ type: 'error', title: 'Error', message: msg, duration: 4000 })
    })

    hub.start()
      .then(() => console.log('[ChatHub] connected'))
      .catch((err) => console.error('[ChatHub]', err))

    connection.current = hub
    return () => { hub.stop(); connection.current = null }
  }, [token])

  const joinRoom     = useCallback(async (slug: string) => { await connection.current?.invoke('JoinRoom', slug) }, [])
  const leaveRoom    = useCallback(async (slug: string) => { await connection.current?.invoke('LeaveRoom', slug) }, [])
  const sendMessage  = useCallback(async (slug: string, content: string, replyToId?: string) => {
    await connection.current?.invoke('SendMessage', slug, content, replyToId ?? null)
  }, [])
  const sendTyping   = useCallback(async (slug: string) => { await connection.current?.invoke('SendTyping', slug) }, [])
  const reactToMessage = useCallback(async (slug: string, messageId: string, emoji: string) => {
    await connection.current?.invoke('ReactToMessage', slug, messageId, emoji)
  }, [])
  const isConnected  = () => connection.current?.state === signalR.HubConnectionState.Connected

  return { joinRoom, leaveRoom, sendMessage, sendTyping, reactToMessage, isConnected }
}