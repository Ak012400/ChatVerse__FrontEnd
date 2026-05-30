import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import type { Message } from '../types'

const HUB_URL = (import.meta.env.VITE_API_URL ?? 'https://localhost:7217/api')
  .replace('/api', '') + '/hubs/chat'

// 💥 GLOBAL VARIABLE (React के बाहर) - यह कभी रीसेट नहीं होगा!
let globalLastWarnedScore: number | null = null;

export function useChatHub() {
  const connection = useRef<signalR.HubConnection | null>(null)
  
  const token = useAuthStore((s) => s.token)
  const { addMessage, updateMsgStatus, removeMessage, setMessages, setOnlineCount, setTyping } = useChatStore()
  const { showToast } = useToastStore()

  useEffect(() => {
    if (!token) return

    // useChatHub.ts में यह पक्का करो कि access_token query parameter में जा रहा है
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL + `?access_token=${token}`, { // 👈 टोकन यहाँ पास करना ज़रूरी है
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true 
      })
      .withAutomaticReconnect()
      .build();

    hub.on('ReceiveMessage', (msg: Message) => {
      if (msg.modStatus === 'blocked') return
      addMessage(msg.roomId, msg)
    })

    hub.on('RoomHistory', ({ roomSlug, messages }: { roomSlug: string; messages: Message[] }) => {
      const clean = [...messages].reverse().filter((m) => m.modStatus !== 'blocked')
      setMessages(roomSlug, clean)
    })

    hub.on('MessageBlocked', ({ messageId }: { messageId: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) removeMessage(slug, messageId)

      showToast({
        type: 'danger',
        title: '🚫 Message Blocked',
        message: 'Your message violated policies and was removed.',
        duration: 5000,
      })
    })

    hub.on('MessageFlagged', ({ messageId, reason }: { messageId: string; reason: string }) => {
      const rooms = useChatStore.getState().messages
      for (const slug in rooms) updateMsgStatus(slug, messageId, 'flagged')
    })

    // ── 100% BULLETPROOF TRUST WARNING FIX ────────────────────────
    hub.on('TrustWarning', ({ score, band }: { score: number; band: string }) => {
      const auth = useAuthStore.getState()
      const currentScore = auth.user?.trustScore ?? 100

      // अगर इसी सेम स्कोर पर पहले वार्निंग मिल चुकी है, तो तुरंत कोड रोक दो (Ignore)
      if (globalLastWarnedScore === score) return;

      // टोस्ट सिर्फ तब दिखाओ जब स्कोर सच में पिछले वाले से कम हो
      if (score < currentScore) {
        
        globalLastWarnedScore = score; // ग्लोबल मेमोरी में सेव कर लिया
        
        if (score <= 40) {
          showToast({ type: 'danger', title: '🛡️ Trust Score Critical', message: `Your trust score dropped to ${score}/100.`, duration: 8000 })
        } else if (score <= 60) {
          showToast({ type: 'warning', title: '⚠️ Trust Score Dropped', message: `Your trust score dropped to ${score}/100 due to a violation.`, duration: 6000 })
        }
        
        // Zustand स्टोर में नया स्कोर अपडेट कर दो
        if (auth.user && auth.token) {
          auth.setAuth({ ...auth.user, trustScore: score }, auth.token)
        }
      }
    })

    hub.on('UserTyping', ({ username }: { username: string }) => {
      const auth = useAuthStore.getState()
      if (username === auth.user?.username) return
      const activeRoom = useChatStore.getState().activeRoom
      if (activeRoom) setTyping(activeRoom, username)
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

  const joinRoom = useCallback(async (slug: string) => { await connection.current?.invoke('JoinRoom', slug) }, [])
  const leaveRoom = useCallback(async (slug: string) => { await connection.current?.invoke('LeaveRoom', slug) }, [])
  const sendMessage = useCallback(async (slug: string, content: string, type: string = "text", mediaUrl: string | null = null, replyToId?: string) => {
    await connection.current?.invoke('SendMessage', slug, content, type, mediaUrl, replyToId ?? null)
  }, [])
  const sendTyping = useCallback(async (slug: string) => { await connection.current?.invoke('SendTyping', slug) }, [])
  const reactToMessage = useCallback(async (slug: string, messageId: string, emoji: string) => {
    await connection.current?.invoke('ReactToMessage', slug, messageId, emoji)
  }, [])
  
  const isConnected = () => connection.current?.state === signalR.HubConnectionState.Connected

  return { joinRoom, leaveRoom, sendMessage, sendTyping, reactToMessage, isConnected }
}