import type { RoomOptions } from 'livekit-client'
import { VideoPresets } from 'livekit-client'

// ============================================================
//  livekitOptions — shared, battle-tested room configs for every
//  call mode. One place to tune video behaviour platform-wide.
//
//  What each knob buys us (the "no drops, feels real-time" kit):
//
//  • adaptiveStream — subscriber-side: LiveKit serves each viewer
//    only the resolution their tile actually needs. Small tile =
//    small stream = less bandwidth = fewer freezes.
//  • dynacast — publisher-side: simulcast layers nobody is
//    watching are paused automatically. Saves upload + CPU.
//  • simulcast layers (180p/360p + full) — the SFU can instantly
//    step a struggling viewer DOWN a layer instead of letting
//    their video stall. This is the #1 anti-drop feature.
//  • red (audio redundancy) — every audio packet is sent with a
//    redundant copy; on lossy networks voice stays intact even
//    when video stutters. Voice > video, always.
//  • dtx — silence isn't transmitted; frees bandwidth for video.
//  • echoCancellation/noiseSuppression/autoGainControl — clean
//    capture before it ever hits the wire.
//  • reconnectPolicy — keep fighting for 60s with capped backoff
//    before declaring the call dead (default gives up too fast).
//    LiveKit resumes the SAME session on reconnect, so a 3-second
//    wifi blip feels like a hiccup, not a dropped call.
// ============================================================

const persistentReconnect = {
  nextRetryDelayInMs: (context: { elapsedMs: number; retryCount: number }) => {
    if (context.elapsedMs > 60_000) return null // give up after a full minute
    return Math.min(500 * 2 ** context.retryCount, 5_000)
  },
}

const audioCaptureDefaults = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

/** Group calls (random + hosted): more participants = bandwidth is
 *  the enemy. Capture at 540p, publish ≤1.1Mbps, lean on simulcast. */
export const groupRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h540.resolution,
  },
  audioCaptureDefaults,
  publishDefaults: {
    dtx: true,
    red: true,
    videoEncoding: { maxBitrate: 1_100_000, maxFramerate: 24 },
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  reconnectPolicy: persistentReconnect,
  // Resume media faster after tab switches / brief locks.
  stopLocalTrackOnUnpublish: true,
}

/** One-on-one calls: only two streams in play, so spend the budget
 *  on quality — 720p capture, ≤1.7Mbps, same resilience kit. */
export const oneOnOneRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },
  audioCaptureDefaults,
  publishDefaults: {
    dtx: true,
    red: true,
    videoEncoding: { maxBitrate: 1_700_000, maxFramerate: 30 },
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
  },
  reconnectPolicy: persistentReconnect,
  stopLocalTrackOnUnpublish: true,
}
