import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatHub } from '../../hooks/useChatHub'
import type { Room } from '../../types'

export default function ChatPage() {
  const { slug }                        = useParams()
  const navigate                        = useNavigate()
  const user                            = useAuthStore((s) => s.user)
  const { rooms, setRooms, messages,
          activeRoom, setActiveRoom }    = useChatStore()
  const { joinRoom, leaveRoom,
          sendMessage, sendTyping }      = useChatHub()
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const messagesEndRef                   = useRef<HTMLDivElement>(null)

  // Load rooms
  useEffect(() => {
    roomsApi.getAll().then((res) => setRooms(res.data.data ?? []))
  }, [])

  // Join room when slug changes
  useEffect(() => {
    if (!slug) return
    setActiveRoom(slug)
    joinRoom(slug)
    return () => { leaveRoom(slug) }
  }, [slug])

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages[slug ?? '']])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !slug) return
    setLoading(true)
    try {
      await sendMessage(slug, input.trim())
      setInput('')
    } finally {
      setLoading(false)
    }
  }

  const currentMessages = messages[slug ?? ''] ?? []

  return (
    <div className="flex h-screen bg-gray-950 text-white">

      {/* ── Sidebar — rooms list ── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <span className="font-bold text-lg">ChatVerse</span>
          </div>
          <p className="mt-1 text-xs text-gray-500 truncate">
            @{user?.username}
            {user?.isGuest && <span className="ml-1 text-yellow-600">(guest)</span>}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-4 py-2 text-xs text-gray-600 uppercase tracking-wider">Rooms</p>
          {rooms.map((room) => (
            <button
              key={room.slug}
              onClick={() => navigate(`/chat/${room.slug}`)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left
                         hover:bg-gray-900 transition
                         ${slug === room.slug ? 'bg-gray-900 border-r-2 border-indigo-500' : ''}`}
            >
              <span className="text-xl">{room.iconEmoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{room.displayName}</p>
                <p className="text-xs text-gray-500">
                  {room.activeNow > 0 ? `${room.activeNow} online` : 'No one here'}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom nav */}
        <div className="border-t border-gray-800 p-2 flex gap-1">
          <button
            onClick={() => navigate('/video')}
            className="flex-1 py-2 rounded-lg hover:bg-gray-900 text-gray-400
                       hover:text-white text-sm transition text-center"
          >
            📹 Video
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="flex-1 py-2 rounded-lg hover:bg-gray-900 text-gray-400
                       hover:text-white text-sm transition text-center"
          >
            👤 Profile
          </button>
        </div>
      </div>

      {/* ── Main chat area ── */}
      {slug ? (
        <div className="flex-1 flex flex-col">

          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <span className="text-2xl">
              {rooms.find((r) => r.slug === slug)?.iconEmoji ?? '💬'}
            </span>
            <div>
              <h2 className="font-semibold">
                {rooms.find((r) => r.slug === slug)?.displayName ?? slug}
              </h2>
              <p className="text-xs text-gray-500">
                {rooms.find((r) => r.slug === slug)?.description}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {currentMessages.length === 0 && (
              <div className="text-center text-gray-600 py-12">
                No messages yet. Say hi! 👋
              </div>
            )}
            {currentMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.senderId === user?.userId ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-700 flex items-center
                                justify-center text-sm font-bold flex-shrink-0">
                  {msg.senderName[0].toUpperCase()}
                </div>

                {/* Bubble */}
                <div className={`max-w-xs lg:max-w-md ${msg.senderId === user?.userId ? 'items-end' : 'items-start'} flex flex-col`}>
                  {msg.senderId !== user?.userId && (
                    <p className="text-xs text-gray-500 mb-1 px-1">{msg.senderName}</p>
                  )}
                  <div className={`px-4 py-2 rounded-2xl text-sm
                    ${msg.senderId === user?.userId
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-100 rounded-tl-sm'}
                    ${msg.modStatus === 'flagged' ? 'opacity-60 border border-yellow-700' : ''}
                  `}>
                    {msg.content}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="px-6 py-4 border-t border-gray-800 flex gap-3"
          >
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (slug) sendTyping(slug)
              }}
              placeholder={`Message #${slug}...`}
              maxLength={2000}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800
                         text-white placeholder-gray-600 focus:outline-none
                         focus:border-indigo-500 transition"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         text-white font-medium transition disabled:opacity-40"
            >
              Send
            </button>
          </form>

        </div>
      ) : (
        /* No room selected */
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <p className="text-4xl mb-4">👈</p>
            <p className="text-lg">Select a room to start chatting</p>
          </div>
        </div>
      )}
    </div>
  )
}
