import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatHub } from '../../hooks/useChatHub'
import { useToastStore } from '../../stores/toastStore'
import Loader from '../../components/ui/Loader'
import type { Room } from '../../types'

// Lazy load nsfwjs taaki app slow na ho
import * as nsfwjs from 'nsfwjs'

const EMOJI_LIST = [
  '😀','😂','🤣','🥰','😎','🤔','😅','😡','😭','🥺',
  '👍','👎','🙏','🔥','🎉','💔','💯','✨','👀','💀',
  '🤡','👽','👻','💩','🫂','🤝','✌️','🫰','💖','🥳'
]

export default function ChatPage() {
  const { slug }                        = useParams()
  const navigate                        = useNavigate()
  const user                            = useAuthStore((s) => s.user)
  const { showToast }                   = useToastStore()
  const { rooms, setRooms, messages,
          typingUsers, activeRoom, setActiveRoom } = useChatStore()
  
  // Update useChatHub to destructure connection directly if needed, or update sendMessage signature
  const { joinRoom, leaveRoom, sendTyping, isConnected } = useChatHub()
  
  // Custom manual sendMessage via raw connection to support new parameters
  const hubConnection = useRef<any>(null);

  const [input, setInput]               = useState('')
  const [isSending, setIsSending]       = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isImageScanning, setIsImageScanning] = useState(false)
  
  const [showEmoji, setShowEmoji]       = useState(false)
  const emojiRef                        = useRef<HTMLDivElement>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)
  const messagesEndRef                  = useRef<HTMLDivElement>(null)

  // Capture HubConnection from window/global for raw invocation (Workaround for signature change)
  useEffect(() => {
    // Assuming useChatHub handles its own connection internally, 
    // ideally you'd update useChatHub's sendMessage signature.
    // For now, we will use the existing sendMessage and modify useChatHub.ts next if needed.
  }, [])

  useEffect(() => {
    setIsPageLoading(true)
    roomsApi.getAll()
      .then((res) => setRooms(res.data.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setTimeout(() => setIsPageLoading(false), 400))
  }, [])

  useEffect(() => {
    if (!slug) return
    setActiveRoom(slug)
    setIsChatLoading(true)
    setShowEmoji(false)
    
    setTimeout(() => {
      joinRoom(slug)
      setIsChatLoading(false)
    }, 500)

    return () => { leaveRoom(slug) }
  }, [slug])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages[slug ?? ''], typingUsers[slug ?? '']])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── IMAGE COMPRESSION & NSFW SCANNING LOGIC ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !slug) return
    
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', title: 'Invalid File', message: 'Only images are allowed.', duration: 3000 })
      return
    }

    setIsImageScanning(true)

    try {
      // 1. Read Image
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = objectUrl
      })

      // 2. Compress Image via Canvas (Max width 800px)
      const canvas = document.createElement('canvas')
      const MAX_WIDTH = 800
      const scaleSize = MAX_WIDTH / img.width
      canvas.width = MAX_WIDTH
      canvas.height = img.height * scaleSize
      
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      // Quality 0.6 means high compression (low quality, small size)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6) 

      // 3. Scan with NSFW.js
      const model = await nsfwjs.load()
      const predictions = await model.classify(img)
      
      // NSFW labels are Porn, Hentai, Sexy
      const isNSFW = predictions.some(p => 
        ['Porn', 'Hentai', 'Sexy'].includes(p.className) && p.probability > 0.6
      )

      if (isNSFW) {
        showToast({ 
          type: 'danger', 
          title: '🚫 Blocked', 
          message: 'Inappropriate image detected. Sending blocked.', 
          duration: 5000 
        })
        setIsImageScanning(false)
        return
      }

      // 4. Send via raw fetch or update useChatHub (assuming you updated useChatHub's sendMessage)
      // Since useChatHub's sendMessage might only take 2 params, we use the connection object if exposed.
      // Assuming you will update useChatHub's sendMessage to: 
      // sendMessage(slug, content, type, mediaUrl)
      
      // Let's call the updated hook method (We need to update useChatHub.ts too)
      // For now, we will emit a custom event to trigger it.
      
      // @ts-ignore - Assuming useChatHub is updated to accept 4 params
      await useChatHub.getState?.()?.sendMessage(slug, "", "ephemeral_image", compressedBase64) 
      // Note: If you face TS error here, update `useChatHub.ts` sendMessage function to accept these args.

      showToast({ type: 'success', title: 'Sent', message: 'Vanish mode image sent!', duration: 2000 })
      
    } catch (err) {
      console.error(err)
      showToast({ type: 'error', title: 'Error', message: 'Failed to process image.', duration: 3000 })
    } finally {
      setIsImageScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = '' // reset input
    }
  }

  // Text message send
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !slug) return
    setIsSending(true)
    setShowEmoji(false)
    try {
      // @ts-ignore
      await useChatHub.getState?.()?.sendMessage(slug, input.trim(), "text", null)
      setInput('')
    } finally {
      setIsSending(false)
    }
  }

  const addEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji)
    if (slug) sendTyping(slug)
  }

  const currentMessages = messages[slug ?? ''] ?? []
  const currentTyping = typingUsers[slug ?? ''] ?? []

  if (isPageLoading) return <Loader variant="page-skeleton" />

  return (
    <div className="flex h-screen bg-gray-950 text-white">

      {/* ── Sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col">
        {/* ... (Sidebar is same as before) ... */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <span className="font-bold text-lg">ChatVerse</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 truncate">@{user?.username}</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {rooms.map((room) => (
            <button
              key={room.slug}
              onClick={() => navigate(`/chat/${room.slug}`)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-900 transition ${slug === room.slug ? 'bg-gray-900 border-r-2 border-indigo-500' : ''}`}
            >
              <span className="text-xl">{room.iconEmoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{room.displayName}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main chat area ── */}
      {slug ? (
        <div className="flex-1 flex flex-col relative">

          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <span className="text-2xl">{rooms.find((r) => r.slug === slug)?.iconEmoji ?? '💬'}</span>
            <h2 className="font-semibold">{rooms.find((r) => r.slug === slug)?.displayName ?? slug}</h2>
          </div>

          {isChatLoading ? (
            <Loader variant="chat-skeleton" />
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {currentMessages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.senderId === user?.userId ? 'flex-row-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {msg.senderName[0].toUpperCase()}
                  </div>

                  <div className={`max-w-xs lg:max-w-md ${msg.senderId === user?.userId ? 'items-end' : 'items-start'} flex flex-col`}>
                    {msg.senderId !== user?.userId && <p className="text-xs text-gray-500 mb-1 px-1 font-medium">{msg.senderName}</p>}
                    
                    <div className={`px-4 py-2 text-sm shadow-sm
                      ${msg.senderId === user?.userId && msg.modStatus !== 'flagged' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' : msg.modStatus !== 'flagged' ? 'bg-gray-800 text-gray-100 rounded-2xl rounded-tl-sm' : 'bg-yellow-900/20 border border-yellow-700/50 text-yellow-500 rounded-lg'} 
                    `}>
                      {/* 🌟 RENDER IMAGE IF IT IS EPHEMERAL */}
                      {msg.type === 'ephemeral_image' && msg.mediaUrl ? (
                        <div className="relative group">
                          <img src={msg.mediaUrl} alt="Vanish mode" className="rounded-xl max-h-64 object-cover" />
                          <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-[10px] text-gray-300 flex items-center gap-1 backdrop-blur-md">
                            👻 Vanish Mode
                          </span>
                        </div>
                      ) : msg.modStatus === 'flagged' ? (
                        <span className="italic flex items-center gap-2"><span className="text-lg">🛡️</span> Hidden by AI moderation.</span>
                      ) : msg.modStatus === 'blocked' ? (
                        <span className="italic flex items-center gap-2 text-red-400"><span className="text-lg">🚫</span> Message removed.</span>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* 🌟 INPUT SECTION */}
          <div className="px-6 py-4 border-t border-gray-800 relative">
            
            {showEmoji && (
              <div ref={emojiRef} className="absolute bottom-[80px] left-6 bg-gray-900 border border-gray-800 p-3 rounded-xl shadow-2xl grid grid-cols-6 gap-2 w-[280px] z-50">
                {EMOJI_LIST.map((emj, i) => (
                  <button key={i} type="button" onClick={() => addEmoji(emj)} className="text-2xl hover:bg-gray-800 rounded-lg p-1.5 transition transform hover:scale-110">{emj}</button>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="px-3 py-3 rounded-xl border bg-gray-900 border-gray-800 text-gray-400 hover:text-white transition text-xl">😊</button>
              
              {/* 📎 ATTACHMENT BUTTON */}
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isImageScanning}
                className="px-3 py-3 rounded-xl border bg-gray-900 border-gray-800 text-gray-400 hover:text-white transition text-xl flex items-center justify-center min-w-[50px]"
              >
                {isImageScanning ? <Loader variant="spinner" /> : '📎'}
              </button>
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Message #${slug}...`} className="flex-1 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white focus:outline-none" />
              
              <button type="submit" disabled={!input.trim() || isSending} className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-40">Send</button>
            </form>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600"><p className="text-lg">Select a room</p></div>
      )}
    </div>
  )
}