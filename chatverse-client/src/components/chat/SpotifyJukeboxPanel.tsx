import { useEffect, useMemo, useRef, useState } from 'react'
import { Music, Users, Disc3, ExternalLink, Plus, Trash2, X, Play, ChevronDown } from 'lucide-react'
import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import type { Message, SpotifyEmbedRef } from '../../types'

// ── localStorage-backed per-user view state ──────────────────────────
//  Music Lounge hides tracks at the VIEW layer (not the data layer) so
//  one user clearing their list doesn't wipe history for everyone in
//  the room. Two keys per room slug:
//    • clearedBefore: timestamp — anything older is hidden
//    • hiddenSet:     specific message-ids the user has individually
//                     removed (newer than clearedBefore but still hidden)
const lsClearedKey = (slug: string) => `chatverse:musicLounge:clearedBefore:${slug}`
const lsHiddenKey  = (slug: string) => `chatverse:musicLounge:hidden:${slug}`

function readClearedBefore(slug: string): number {
  try {
    const v = localStorage.getItem(lsClearedKey(slug))
    return v ? Number(v) || 0 : 0
  } catch { return 0 }
}
function writeClearedBefore(slug: string, ts: number) {
  try { localStorage.setItem(lsClearedKey(slug), String(ts)) } catch { /* ignore */ }
}
function readHidden(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(lsHiddenKey(slug))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? arr as string[] : [])
  } catch { return new Set() }
}
function writeHidden(slug: string, set: Set<string>) {
  try { localStorage.setItem(lsHiddenKey(slug), JSON.stringify([...set])) } catch { /* ignore */ }
}

/**
 * Curated Spotify playlists for the one-tap share buttons. Each preset
 * sends a normal chat message containing the URL — the backend's
 * SpotifyLinkExtractor + oEmbed enricher handle the rest, so the
 * preset row reuses the same path a manual paste does.
 *
 * The IDs are public, owner = Spotify, and unlikely to change. If one
 * ever 404s the share still goes through as a plain message; the panel
 * just won't get a new "Now Playing".
 */
const PRESETS: { emoji: string; label: string; url: string }[] = [
  { emoji: '🎧', label: 'Lo-Fi',     url: 'https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4FyS8kM' },
  { emoji: '🇮🇳', label: 'Bollywood', url: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM' },
  { emoji: '💪', label: 'Workout',   url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP' },
  { emoji: '😴', label: 'Sleep',     url: 'https://open.spotify.com/playlist/37i9dQZF1DWZd79rJ6a7lp' },
]

/** Reactions surfaced on the Now Playing card. Tied to ChatHub.ReactToMessage. */
const TRACK_REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '❤️', label: 'love' },
  { emoji: '🔥', label: 'fire' },
  { emoji: '✨', label: 'vibe' },
]

// Cache the last successful seed fetch per slug so navigating away and
// back doesn't refetch — and a known 404 is remembered so we stop
// hitting an endpoint that doesn't exist yet on this backend deployment.
type SeedCache = { tracks: JukeboxTrack[]; status: 'ok' | 'missing' | 'error' }
const SEED_CACHE = new Map<string, SeedCache>()
// Stable reference so the Zustand selector doesn't re-trigger renders
// on every unrelated store update (a fresh `[]` literal would).
const EMPTY_MESSAGES: Message[] = []

/**
 * Music Lounge side panel — turns a normal chat room into a casual
 * "listening party" without needing Spotify Premium or OAuth.
 *
 * Data sources:
 *   1. Initial paint = REST `/rooms/{slug}/spotify-tracks` so the panel
 *      lights up immediately on join.
 *   2. Live updates = piggy-back on the chat store's existing message
 *      stream. Any new message with a `.spotify` field becomes the new
 *      "Now Playing" automatically — the panel re-derives state on
 *      each render, so we never duplicate moderation logic here.
 *
 * Why "tap to load" for queued items:
 *   Spotify iframes auto-fetch ~50 KB of script + the album art the
 *   moment they mount. Rendering 20 of them on initial paint torches
 *   bandwidth and crashes mobile Safari. Only the Now Playing track
 *   gets a live iframe; the rest are static cards until clicked.
 */
