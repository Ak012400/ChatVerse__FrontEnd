import { useState } from 'react'
import { Music, ExternalLink } from 'lucide-react'
import type { SpotifyEmbedRef } from '../../types'

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

  const tall = embed.kind !== 'track'
  const height = tall ? 380 : 80

  if (!open) {
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
        <span className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1DB954]/90 shrink-0">
          <Music size={16} className="text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-[#1DB954] font-semibold">
            Spotify {embed.kind}
          </span>
          <span className="block text-xs text-[var(--color-fg-mute)] truncate">
            Tap to load player
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
    <div className="mt-1.5 w-full max-w-[340px]">
      <iframe
        title={`Spotify ${embed.kind}`}
        src={embed.embedUrl}
        width="100%"
        height={height}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style={{ border: 0, borderRadius: 12 }}
      />
    </div>
  )
}
