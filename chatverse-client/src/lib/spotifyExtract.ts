import type { SpotifyEmbedRef } from '../types'

/**
 * Client-side Spotify URL → embed-ref detector.
 *
 * Mirrors the regex used by the backend's `SpotifyLinkExtractor` so
 * messages render correctly even when the backend deployment hasn't
 * shipped the server-side enricher yet (the field will arrive as null
 * in that case). Once both ends are in sync the backend value is
 * authoritative — this helper just runs as a fallback inside the chat
 * bubble + jukebox panel.
 *
 * Supported URL shapes (must match backend exactly):
 *   https://open.spotify.com/track/{id}
 *   https://open.spotify.com/album/{id}?si=...
 *   https://open.spotify.com/playlist/{id}
 *   https://open.spotify.com/episode/{id}
 *   https://open.spotify.com/show/{id}
 *   https://open.spotify.com/artist/{id}
 *   https://open.spotify.com/embed/track/{id}    ← already-embed URLs are normalised
 *   spotify:track:{id}                            ← native app share format
 */

// Spotify IDs are 22-char base62 strings — same constraint backend uses.
const WEB_URL =
  /https?:\/\/(?:open\.)?spotify\.com\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})/i

const URI_SCHEME =
  /spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{22})/i

export function extractSpotifyEmbed(text: string | null | undefined): SpotifyEmbedRef | null {
  if (!text) return null

  const w = text.match(WEB_URL)
  if (w) {
    const kind = w[1].toLowerCase() as SpotifyEmbedRef['kind']
    const id = w[2]
    return {
      kind,
      spotifyId: id,
      embedUrl:  `https://open.spotify.com/embed/${kind}/${id}`,
      webUrl:    `https://open.spotify.com/${kind}/${id}`,
    }
  }

  const u = text.match(URI_SCHEME)
  if (u) {
    const kind = u[1].toLowerCase() as SpotifyEmbedRef['kind']
    const id = u[2]
    return {
      kind,
      spotifyId: id,
      embedUrl:  `https://open.spotify.com/embed/${kind}/${id}`,
      webUrl:    `https://open.spotify.com/${kind}/${id}`,
    }
  }

  return null
}