interface JukeboxTrack {
  messageId:    string
  senderId:     string
  senderName:   string
  senderAvatar: string | null
  caption:      string
  spotify:      SpotifyEmbedRef
  reactions:    Record<string, string[]>
  createdAt:    string
}

export function SpotifyJukeboxPanel({
  slug,
  isConnected = true,
  onAddTrack,
  onShareUrl,
  onReact,
}: {
  slug: string
  /** Lets the panel queue preset clicks when the hub is still mid-handshake. */
  isConnected?: boolean
  onAddTrack?: () => void
  /** Send a Spotify URL to the room via the chat hub (preset buttons). */
  onShareUrl?: (url: string) => void
  /** Toggle a reaction on a specific message via the chat hub. */
  onReact?: (messageId: string, emoji: string) => void
}) {
  // ── Pending preset share queue ──────────────────────────────
  //  If the user taps a preset while the hub is still connecting,
  //  buffer the URL here and flush as soon as `isConnected` flips true.
  //  Each pending URL also drives a small spinner inside its tile so
  //  the user gets immediate feedback ("yes, your click was heard").
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isConnected || pending.size === 0 || !onShareUrl) return
    // Snapshot so we don't lose values added between callback fires.
    const toSend = Array.from(pending)
    setPending(new Set())
    for (const url of toSend) onShareUrl(url)
  }, [isConnected, pending, onShareUrl])

  const handlePresetClick = (url: string) => {
    if (!onShareUrl) return
    if (isConnected) {
      onShareUrl(url)
      return
    }
    // Queue it. Set short-circuits duplicate clicks on the same preset.
    setPending((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }
  const myUserId = useAuthStore((s) => s.user?.userId)
  const cached = SEED_CACHE.get(slug)
  const [seedTracks, setSeedTracks] = useState<JukeboxTrack[]>(cached?.tracks ?? [])
  const [seedStatus, setSeedStatus] = useState<SeedCache['status'] | 'pending'>(
    cached?.status ?? 'pending',
  )
  const lastFetchedSlug = useRef<string | null>(cached ? slug : null)

  // ── 1. One-shot REST load — gives us the warm queue on first paint.
  //    After this we never re-fetch; live updates flow through the chat
  //    store via the SignalR ReceiveMessage handler in useChatHub.
  //
  //    StrictMode double-invokes effects in dev; lastFetchedSlug gates
  //    the redundant call. We also remember a 404 in SEED_CACHE so we
  //    stop hammering an endpoint that this backend deployment hasn't
  //    shipped yet (cold-load history is just unavailable in that case
  //    — live SignalR messages still populate the panel normally).
  useEffect(() => {
    if (lastFetchedSlug.current === slug && SEED_CACHE.has(slug)) return
    lastFetchedSlug.current = slug

    let cancelled = false
    roomsApi
      .getSpotifyTracks(slug, 20)
      .then((res) => {
        if (cancelled) return
        const list: JukeboxTrack[] = res.data?.data?.tracks ?? []
        SEED_CACHE.set(slug, { tracks: list, status: 'ok' })
        setSeedTracks(list)
        setSeedStatus('ok')
      })
      .catch((err) => {
        if (cancelled) return
        const status: SeedCache['status'] =
          err?.response?.status === 404 ? 'missing' : 'error'
        SEED_CACHE.set(slug, { tracks: [], status })
        setSeedStatus(status)
        if (status === 'missing') {
          // eslint-disable-next-line no-console
          console.info(
            '[SpotifyJukeboxPanel] /spotify-tracks endpoint not deployed on this backend yet — falling back to live-only mode.',
          )
        }
      })
    return () => { cancelled = true }
  }, [slug])

  // ── 2. Derive live additions from the chat store. Anything in the
  //    store that's a Spotify-bearing room message is a candidate.
  //    Stable empty-array fallback prevents the selector from churning
  //    a new reference on every unrelated chatStore update.
  const liveMessages = useChatStore((s) => s.messages[slug] ?? EMPTY_MESSAGES)

  // ── Per-user hide state ──────────────────────────────────────
  //  clearedBefore = unix ms; anything older is hidden for THIS user
  //  hidden        = explicit message-ids the user dismissed one-by-one
  //  Both reset on slug change so the previous room's hides don't leak.
  const [clearedBefore, setClearedBefore] = useState<number>(() => readClearedBefore(slug))
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(slug))

  useEffect(() => {
    setClearedBefore(readClearedBefore(slug))
    setHidden(readHidden(slug))
  }, [slug])

  // Now Playing starts COLLAPSED. We don't want to bulldoze new joiners
  // with a 380px iframe the moment they walk in — same reasoning as the
  // hover-to-react design. They can tap to expand whenever they want.
  // We keep a ref of "the messageId we last allowed to auto-stay-open"
  // so if the user expanded, then a NEW track is shared by someone else,
  // we collapse back instead of swapping iframes under their feet.
  const [nowPlayingExpandedFor, setNowPlayingExpandedFor] = useState<string | null>(null)

  const tracks = useMemo<JukeboxTrack[]>(() => {
    const fromLive: JukeboxTrack[] = liveMessages
      .filter((m): m is Message & { spotify: SpotifyEmbedRef } =>
        Boolean(m.spotify) && m.modStatus !== 'blocked')
      .map((m) => ({
        messageId:    m.id,
        senderId:     m.senderId,
        senderName:   m.senderName,
        senderAvatar: m.senderAvatar,
        caption:      m.content,
        spotify:      m.spotify!,
        reactions:    m.reactions ?? {},
        createdAt:    m.createdAt,
      }))

    // De-dupe (REST seed + live might overlap on first load) and put
    // newest first so "Now Playing" is always index 0. Live entries
    // win over seed entries because they carry the latest reactions
    // state pushed by ChatHub.
    const seen = new Set<string>()
    const merged: JukeboxTrack[] = []
    for (const t of [...fromLive, ...seedTracks]) {
      if (seen.has(t.messageId)) continue
      seen.add(t.messageId)
      merged.push(t)
    }
    merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

    // Apply view-layer hides — clearedBefore wipes anything older than
    // the cut, hidden filters specific message-ids the user dismissed.
    return merged
      .filter((t) => {
        const ts = +new Date(t.createdAt)
        if (clearedBefore > 0 && ts <= clearedBefore) return false
        if (hidden.has(t.messageId)) return false
        return true
      })
      .slice(0, 20)
  }, [liveMessages, seedTracks, clearedBefore, hidden])

  const nowPlaying = tracks[0]
  const upNext = tracks.slice(1)
  const uniqueCurators = new Set(tracks.map((t) => t.senderId)).size

  // Whether Now Playing should render its iframe right now.
  // Stays collapsed by default; user must opt-in by clicking.
  const isNowPlayingOpen = !!nowPlaying && nowPlayingExpandedFor === nowPlaying.messageId

  const hideTrack = (messageId: string) => {
    const next = new Set(hidden)
    next.add(messageId)
    setHidden(next)
    writeHidden(slug, next)
    if (nowPlayingExpandedFor === messageId) setNowPlayingExpandedFor(null)
  }

  const clearAllHistory = () => {
    // Take "now" as the cut. Anything currently in the panel disappears
    // for this user only; future shares will appear normally.
    const ts = Date.now()
    setClearedBefore(ts)
    writeClearedBefore(slug, ts)
    // Also clear the explicit hidden set so it doesn't accumulate cruft.
    setHidden(new Set())
    writeHidden(slug, new Set())
    setNowPlayingExpandedFor(null)
  }

  return (
    <aside
      // Width is controlled by the parent on desktop (so users can
      // drag-to-resize via the ResizableSplit handle). On mobile we
      // stay full-width inside the bottom-sheet container.
      className="w-full h-full overflow-y-auto bg-[var(--color-surface-1)]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-line)] flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1DB954]/15 flex items-center justify-center">
          <Disc3 size={15} className="text-[#1DB954]" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-fg)] leading-tight">
            Music Lounge
          </h3>
          <p className="text-[10px] text-[var(--color-fg-mute)] flex items-center gap-1 leading-tight">
            <Users size={9} /> {uniqueCurators} curator{uniqueCurators === 1 ? '' : 's'}
            <span className="mx-1">·</span>
            {tracks.length} track{tracks.length === 1 ? '' : 's'}
          </p>
        </div>
        {tracks.length > 0 && (
          <ClearButton onConfirm={clearAllHistory} />
        )}
        {onAddTrack && (
          <button
            onClick={onAddTrack}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)]
                       text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            title="Paste a Spotify link into chat"
            aria-label="Add a track"
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Preset share row — one-tap drop of curated playlists. The
          server's SpotifyLinkExtractor + oEmbed picks it up just like a
          manual paste, so the user instantly populates the Now Playing
          card without needing to know any Spotify URL by heart.

          While the hub is still mid-handshake, clicks are queued: each
          queued tile shows a spinner instead of its emoji, and the
          actual share fires the moment the connection lands. */}
      {onShareUrl && (
        <div className="px-3 py-2 border-b border-[var(--color-line)] flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => {
            const isQueued = pending.has(p.url)
            const disabled = isQueued
            return (
              <button
                key={p.label}
                onClick={() => handlePresetClick(p.url)}
                disabled={disabled}
                className={[
                  'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
                  'text-[11px] font-medium transition-colors',
                  'border',
                  isQueued
                    ? 'bg-[#1DB954]/15 border-[#1DB954]/40 text-[var(--color-fg)] cursor-wait'
                    : 'bg-[var(--color-surface-2)] hover:bg-[#1DB954]/15 border-transparent hover:border-[#1DB954]/30 text-[var(--color-fg)]',
                ].join(' ')}
                title={
                  isQueued
                    ? 'Waiting for chat to connect — will share automatically'
                    : `Share ${p.label} playlist`
                }
                aria-label={`Share ${p.label} playlist`}
                aria-busy={isQueued}
              >
                {isQueued ? (
                  <span
                    className="w-3 h-3 rounded-full border-[1.5px] border-[#1DB954] border-t-transparent"
                    style={{ animation: 'spin 0.7s linear infinite' }}
                    aria-hidden
                  />
                ) : (
                  <span aria-hidden>{p.emoji}</span>
                )}
                {p.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Now Playing */}
      <div className="px-4 py-3 border-b border-[var(--color-line)]">
        <p className="text-[10px] uppercase tracking-wider text-[#1DB954] font-semibold mb-2">
          {nowPlaying ? 'Now Playing' : 'Nothing here yet'}
        </p>

        {seedStatus === 'pending' && !nowPlaying ? (
          <div className="h-20 rounded-xl bg-[var(--color-surface-2)] animate-pulse" />
        ) : nowPlaying ? (
          <>
            {/* Compact card — clickable to expand into iframe. We DON'T
                auto-mount the iframe so new users entering the room
                aren't smacked with a 380px playlist player. Click to
                load player, click ✕ to dismiss the track from your list. */}
            {!isNowPlayingOpen ? (
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => setNowPlayingExpandedFor(nowPlaying.messageId)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl
                             bg-[#1DB954]/10 hover:bg-[#1DB954]/20
                             border border-[#1DB954]/30 transition-colors
                             text-left cursor-pointer"
                  aria-label={`Play ${nowPlaying.spotify.title ?? nowPlaying.spotify.kind}`}
                  title="Tap to load player"
                >
                  {nowPlaying.spotify.thumbnailUrl ? (
                    <img
                      src={nowPlaying.spotify.thumbnailUrl}
                      alt=""
                      className="w-11 h-11 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-11 h-11 flex items-center justify-center rounded-md bg-[#1DB954]/85 shrink-0">
                      <Music size={16} className="text-white" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-[var(--color-fg)] truncate leading-tight">
                      {nowPlaying.spotify.title ?? `Spotify ${nowPlaying.spotify.kind}`}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wide text-[#1DB954] font-semibold truncate">
                      {nowPlaying.spotify.kind}
                    </span>
                  </span>
                  <span className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center shrink-0">
                    <Play size={13} className="text-white ml-0.5" fill="white" />
                  </span>
                </button>

                {/* Per-track remove — appears on hover, removes ONLY for
                    the current user (others still see this track). */}
                <button
                  onClick={() => hideTrack(nowPlaying.messageId)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full
                             bg-[var(--color-surface-1)] border border-[var(--color-line)]
                             flex items-center justify-center
                             opacity-0 group-hover:opacity-100 transition-opacity
                             text-[var(--color-fg-mute)] hover:text-[var(--color-danger)]"
                  title="Remove from your list"
                  aria-label="Remove from your list"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="relative">
                {/* Expanded — actual iframe player + tiny "collapse" pill
                    so users can dismiss the big block when they're done. */}
                <iframe
                  key={nowPlaying.messageId}
                  title={`Now playing — ${nowPlaying.spotify.kind}`}
                  src={nowPlaying.spotify.embedUrl}
                  width="100%"
                  height={nowPlaying.spotify.kind === 'track' ? 80 : 380}
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  style={{ border: 0, borderRadius: 12 }}
                />
                <button
                  onClick={() => setNowPlayingExpandedFor(null)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full
                             bg-black/55 hover:bg-black/80 backdrop-blur
                             text-white flex items-center justify-center"
                  title="Collapse player"
                  aria-label="Collapse player"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            )}

            {/* Reactions row — clickable emojis bound to the message's
                reactions map. Counts come straight from the server, so
                every user sees the same numbers. */}
            {onReact && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {TRACK_REACTIONS.map((r) => {
                  const userIds = nowPlaying.reactions[r.emoji] ?? []
                  const mine = !!myUserId && userIds.includes(myUserId)
                  return (
                    <button
                      key={r.emoji}
                      onClick={() => onReact(nowPlaying.messageId, r.emoji)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px]
                        border transition-colors
                        ${mine
                          ? 'bg-[#1DB954]/20 border-[#1DB954]/50 text-[var(--color-fg)]'
                          : 'bg-[var(--color-surface-2)] border-transparent hover:bg-[#1DB954]/10 hover:border-[#1DB954]/30 text-[var(--color-fg-mute)]'}
                      `}
                      title={r.label}
                      aria-label={`React with ${r.label}`}
                      aria-pressed={mine}
                    >
                      <span aria-hidden>{r.emoji}</span>
                      {userIds.length > 0 && (
                        <span className="font-semibold">{userIds.length}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <p className="text-[11px] text-[var(--color-fg-mute)] mt-2 flex items-center gap-1">
              <Music size={10} /> Shared by{' '}
              <span className="text-[var(--color-fg)] font-medium">{nowPlaying.senderName}</span>
            </p>
          </>
        ) : (
          <div className="px-3 py-4 rounded-xl border border-dashed border-[var(--color-line)]
                          text-center text-xs text-[var(--color-fg-mute)]">
            Paste a Spotify link in chat — or tap a preset above — to start the vibe.
          </div>
        )}
      </div>

      {/* Up Next */}
      {upNext.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-mute)] font-semibold mb-2">
            Up Next · {upNext.length}
          </p>
          <ul className="flex flex-col gap-1.5">
            {upNext.map((t) => (
              <QueueRow
                key={t.messageId}
                track={t}
                onRemove={() => hideTrack(t.messageId)}
              />
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

/**
 * Two-step clear button — first click arms it (showing "Sure?"), second
 * click confirms. Avoids both a modal (overkill) and accidental wipes
 * from a misclick. Auto-disarms after 4s if untouched.
 */
function ClearButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  if (armed) {
    return (
      <button
        onClick={() => { setArmed(false); onConfirm() }}
        className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider
                   bg-[var(--color-danger-soft)] text-[var(--color-danger)]
                   border border-[var(--color-danger-border)]
                   hover:bg-[var(--color-danger)] hover:text-white transition-colors"
        title="Click again to confirm — clears the list for you only"
      >
        Sure?
      </button>
    )
  }
  return (
    <button
      onClick={() => setArmed(true)}
      className="p-1.5 rounded-md hover:bg-[var(--color-surface-2)]
                 text-[var(--color-fg-mute)] hover:text-[var(--color-danger)]"
      title="Clear your music history (this room only)"
      aria-label="Clear your music history"
    >
      <Trash2 size={14} />
    </button>
  )
}

/**
 * One row in the "Up Next" queue. Click expands the static row into a
 * live iframe — same lazy-load policy as <SpotifyEmbed> in the chat
 * bubble. Keeps initial paint snappy even with 20 queued tracks.
 */
function QueueRow({
  track,
  onRemove,
}: {
  track: JukeboxTrack
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  const tall = track.spotify.kind !== 'track'

  if (open) {
    return (
      <li className="relative group">
        <iframe
          title={`Spotify ${track.spotify.kind}`}
          src={track.spotify.embedUrl}
          width="100%"
          height={tall ? 380 : 80}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          style={{ border: 0, borderRadius: 10 }}
        />
        <div className="flex items-center justify-between mt-1 px-1">
          <p className="text-[10px] text-[var(--color-fg-mute)]">
            {track.senderName}
          </p>
          <button
            onClick={() => setOpen(false)}
            className="text-[10px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            title="Collapse"
          >
            collapse
          </button>
        </div>
      </li>
    )
  }

  // Prefer real title when oEmbed enriched the row; fall back to the
  // sender's name so the row still reads as something other than blank.
  const titleText = track.spotify.title ?? track.senderName
  const subText = track.spotify.title ? track.senderName : track.spotify.kind

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
                   bg-[var(--color-surface-2)] hover:bg-[#1DB954]/10
                   border border-transparent hover:border-[#1DB954]/30
                   transition-colors text-left cursor-pointer"
        title="Tap to play"
        aria-label={`Play ${track.spotify.kind}`}
      >
        {track.spotify.thumbnailUrl ? (
          <img
            src={track.spotify.thumbnailUrl}
            alt=""
            className="w-7 h-7 rounded-md object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="w-7 h-7 rounded-md bg-[#1DB954]/85 flex items-center justify-center shrink-0">
            <Music size={12} className="text-white" />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-[var(--color-fg)] font-semibold truncate leading-tight">
            {titleText}
          </span>
          <span className="block text-[10px] text-[var(--color-fg-mute)] truncate leading-tight">
            {subText}
          </span>
        </span>
        <a
          href={track.spotify.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[var(--color-fg-mute)] group-hover:text-[var(--color-fg)] shrink-0 p-0.5"
          aria-label="Open in Spotify"
          title="Open in Spotify"
        >
          <ExternalLink size={12} />
        </a>
      </button>

      {/* Per-track remove — appears on hover. Hides the track for the
          current user only; other room members still see it. */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="absolute top-1/2 -translate-y-1/2 -right-1 w-5 h-5 rounded-full
                     bg-[var(--color-surface-1)] border border-[var(--color-line)]
                     flex items-center justify-center
                     opacity-0 group-hover:opacity-100 transition-opacity
                     text-[var(--color-fg-mute)] hover:text-[var(--color-danger)]"
          title="Remove from your list"
          aria-label="Remove from your list"
        >
          <X size={10} />
        </button>
      )}
    </li>
  )
}
