import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { ParticipantTile } from '@livekit/components-react'

/**
 * Plain CSS grid that ALWAYS renders every participant tile.
 *
 * Replaces LiveKit's built-in GridLayout, which has a focus-mode
 * (clicking a tile makes it big and hides others) — that's why users
 * sometimes saw only one face at a time even with 4-6 in the room.
 *
 * Layout philosophy:
 *   • Mobile (default)       — 2 columns, tile aspect-square (camera
 *                              content gets object-cover, so the
 *                              speaker's face fills the square without
 *                              stretching a portrait phone video).
 *   • sm (≥640px)            — 3 columns
 *   • md (≥768px)            — 3 columns, aspect-video
 *   • lg (≥1024px)           — auto-fit minmax(220px, 1fr), max-h 280px
 *                              (compact so a portrait peer letter-boxes
 *                              instead of swallowing a quarter screen)
 *
 * Every tile gets a black backdrop + rounded corner. The video element
 * uses object-contain on desktop so portrait/landscape mismatches
 * letter-box instead of cropping awkwardly.
 *
 * Optional `tileWrap` lets pages augment each tile (e.g. the random
 * group's "Report" overlay button).
 */
export default function AllParticipantsGrid({
  tracks,
  tileWrap,
  className,
}: {
  tracks: TrackReferenceOrPlaceholder[]
  /** Render a custom wrapper around each tile. Default: bare <ParticipantTile/>. */
  tileWrap?: (track: TrackReferenceOrPlaceholder, index: number) => React.ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        'h-full w-full p-1 sm:p-2 grid gap-1.5 sm:gap-2 overflow-y-auto',
        // Mobile: 2 col, sm: 3 col. Auto-fit on lg+ for richer screens.
        'grid-cols-2 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]',
        // Container that lays out lots of tiles cleanly — auto-rows = 1fr
        // keeps them roughly equal-sized regardless of count.
        'auto-rows-fr',
        className ?? '',
      ].join(' ')}
    >
      {tracks.map((track, i) => {
        const key = `${track.participant.identity}-${track.source ?? 'cam'}-${i}`
        const inner = tileWrap ? tileWrap(track, i) : <ParticipantTile trackRef={track} />
        return (
          <div
            key={key}
            className={[
              // Per-tile clamp: aspect-square on mobile (faces fit
              // nicely in a square), aspect-video on lg+. max-h prevents
              // a portrait peer from swallowing the viewport.
              'relative overflow-hidden rounded-md bg-black border border-[var(--color-line,#1f1f24)]',
              'aspect-square sm:aspect-video',
              'lg:max-h-[280px]',
              // Force the inner video element to letter-box rather than
              // crop on desktop. On mobile we use cover so faces fill
              // the square cleanly even with portrait phone cameras.
              'lg:[&_video]:!object-contain [&_video]:object-cover',
              // Default LiveKit tile bg is grey; we want black to match.
              '[&_.lk-participant-tile]:bg-transparent',
              '[&_.lk-participant-tile]:w-full',
              '[&_.lk-participant-tile]:h-full',
            ].join(' ')}
          >
            {inner}
          </div>
        )
      })}
    </div>
  )
}
