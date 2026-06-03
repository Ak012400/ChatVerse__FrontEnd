import { create } from 'zustand'
import type { VideoStatus, VideoParticipant } from '../types'

interface VideoState {
  status:       VideoStatus
  sessionId:    string | null
  partner:      VideoParticipant | null
  localStream:  MediaStream | null
  remoteStream: MediaStream | null

  setStatus:       (status: VideoStatus) => void
  setSession:      (sessionId: string, partner: VideoParticipant) => void
  setLocalStream:  (stream: MediaStream | null) => void
  setRemoteStream: (stream: MediaStream | null) => void
  resetVideo:      () => void
}

export const useVideoStore = create<VideoState>((set) => ({
  status:       'idle',
  sessionId:    null,
  partner:      null,
  localStream:  null,
  remoteStream: null,

  setStatus: (status) => set({ status }),

  setSession: (sessionId, partner) =>
    set({ sessionId, partner, status: 'matched' }),

  setLocalStream: (localStream) => set({ localStream }),

  setRemoteStream: (remoteStream) => set({ remoteStream }),

  resetVideo: () =>
    set({
      status:       'idle',
      sessionId:    null,
      partner:      null,
      localStream:  null,
      remoteStream: null,
    }),
}))