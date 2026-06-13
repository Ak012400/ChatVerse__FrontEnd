import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Smile, Paperclip, Send, Hash, Users, ShieldAlert, Ban, Gamepad2, X } from 'lucide-react'
import GameLauncherModal from '../../components/games/GameLauncherModal'
import ActiveGamesPanel from '../../components/games/ActiveGamesPanel'
import AmbientQuestionCard from '../../components/chat/AmbientQuestionCard'
import TechNewsPanel from '../../components/chat/TechNewsPanel'
import RollingQuizPanel from '../../components/chat/RollingQuizPanel'
import QuizRoomPage from '../games/QuizRoomPage'
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
import TranslateButton from '../../components/chat/TranslateButton'
import { SpotifyEmbed } from '../../components/chat/SpotifyEmbed'
import { useTranslation, detectLanguage, preferredLanguageCode } from '../../hooks/useTranslation'

export default function ChatPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { showToast } = useToastStore()
  const { rooms, setRooms, messages, typingUsers, onlineCount, setActiveRoom } = useChatStore()
  // Ambient question + dismissal tracking for this specific room. We
  // read them as separate selectors so unrelated chat updates don't
  // re-render the card.
  const ambientQuestion = useChatStore((s) => (slug ? s.ambientQuestion[slug] : undefined))
  const dismissedAmbientSet = useChatStore((s) => (slug ? s.dismissedAmbient[slug] : undefined))
  const dismissAmbient = useChatStore((s) => s.dismissAmbient)
  const {
    joinRoom, leaveRoom, sendTyping, sendMessage, isConnected,
    submitRollingQuizAnswer, getRollingQuizState,
  } = useChatHub()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isImageScanning, setIsImageScanning] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)

  // ─── Embedded game state ──────────────────────────────────────────
  // Some themed chat rooms (Gaming Lounge, Mini Game) get an inline
  // "Start a game" affordance. Launching opens the picker modal, and
  // on success we stash the new room's slug here — the layout below
  // splits horizontally so the live quiz sits alongside the chat
  // thread (instead of yanking the user to a different page).
  const [showGameLauncher, setShowGameLauncher] = useState(false)
  const [embeddedGameSlug, setEmbeddedGameSlug] = useState<string | null>(null)
  // Whitelist of chat slugs that get the game affordance. Keeping it
  // explicit (vs an "all rooms get it" rule) means non-gaming themed
  // rooms aren't cluttered with a button that doesn't fit their vibe.
  // The matching is "starts with" so room name variants ("gaming-lounge",
  // "gaming-lounge-2") all qualify.
  const GAMEABLE_PREFIXES = ['gaming-lounge', 'mini-game', 'gaming', 'mini']
  const TECH_PREFIXES = ['tech-talk', 'tech']
  const isGameableRoom = useMemo(
    () => !!slug && GAMEABLE_PREFIXES.some((p) => slug.toLowerCase().startsWith(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug],
  )
  const isTechRoom = useMemo(
    () => !!slug && TECH_PREFIXES.some((p) => slug.toLowerCase().startsWith(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug],
  )
  // #general gets the always-on Rolling Quiz + live leaderboard.
  // Match exact "general" only — variants like "general-2" would
  // need their own SignalR group on the backend to receive pushes.
  const isGeneralRoom = slug === 'general'

  const emojiRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const room = rooms.find((r) => r.slug === slug)
  const liveCount = slug ? onlineCount[slug] ?? room?.activeNow ?? 0 : 0

  // Per-message translation. The reader's preferred language is sniffed
  // once at mount; we re-sniff on focus events in case the user changes
  // it via the i18n switcher mid-session.
  const translation = useTranslation()
  const [readerLang, setReaderLang] = useState<string>(() => preferredLanguageCode())
  useEffect(() => {
    const refresh = () => setReaderLang(preferredLanguageCode())
    window.addEventListener('focus', refresh)
    window.addEventListener('languagechange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('languagechange', refresh)
    }
  }, [])

  useEffect(() => {
    setIsPageLoading(true)
    // Fetch public list + the user's joined private rooms in parallel.
    // Merging here keeps the sidebar a single source of truth.
    Promise.all([
      roomsApi.getAll().catch(() => null),
      roomsApi.mine().catch(() => null),
    ])
      .then(([publicRes, mineRes]) => {
        const publics = (publicRes?.data?.data ?? []) as any[]
        const mine = ((mineRes?.data?.data ?? []) as any[]).map((r) => ({ ...r, isPrivate: true }))
        // Dedupe by slug; private wins so the badge survives.
        const map = new Map<string, any>()
        for (const r of publics) map.set(r.slug, r)
        for (const r of mine) map.set(r.slug, r)
        setRooms(Array.from(map.values()))
      })
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
          {/* "Start a game" affordance — visible only on gameable rooms.
              Once a game is embedded, the button disables to avoid
              accidentally launching a second concurrent room. */}
          {isGameableRoom && (
            <button
              onClick={() => setShowGameLauncher(true)}
              disabled={!!embeddedGameSlug}
              className={[
                'hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                embeddedGameSlug
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-mute)] cursor-not-allowed'
                  : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white',
              ].join(' ')}
              title={embeddedGameSlug ? 'A game is already running in this room' : 'Start a game'}
            >
              <Gamepad2 size={12} />
              {embeddedGameSlug ? 'Game running' : 'Start a game'}
            </button>
          )}
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

      {/* Launcher modal — controlled from header button.
          On success the chat layout splits and the new room ID
          becomes the embedded panel's slug. The sourceChatSlug
          arg tags the resulting game so OTHER members of this chat
          see it in their Active Games panel (when Public). */}
      <GameLauncherModal
        open={showGameLauncher}
        onClose={() => setShowGameLauncher(false)}
        onCreated={(s, gameType) => {
          setShowGameLauncher(false)
          // Quiz v2: EVERY game now opens as a dedicated full page —
          // the embedded side panel was too cramped for the new quiz
          // UI (answer chips, cheers, podium). Chess/Ludo keep their
          // overlay; Quiz/Jokes go to the existing /games/:slug route.
          // Embed plumbing below stays intact in case we want a
          // mini-view again later.
          if (gameType === 'Chess') {
            window.location.assign(`/play/${s}`)
          } else if (gameType === 'Ludo') {
            navigate(`/ludo/${s}`)
          } else {
            navigate(`/games/${s}`)
          }
        }}
        defaultName={room?.displayName ? `${room.displayName} quiz` : undefined}
        sourceChatSlug={isGameableRoom ? slug : undefined}
      />

      {/* Active Games discovery panel — only rendered for gameable
          rooms. Hidden once a game is embedded so it doesn't compete
          with the active room for screen real estate. */}
      {isGameableRoom && slug && !embeddedGameSlug && (
        <ActiveGamesPanel
          sourceChatSlug={slug}
          onPickRoom={(s, type) => {
            // Mirror the launcher's dispatch rule (see onCreated above):
            // heavy board-based games go to a dedicated full-screen page;
            // light embedded games stay alongside chat.
            //
            // Without this branch, EVERY joiner — including spectators of
            // a chess room — got dropped into the embedded QuizRoomPage
            // shell, which silently rendered the "Waiting to start" lobby
            // for ALL room types. That's why creators saw the chess board
            // but joiners saw a quiz UI: the panel never told us the type.
            if (type === 'Chess') {
              navigate(`/play/${s}`)
            } else if (type === 'Ludo') {
              navigate(`/ludo/${s}`)
            } else {
              // Quiz v2: full page instead of the cramped embed.
              navigate(`/games/${s}`)
            }
          }}
          onStartGame={() => setShowGameLauncher(true)}
        />
      )}

      {/* Tech Talk news feed — only mounted in tech-talk* slugs.
          Click "Share" on any article seeds a quoted chat reply so
          the room can start a thread on the headline. */}
      {isTechRoom && slug && (
        <TechNewsPanel onShareToChat={(text) => sendMessage(slug, text)} />
      )}

      {/* Rolling quiz with daily leaderboard — #general only.
          Hydrate on mount fetches the current question + today's
          leaderboard so new joiners see the live state immediately. */}
      {isGeneralRoom && (
        <RollingQuizPanel
          onSubmit={(qId, idx) => submitRollingQuizAnswer(qId, idx)}
          onHydrate={() => getRollingQuizState()}
        />
      )}

      {/* Split layout — chat on the left, embedded game on the right.
          When no game is active, chat fills the full width as before. */}
      <div className={[
        'flex-1 min-h-0 flex',
        embeddedGameSlug ? 'flex-col lg:flex-row' : 'flex-col',
      ].join(' ')}>
        {/* CHAT COLUMN (left when split, full when not) */}
        <div
          className={[
            'flex flex-col min-h-0',
            embeddedGameSlug
              ? 'flex-1 lg:flex-[2] lg:max-w-[40%] border-b lg:border-b-0 lg:border-r border-[var(--color-line)]'
              : 'flex-1',
          ].join(' ')}
        >
      {/* Ambient question card — only shown for gameable rooms,
          when a question is live AND this viewer hasn't dismissed
          it. Dismissal is local-only so other members keep seeing it. */}
      {isGameableRoom && ambientQuestion && !dismissedAmbientSet?.has(ambientQuestion.id) && slug && (
        <AmbientQuestionCard
          question={ambientQuestion}
          onSeedReply={(text) => { sendMessage(slug, text) }}
          onDismiss={() => dismissAmbient(slug, ambientQuestion.id)}
        />
      )}

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
                      <p className="text-[11px] text-[var(--color-fg-faint)] mb-0.5 px-0.5 font-medium flex items-center gap-1.5">
                        <span>{msg.senderName}</span>
                        {/* AI host badge — backend marks these with
                            senderType="ai_host". We disclose to users that
                            some hosts in low-activity rooms are AI. */}
                        {(msg as any).senderType === 'ai_host' && (
                          <span
                            title="This user is an AI host that keeps rooms active when humans are away."
                            className="inline-flex items-center px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-accent-soft)] text-[var(--color-accent-fg)] border border-[var(--color-accent-soft)]"
                          >
                            AI
                          </span>
                        )}
                      </p>
                    )}

                    <MessageBubble msg={msg} isMine={isMine} />

                    {/* Translate trigger — only for plain text messages
                        whose language differs from the reader's. Skip
                        for own messages (you understand your own
                        language) and AI host messages (already in your
                        room's mix). */}
                    {(() => {
                      if (isMine) return null
                      if ((msg as any).senderType === 'ai_host') return null
                      if (msg.type && msg.type !== 'text') return null
                      const detected = detectLanguage(msg.content)
                      if (!detected || detected === readerLang) return null
                      const tx = translation.get(msg.id)
                      const state =
                        tx?.loading ? 'loading'
                          : tx?.translated ? 'shown'
                          : tx?.error ? 'error'
                          : 'idle'
                      return (
                        <div className="mt-0.5 px-0.5 flex flex-col gap-0.5">
                          {tx?.translated && (
                            <p className="text-[12px] text-[var(--color-fg-dim)] italic leading-snug border-l-2 border-[var(--color-accent-soft)] pl-2">
                              {tx.translated}
                            </p>
                          )}
                          <TranslateButton
                            state={state as any}
                            onTranslate={() => translation.translate(msg.id, msg.content, readerLang)}
                            onHide={() => translation.clear(msg.id)}
                          />
                        </div>
                      )
                    })()}
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

      {/* Composer — tighter padding + smaller icons on mobile so all of
          emoji/attach/send + input fit on a 360px screen without
          horizontal scroll. */}
      <div className="px-2.5 sm:px-5 py-2 sm:py-3 border-t border-[var(--color-line)] relative shrink-0">
        {showEmoji && (
          <div
            ref={emojiRef}
            className="absolute bottom-[62px] sm:bottom-[68px] left-2 sm:left-5 right-2 sm:right-auto z-50 rounded-md overflow-hidden shadow-lg"
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

        <form onSubmit={handleSend} className="flex items-center gap-1.5 sm:gap-2">
          <IconButton
            type="button"
            variant="subtle"
            size="sm"
            aria-label="Pick emoji"
            onClick={() => setShowEmoji((s) => !s)}
            active={showEmoji}
            className="sm:w-9 sm:h-9 shrink-0"
          >
            <Smile size={15} />
          </IconButton>

          <IconButton
            type="button"
            variant="subtle"
            size="sm"
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImageScanning || !isConnected()}
            className="sm:w-9 sm:h-9 shrink-0"
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
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
              text-white text-sm font-medium
              transition-[background-color,transform] duration-150 active:scale-[0.92]
              disabled:opacity-40 disabled:cursor-not-allowed
              inline-flex items-center justify-center gap-1.5 focus-ring shrink-0"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
        {/* ── End of CHAT COLUMN ── */}
        </div>

        {/* GAME PANEL — only mounted when an embedded game is active.
            The QuizRoomPage is reused with explicit slug + onLeave
            props (compactMode hides its built-in chat rail since the
            host already has chat alongside). */}
        {embeddedGameSlug && (
          <div className="flex-1 lg:flex-[3] min-h-0 flex flex-col bg-[var(--color-bg)]">
            <div className="shrink-0 h-9 px-3 border-b border-[var(--color-line)] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-mute)]">
                Live game
              </span>
              <button
                onClick={() => setEmbeddedGameSlug(null)}
                className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg-dim)] transition-colors"
                aria-label="Close game panel"
                title="Close game (you'll leave the room)"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <QuizRoomPage
                slug={embeddedGameSlug}
                onLeave={() => setEmbeddedGameSlug(null)}
                compactMode
              />
            </div>
          </div>
        )}
      </div>
      {/* ── End of SPLIT LAYOUT ── */}
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
      <div className="px-3 py-2 rounded-md bg-[var(--color-warning-soft)] border border-[var(--color-warning-border)]
        text-[var(--color-warning)] text-xs flex items-center gap-2 italic">
        <ShieldAlert size={13} />
        Hidden by moderation.
      </div>
    )
  }

  if (msg.modStatus === 'blocked') {
    return (
      <div className="px-3 py-2 rounded-md bg-[var(--color-danger-soft)] border border-[var(--color-danger-border)]
        text-[var(--color-danger)] text-xs flex items-center gap-2 italic">
        <Ban size={13} />
        Removed by moderation.
      </div>
    )
  }

  if (msg.type === 'ephemeral_image' && msg.mediaUrl) {
    // Server now broadcasts ephemeral images with modStatus="pending"
    // (the old client-trusted "clean" was a bypass for moderation).
    // While pending we keep the image visible but blurred so the reader
    // gets a hint of context without exposing unmoderated content; once
    // the server flips the row to "clean" the blur drops.
    const isPending = msg.modStatus === 'pending'
    return (
      <div className={`relative p-1 ${baseRadius}
        ${isMine ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-2)]'}`}>
        <img
          src={msg.mediaUrl}
          alt="Vanish mode"
          className={`rounded-md w-36 sm:w-44 max-h-52 object-cover transition-all
            ${isPending ? 'blur-md scale-105' : ''}`}
        />
        {isPending && (
          <span className="absolute inset-0 flex items-center justify-center
            text-[10px] font-medium text-white/90 bg-black/30 rounded-md pointer-events-none">
            Awaiting moderation…
          </span>
        )}
        <span className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-white/80 flex items-center gap-1 backdrop-blur">
          👻 Vanish
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 items-stretch">
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
      {msg.spotify && <SpotifyEmbed embed={msg.spotify} />}
    </div>
  )
}
