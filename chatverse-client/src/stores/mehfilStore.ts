import { create } from 'zustand'
import type {
  MehfilRoomCard, MehfilMessage, MehfilTip, MehfilAttendee,
  MehfilTemplate,
} from '../types/mehfil'

interface MehfilState {
  discoverRooms:  MehfilRoomCard[]
  templates:      MehfilTemplate[]
  gifts:          Record<string, number>
  myRooms:        MehfilRoomCard[]

  openRoom:       MehfilRoomCard | null
  openRoomMessages: MehfilMessage[]
  openRoomAttendees: MehfilAttendee[]
  openRoomTips:   MehfilTip[]

  setDiscover:    (rooms: MehfilRoomCard[], templates: MehfilTemplate[], gifts: Record<string, number>) => void
  setMyRooms:     (rooms: MehfilRoomCard[]) => void
  setOpenRoom:    (r: MehfilRoomCard | null, messages?: MehfilMessage[], attendees?: MehfilAttendee[], tips?: MehfilTip[]) => void
  appendMessage:  (m: MehfilMessage) => void
  applyAudienceChange: (currentCount: number) => void
  applyTip:       (t: MehfilTip, total: number) => void
  applyStatusChange: (status: MehfilRoomCard['status']) => void
}

export const useMehfilStore = create<MehfilState>((set) => ({
  discoverRooms:    [],
  templates:        [],
  gifts:            {},
  myRooms:          [],
  openRoom:         null,
  openRoomMessages: [],
  openRoomAttendees: [],
  openRoomTips:     [],

  setDiscover: (rooms, templates, gifts) =>
    set(() => ({ discoverRooms: rooms, templates, gifts })),
  setMyRooms:  (rooms) => set(() => ({ myRooms: rooms })),

  setOpenRoom: (r, messages, attendees, tips) =>
    set(() => ({
      openRoom: r,
      openRoomMessages: messages ?? [],
      openRoomAttendees: attendees ?? [],
      openRoomTips: tips ?? [],
    })),

  appendMessage: (m) =>
    set((s) => {
      if (s.openRoomMessages.some((x) => x.id === m.id)) return {}
      return { openRoomMessages: [...s.openRoomMessages, m] }
    }),

  applyAudienceChange: (currentCount) =>
    set((s) => s.openRoom
      ? { openRoom: { ...s.openRoom, currentAudienceCount: currentCount } }
      : {}),

  applyTip: (t, total) =>
    set((s) => ({
      openRoomTips: [t, ...s.openRoomTips].slice(0, 50),
      openRoom: s.openRoom ? { ...s.openRoom, totalTipsTokens: total } : s.openRoom,
    })),

  applyStatusChange: (status) =>
    set((s) => s.openRoom
      ? { openRoom: { ...s.openRoom, status } }
      : {}),
}))
