import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Smile, Paperclip, Send, Hash, Users, ShieldAlert, Ban } from 'lucide-react'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import * as nsfwjs from 'nsfwjs'

import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatHub } from '../../hooks/useChatHub'
import { useToastStore } from '../../stores/toastStore'

import Loader from '../../components/ui/Loader'
import Avatar from '../../components/ui/Avatar'
import IconButton from '../../components/ui/IconButton'

export default function ChatPage() {
  const { slug } = useParams()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()
  const { rooms, setRooms, messages, typingUsers, onlineCount, setActiveRoom } = useChatStore()
  const { joinRoom, leaveRoom, sendTyping, sendMessage, isConnected } = useChatHub()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isImageScanning, setIsImageScanning] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)

  const emojiRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const room = rooms.find((r) => r.slug === slug)
  const liveCount = slug ? onlineCount[slug] ?? room?.activeNow ?? 0 : 0

  useEffect(() => {
    setIsPageLoading(true)
    roomsApi
      .getAll()
      .then((res) => setRooms(res.data.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setIsPageLoading(false))
  }, [setRooms])

  useEffect(() => {
    if (!slug) return
    setActiveRoom(slug)
    setIsChatLoading(true)
    setShowEmoji(false)

    let isMounted = true
    const timer = setTimeout(() => {
      if (!isMounted) return
      joinRoom(slug)
        .catch((err) => console.error('Join Room failed:', err))
        .finally(() => {
          if (isMounted) setIsChatLoading(false)
        })
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
      leaveRoom(slug)
    }
  }, [slug])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages[slug ?? ''], typingUsers[slug ?? '']])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !slug) return

    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', title: 'Invalid file', message: 'Only images are allowed.', duration: 3000 })
      return
    }

    setIsImageScanning(true)

    try {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('Image failed to load.'))
        img.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > 350) {
        height = Math.round((height * 350) / width)
        width = 350
      }
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported.')

      ctx.drawImage(img, 0, 0, width, height)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6)

      let isNSFW = false
      try {
        const model = await nsfwjs.load()
        const predictions = await model.classify(img)
        isNSFW = predictions.some(
          (p) => ['Porn', 'Hentai', 'Sexy'].includes(p.className) && p.probability > 0.6,
        )
      } catch (nsfwErr) {
        console.warn('NSFW model load failed; allowing image through.', nsfwErr)
      }

      if (isNSFW) {
        showToast({
          type: 'danger',
          title: 'Blocked',
          message: 'Inappropriate image detected.',
          duration: 5000,
        })
        return
      }

      try {
        await sendMessage(slug, '', 'ephemeral_image', compressedBase64)
        showToast({ type: 'success', title: 'Sent', message: 'Vanish image sent.', duration: 2000 })
      } catch (sendErr) {
        console.error('Send error:', sendErr)
        showToast({
          type: 'error',
          title: 'Network issue',
          message: 'Failed to send image.',
          duration: 3000,
        })
      }
    } catch (err: any) {
      console.error('Image error:', err)
      showToast({ type: 'error', title: 'Error', message: 'Something went wrong.', duration: 3000 })
    } finally {
      setIsImageScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !slug) return
    setIsSending(true)
    setShowEmoji(false)
    try {
      await sendMessage(slug, input.trim(), 'text', null)
      setInput('')
      inputRef.current?.focus()
    } finally {
      setIsSending(false)
    }
  }

  if (isPageLoading) return <Loader variant="page-skeleton" />

  // Empty state — no room selected
  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center">
          <Hash size={28} className="mx-auto text-[var(--color-fg-mute)] mb-3" />
          <p className="text-sm font-medium text-[var(--color-fg)]">Pick a room</p>
          <p className="text-xs text-[var(--color-fg-faint)] mt-1">
            Choose any room from the sidebar to start chatting.
          </p>
        </div>
      </div>
    )
  }

  const typing = typingUsers[slug] ?? []
  const messageList = messages[slug] ?? []

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* Header */}
      <header className="h-14 px-5 border-b border-[var(--color-line)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Hash size={16} className="text-[var(--color-fg-faint)] shrink-0" />
          <h2 className="text-[15px] font-semibold tracking-tight truncate">
            {room?.displayName ?? slug}
          </h2>
          {room?.description && (
            <>
              <span className="text-[var(--color-fg-mute)]">·</span>
              <p className="text-xs text-[var(--color-fg-faint)] truncate">{room.description}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {liveCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--color-fg-faint)]">
              <Users size={13} />
              <span className="tabular-nums">{liveCount}</span>
            </div>
          )}
          <div
            className={`flex items-center gap-1.5 text-[11px] ${
              isConnected() ? 'text-[var(--color-fg-faint)]' : 'text-[var(--color-warning)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected() ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'
              }`}
            />
            {isConnected() ? 'Connected' : 'Connecting…'}
          </div>
        </div>
      </header>

      {/* Messages */}
      {isChatLoading ? (
        <Loader variant="chat-skeleton" />
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {messageList.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-[var(--color-fg-mute)]">
                No messages yet. Be the first to say something.
              </p>
            </div>
          ) : (
            messageList.map((msg, idx) => {
              const isMine = msg.senderId === user?.userId
              const prev = messageList[idx - 1]
              const showHeader = !prev || prev.senderId !== msg.senderId

              return (
                <div
                  key={msg.id}
                  className={`group flex gap-2.5 ${isMine ? 'flex-row-reverse' : ''} ${
                    showHeader ? 'mt-3' : 'mt-0.5'
                  }`}
                >
                  <div className={`shrink-0 w-8 ${showHeader ? '' : 'invisible'}`}>
                    {showHeader && <Avatar size="sm" name={msg.senderName} />}
                  </div>

                  <div
                    className={`flex flex-col max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    {showHeader && !isMine && (
                      <p className="text-[11px] text-[var(--color-fg-faint)] mb-0.5 px-0.5 font-medium">
                        {msg.senderName}
                      </p>
                    )}

                    <MessageBubble msg={msg} isMine={isMine} />
                  </div>
                </div>
              )
            })
          )}

          {/* Typing indicator */}
          {typing.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 mt-2">
              <Loader variant="typing" text={`${typing.join(', ')} typing`} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Composer */}
      <div className="px-5 py-3 border-t border-[var(--color-line)] relative shrink-0">
        {showEmoji && (
          <div
            ref={emojiRef}
            className="absolute bottom-[68px] left-5 z-50 rounded-md overflow-hidden shadow-lg"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(e) => {
                setInput((prev) => prev + e.emoji)
                if (slug) sendTyping(slug)
              }}
            />
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <IconButton
            type="button"
            variant="subtle"
            aria-label="Pick emoji"
            onClick={() => setShowEmoji((s) => !s)}
            active={showEmoji}
          >
            <Smile size={16} />
          </IconButton>

          <IconButton
            type="button"
            variant="subtle"
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImageScanning || !isConnected()}
          >
            {isImageScanning ? (
              <span
                className="w-3.5 h-3.5 rounded-full border-[1.5px] border-current border-t-transparent"
                style={{ animation: 'spin 0.7s linear infinite' }}
              />
            ) : (
              <Paperclip size={16} />
            )}
          </IconButton>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageUpload}
          />

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (slug) sendTyping(slug)
            }}
            placeholder={`Message #${slug}`}
            disabled={!isConnected()}
            className="flex-1 h-9 px-3 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-line)]
              text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-mute)]
              focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]
              transition-colors"
          />

          <button
            type="submit"
            disabled={!input.trim() || isSending || !isConnected()}
            className="h-9 px-3.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
              text-white text-sm font-medium transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              inline-flex items-center justify-center gap-1.5 focus-ring"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Message bubble — kept inline for proximity to the page logic.
───────────────────────────────────────────────────────────── */
function MessageBubble({
  msg,
  isMine,
}: {
  msg: import('../../types').Message
  isMine: boolean
}) {
  const baseRadius = isMine ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tl-md'

  if (msg.modStatus === 'flagged') {
    return (
      <div className="px-3 py-2 rounded-md bg-[var(--color-warning-soft)] border border-[rgba(245,158,11,0.3)]
        text-[var(--color-warning)] text-xs flex items-center gap-2 italic">
        <ShieldAlert size={13} />
        Hidden by moderation.
      </div>
    )
  }

  if (msg.modStatus === 'blocked') {
    return (
      <div className="px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[rgba(239,68,68,0.3)]
        text-[var(--color-danger)] text-xs flex items-center gap-2 italic">
        <Ban size={13} />
        Removed by moderation.
      </div>
    )
  }

  if (msg.type === 'ephemeral_image' && msg.mediaUrl) {
    return (
      <div className={`relative p-1 ${baseRadius}
        ${isMine ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-2)]'}`}>
        <img
          src={msg.mediaUrl}
          alt="Vanish mode"
          className="rounded-md w-36 sm:w-44 max-h-52 object-cover"
        />
        <span className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white/80 flex items-center gap-1 backdrop-blur">
          👻 Vanish
        </span>
      </div>
    )
  }

  return (
    <div
      className={`px-3 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${baseRadius}
        ${
          isMine
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'
        }`}
    >
      {msg.content}
    </div>
  )
}
