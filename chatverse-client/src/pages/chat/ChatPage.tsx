import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatHub } from '../../hooks/useChatHub'
import { useToastStore } from '../../stores/toastStore'
import Loader from '../../components/ui/Loader'
import EmojiPicker from 'emoji-picker-react' 
import * as nsfwjs from 'nsfwjs'

export default function ChatPage() {
  const { slug }                        = useParams()
  const navigate                        = useNavigate()
  const user                            = useAuthStore((s) => s.user)
  const { showToast }                   = useToastStore()
  const { rooms, setRooms, messages, typingUsers, activeRoom, setActiveRoom } = useChatStore()
  const { joinRoom, leaveRoom, sendTyping, sendMessage, isConnected } = useChatHub()

  const [input, setInput]               = useState('')
  const [isSending, setIsSending]       = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isImageScanning, setIsImageScanning] = useState(false)
  
  const [showEmoji, setShowEmoji]       = useState(false)
  const emojiRef                        = useRef<HTMLDivElement>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)
  const messagesEndRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsPageLoading(true)
    roomsApi.getAll()
      .then((res) => setRooms(res.data.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setIsPageLoading(false))
  }, [])

  // ── 💥 FIX 1: React 18 Strict Mode Network Error Fix ──
  useEffect(() => {
    if (!slug) return
    setActiveRoom(slug)
    setIsChatLoading(true)
    setShowEmoji(false)
    
    let isMounted = true;

    // 300ms ka delay lagaya hai taki multiple click ya React render par false errors na aayen
    const timer = setTimeout(() => {
      if (isMounted) {
        joinRoom(slug)
          .catch((err) => console.error("Join Room Failed:", err))
          .finally(() => {
            if (isMounted) setIsChatLoading(false)
          })
      }
    }, 300)
    
    return () => { 
      isMounted = false;
      clearTimeout(timer);
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
      showToast({ type: 'error', title: 'Invalid File', message: 'Only images are allowed.', duration: 3000 })
      return
    }

    setIsImageScanning(true)

    try {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error("Image failed to load."))
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
      if (!ctx) throw new Error("Canvas support nahi hai browser mein.")
      
      ctx.drawImage(img, 0, 0, width, height)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6) 

      let isNSFW = false;
      try {
        const model = await nsfwjs.load()
        const predictions = await model.classify(img)
        isNSFW = predictions.some(p => ['Porn', 'Hentai', 'Sexy'].includes(p.className) && p.probability > 0.6)
      } catch (nsfwErr) {
        console.warn("AI Model load fail hua, par image jayegi.", nsfwErr)
      }

      if (isNSFW) {
        showToast({ type: 'danger', title: '🚫 Blocked', message: 'Inappropriate image detected.', duration: 5000 })
        setIsImageScanning(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      try {
        await sendMessage(slug, "", "ephemeral_image", compressedBase64) 
        showToast({ type: 'success', title: 'Sent', message: 'Vanish mode image sent!', duration: 2000 })
      } catch (sendErr: any) {
        console.error("SignalR Send Error:", sendErr)
        showToast({ type: 'error', title: 'Network Issue', message: 'Failed to send image.', duration: 3000 })
      }
      
    } catch (err: any) {
      console.error("Image Error:", err)
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
      await sendMessage(slug, input.trim(), "text", null)
      setInput('')
    } finally {
      setIsSending(false)
    }
  }

  if (isPageLoading) return <Loader variant="page-skeleton" />

  return (
    <div className="flex h-screen bg-gray-950 text-white">

      {/* ── Sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col">
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
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{room.displayName}</p></div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      {slug ? (
        <div className="flex-1 flex flex-col relative">

          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <span className="text-2xl">{rooms.find((r) => r.slug === slug)?.iconEmoji ?? '💬'}</span>
            <h2 className="font-semibold">{rooms.find((r) => r.slug === slug)?.displayName ?? slug}</h2>
          </div>

          {/* 💥 FIX 2: Inline Custom Loader jo layout nahi todega */}
          {isChatLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-gray-400 font-medium animate-pulse">Loading Chat...</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages[slug]?.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.senderId === user?.userId ? 'flex-row-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {msg.senderName[0].toUpperCase()}
                  </div>

                  <div className={`flex flex-col ${msg.senderId === user?.userId ? 'items-end' : 'items-start'}`}>
                    {msg.senderId !== user?.userId && <p className="text-xs text-gray-500 mb-1 px-1 font-medium">{msg.senderName}</p>}
                    
                    <div className={`px-4 py-2 text-sm shadow-sm
                      ${msg.senderId === user?.userId && msg.modStatus !== 'flagged' ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' : msg.modStatus !== 'flagged' ? 'bg-gray-800 text-gray-100 rounded-2xl rounded-tl-sm' : 'bg-yellow-900/20 border border-yellow-700/50 text-yellow-500 rounded-lg'} 
                    `}>
                      {msg.type === 'ephemeral_image' && msg.mediaUrl ? (
                        <div className="relative group p-1">
                          <img 
                            src={msg.mediaUrl} 
                            alt="Vanish mode" 
                            className="rounded-lg w-32 sm:w-40 max-h-48 object-cover border border-black/20" 
                          />
                          <span className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-gray-300 flex items-center gap-1 backdrop-blur-md">👻 Vanish</span>
                        </div>
                      ) : msg.modStatus === 'flagged' ? (
                        <span className="italic flex items-center gap-2"><span className="text-lg">🛡️</span> Hidden by AI.</span>
                      ) : msg.modStatus === 'blocked' ? (
                        <span className="italic flex items-center gap-2 text-red-400"><span className="text-lg">🚫</span> Removed.</span>
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
              <div ref={emojiRef} className="absolute bottom-[80px] left-6 z-50 shadow-2xl rounded-xl overflow-hidden">
                <EmojiPicker 
                  onEmojiClick={(e) => {
                    setInput(prev => prev + e.emoji)
                    if (slug) sendTyping(slug)
                  }} 
                  theme="dark" 
                />
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="px-3 py-3 rounded-xl border bg-gray-900 border-gray-800 text-gray-400 hover:text-white transition text-xl">😊</button>
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isImageScanning || !isConnected()}
                className="px-3 py-3 rounded-xl border bg-gray-900 border-gray-800 text-gray-400 hover:text-white transition text-xl flex items-center justify-center min-w-[50px]"
              >
                {isImageScanning ? <Loader variant="spinner" /> : '📎'}
              </button>
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

              <input value={input} onChange={(e) => { setInput(e.target.value); if(slug) sendTyping(slug); }} placeholder={`Message #${slug}...`} className="flex-1 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white focus:outline-none" />
              
              <button type="submit" disabled={!input.trim() || isSending || !isConnected()} className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-40">Send</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600"><p className="text-lg">Select a room</p></div>
      )}
    </div>
  )
}