import { useEffect, useState } from 'react'
import { Music, ExternalLink, Info } from 'lucide-react'
import type { SpotifyEmbedRef } from '../../types'

/**
 * localStorage key for the one-time "log in to Spotify for full songs"
 * hint. Dismissing it persists so we don't nag the same user across
 * every track they play.
 */
const FULL_SONG_HINT_KEY = 'chatverse:spotify:fullSongHintDismissed'

/**
 * Renders a Spotify iframe inline inside a chat bubble.
 *
 * Loading strategy: the iframe starts collapsed behind a tap-to-load
 * "card" so that a room with 50 Spotify links doesn't spawn 50 iframes
 * on first render — that would eat the user's bandwidth, blow up the
 * SignalR reconnect budget, and steal focus on mobile. Once the user
 * decides they want to listen, one click materialises the iframe.
 *
 * The iframe itself uses `loading="lazy"` so that even after expand
 * Chrome/Firefox defer the actual network fetch until the bubble
 * scrolls into view.
 *
 * Sizing: Spotify's official embed heights are 80 (track) / 380 (album,
 * playlist, show, episode, artist). We mirror those so the embed
 * doesn't end up cropped or with a black bar.
 */
export function SpotifyEmbed({ embed }: { embed: SpotifyEmbedRef }) {
  const [open, setOpen] = useState(false)
  // First-time hint about Spotify's preview vs full-song behaviour.
  // We only nag a user once per device — once they dismiss it, they
  // know the deal forever.
  const [showHint, setShowHint] = useState(false)

  // Read the localStorage flag lazily on mount so SSR / first paint
  // isn't blocked by an unnecessary disk read.
  useEffect(() => {
    if (!open) return
    try {
      if (!localStorage.getItem(FULL_SONG_HINT_KEY)) setShowHint(true)
    } catch {
      /* Storage disabled (private mode) — silently skip the hint. */
    }
  }, [open])

  const dismissHint = () => {
    setShowHint(false)
    try { localStorage.setItem(FULL_SONG_HINT_KEY, '1') } catch { /* ignore */ }
  }

  const tall = embed.kind !== 'track'
  const height = tall ? 380 : 80

  if (!open) {
    // Prefer the real track title when oEmbed enrichment populated it;
    // otherwise fall back to the generic "Spotify {kind}" label so a
    // failed enrichment doesn't break the card.
    const titleLine = embed.title ?? `Spotify ${embed.kind}`
    const subLine = embed.title ? `Spotify ${embed.kind}` : 'Tap to load player'

    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 w-full max-w-[340px] flex items-center gap-2.5 px-3 py-2.5
                   rounded-xl bg-[#1DB954]/12 hover:bg-[#1DB954]/20
                   border border-[#1DB954]/30 transition-colors
                   text-left group cursor-pointer"
        aria-label={`Load Spotify ${embed.kind}`}
        title="Tap to load Spotify player"
      >
        {embed.thumbnailUrl ? (
          <img
            src={embed.thumbnailUrl}
            alt=""
            className="w-9 h-9 rounded-md object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1DB954]/90 shrink-0">
            <Music size={16} className="text-white" />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] text-[var(--color-fg)] font-semibold truncate">
            {titleLine}
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-[#1DB954] font-semibold truncate">
            {subLine}
          </span>
        </span>
        <ExternalLink
          size={14}
          className="text-[var(--color-fg-mute)] group-hover:text-[var(--color-fg)] shrink-0"
          onClick={(e) => {
            // Open the canonical URL in a new tab without expanding the
            // iframe — handy for users who'd rather use the native app.
            e.stopPropagation()
            window.open(embed.webUrl, '_blank', 'noopener,noreferrer')
          }}
        />
      </button>
    )
  }

  return (
    <div className="mt-1.5 w-full max-w-[340px] flex flex-col gap-1.5">
      <iframe
        title={`Spotify ${embed.kind}`}
        src={embed.embedUrl}
        width="100%"
        height={height}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style={{ border: 0, borderRadius: 12 }}
      />

      {/* One-time hint about Spotify's preview behaviour. We can't
          bypass this — without a Spotify session in the browser, the
          iframe only plays a 30s preview. Telling users explicitly is
          better than them silently wondering "why does it stop?". */}
      {showHint && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg
                        bg-[#1DB954]/10 border border-[#1DB954]/25
                        text-[10.5px] text-[var(--color-fg-mute)] leading-snug">
          <Info size={12} className="text-[#1DB954] shrink-0 mt-px" />
          <span className="flex-1">
            Hearing only a 30-sec preview? Sign in to{' '}
            <a
              href="https://open.spotify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1DB954] font-semibold underline"
            >
              Spotify
            </a>{' '}
            in another tab — the player here will play the full song.
          </span>
          <button
            onClick={dismissHint}
            className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] px-1 -mr-1 shrink-0"
            aria-label="Got it"
            title="Got it"
          >
            ✕
          </button>
        </div>
      )}

      {/* Prominent "Open in Spotify" CTA — for users who'd rather
          listen in the native app (which always plays the full song,
          no auth dance). Keeps the iframe row clean while exposing
          the alternative one click away. */}
      <a
        href={embed.webUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                   bg-[#1DB954] hover:bg-[#1ed760] text-white text-[10.5px] font-semibold
                   transition-colors"
        title="Open in Spotify app for the full song"
      >
        <ExternalLink size={11} />
        Open in Spotify
      </a>
    </div>
  )
}
