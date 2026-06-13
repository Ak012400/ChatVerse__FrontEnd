import { useEffect, useMemo, useState } from 'react'
import { Music, Users, Disc3, ExternalLink, Plus } from 'lucide-react'
import { roomsApi } from '../../api'
import { useChatStore } from '../../stores/chatStore'
import type { Message, SpotifyEmbedRef } from '../../types'

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
  createdAt:    string
}

export function SpotifyJukeboxPanel({
  slug,
  onAddTrack,
}: {
  slug: string
  onAddTrack?: () => void
}) {
  const [seedTracks, setSeedTracks] = useState<JukeboxTrack[]>([])
  const [loading, setLoading] = useState(true)

  // ── 1. One-shot REST load — gives us the warm queue on first paint.
  //    After this we never re-fetch; live updates flow through the chat
  //    store via the SignalR ReceiveMessage handler in useChatHub.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    roomsApi
      .getSpotifyTracks(slug, 20)
      .then((res) => {
        if (cancelled) return
        const list: JukeboxTrack[] = res.data?.data?.tracks ?? []
        setSeedTracks(list)
      })
      .catch(() => { /* offline / 404 — panel just shows empty */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  // ── 2. Derive live additions from the chat store. Anything in the
  //    store that's a Spotify-bearing room message is a candidate.
  const liveMessages = useChatStore((s) => s.messages[slug] ?? [])

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
        createdAt:    m.createdAt,
      }))

    // De-dupe (REST seed + live might overlap on first load) and put
    // newest first so "Now Playing" is always index 0.
    const seen = new Set<string>()
    const merged: JukeboxTrack[] = []
    for (const t of [...fromLive, ...seedTracks]) {
      if (seen.has(t.messageId)) continue
      seen.add(t.messageId)
      merged.push(t)
    }
    merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    return merged.slice(0, 20)
  }, [liveMessages, seedTracks])

  const nowPlaying = tracks[0]
  const upNext = tracks.slice(1)
  const uniqueCurators = new Set(tracks.map((t) => t.senderId)).size

  return (
    <aside className="w-full sm:w-[320px] shrink-0 h-full overflow-y-auto
                      border-l border-[var(--color-line)] bg-[var(--color-surface-1)]">
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

      {/* Now Playing */}
      <div className="px-4 py-3 border-b border-[var(--color-line)]">
        <p className="text-[10px] uppercase tracking-wider text-[#1DB954] font-semibold mb-2">
          {nowPlaying ? 'Now Playing' : 'Nothing here yet'}
        </p>

        {loading && !nowPlaying ? (
          <div className="h-20 rounded-xl bg-[var(--color-surface-2)] animate-pulse" />
        ) : nowPlaying ? (
          <>
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
            <p className="text-[11px] text-[var(--color-fg-mute)] mt-2 flex items-center gap-1">
              <Music size={10} /> Shared by{' '}
              <span className="text-[var(--color-fg)] font-medium">{nowPlaying.senderName}</span>
            </p>
          </>
        ) : (
          <div className="px-3 py-4 rounded-xl border border-dashed border-[var(--color-line)]
                          text-center text-xs text-[var(--color-fg-mute)]">
            Paste a Spotify link in chat to start the vibe.
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
              <QueueRow key={t.messageId} track={t} />
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

/**
 * One row in the "Up Next" queue. Click expands the static row into a
 * live iframe — same lazy-load policy as <SpotifyEmbed> in the chat
 * bubble. Keeps initial paint snappy even with 20 queued tracks.
 */
function QueueRow({ track }: { track: JukeboxTrack }) {
  const [open, setOpen] = useState(false)
  const tall = track.spotify.kind !== 'track'

  if (open) {
    return (
      <li>
        <iframe
          title={`Spotify ${track.spotify.kind}`}
          src={track.spotify.embedUrl}
          width="100%"
          height={tall ? 380 : 80}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          style={{ border: 0, borderRadius: 10 }}
        />
        <p className="text-[10px] text-[var(--color-fg-mute)] mt-1 px-1">
          {track.senderName}
        </p>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
                   bg-[var(--color-surface-2)] hover:bg-[#1DB954]/10
                   border border-transparent hover:border-[#1DB954]/30
                   transition-colors text-left group cursor-pointer"
        title="Tap to play"
        aria-label={`Play ${track.spotify.kind}`}
      >
        <span className="w-7 h-7 rounded-md bg-[#1DB954]/85 flex items-center justify-center shrink-0">
          <Music size={12} className="text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] text-[#1DB954] uppercase tracking-wide font-semibold leading-tight">
            {track.spotify.kind}
          </span>
          <span className="block text-[11px] text-[var(--color-fg-mute)] truncate leading-tight">
            {track.senderName}
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
    </li>
  )
}
