import api from './client'

// Re-export the Gaming Hall REST client so callers can pull it from
// the same barrel as everything else: `import { gamesApi } from '../api'`.
export { gamesApi } from './games'

export const roomsApi = {
  getAll: () =>
    api.get('/rooms'),
  getOne: (slug: string) =>
    api.get(`/rooms/${slug}`),
  getMessages: (slug: string, skip = 0, limit = 50) =>
    api.get(`/rooms/${slug}/messages`, { params: { skip, limit } }),
  /** Last N Spotify-bearing messages — powers the Music Lounge jukebox. */
  getSpotifyTracks: (slug: string, limit = 20) =>
    api.get(`/rooms/${slug}/spotify-tracks`, { params: { limit } }),
  create: (data: {
    displayName: string
    description?: string
    category?: string
    iconEmoji?: string
    rules?: string[]
  }) => api.post('/rooms', data),
  previewByInvite: (token: string) =>
    api.get(`/rooms/join/${token}`),
  /** Actually join (adds to user's joined-rooms set). Works for guests too. */
  joinByInvite: (token: string) =>
    api.post(`/rooms/join/${token}`),
  /** Private rooms the current user has joined. */
  mine: () =>
    api.get('/rooms/mine'),
  deactivate: (slug: string) =>
    api.delete(`/rooms/${slug}`),
}

export const trustApi = {
  getScore: () =>
    api.get('/trust/score'),
  getHistory: (skip = 0, limit = 20) =>
    api.get('/trust/history', { params: { skip, limit } }),
  fileReport: (data: {
    reportedUserId: string
    reason: string
    description?: string
  }) => api.post('/trust/report', data),
}

export const ageApi = {
  getStatus: () =>
    api.get('/age/status'),
  declare: (dob: string) =>
    api.post('/age/declare', { dob }),
  submitAiQuiz: (data: {
    finalScore: number
    sessionRef?: string
    questions?: object[]
  }) => api.post('/age/ai-quiz/submit', data),
  uploadDoc: (data: {
    docType: string
    cloudinaryPublicId: string
    cloudinaryUrl: string
  }) => api.post('/age/doc-upload', data),
  /** All-in-one: upload file + create verification record server-side. */
  uploadDocFile: (file: File, docType: string) => {
    const form = new FormData()
    form.append('docType', docType)
    form.append('file', file)
    return api.post('/age/doc-upload-file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const usersApi = {
  search: (q: string, limit = 10) =>
    api.get('/users/search', { params: { q, limit } }),
  me: () => api.get('/users/me'),
  updateMe: (data: { username?: string }) => api.patch('/users/me', data),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/users/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  // ── Block system ────────────────────────────────────────────
  block: (userId: string, reason?: string) =>
    api.post(`/users/${userId}/block`, { reason: reason ?? null }),
  unblock: (userId: string) => api.delete(`/users/${userId}/block`),
  myBlocks: () => api.get('/users/me/blocks'),
  blockedByCount: () => api.get<{ data: { count: number } }>('/users/me/blocked-by-count'),
}

export const theaterApi = {
  create: (title: string) => api.post('/theater/create', { title }),
  join: (roomName: string) => api.post('/theater/token', { roomName }),
  active: () => api.get('/theater/active'),
  end: (roomName: string) => api.delete(`/theater/${roomName}`),
}

export const dmsApi = {
  conversations: () => api.get('/dms'),
  thread: (otherUserId: string, skip = 0, limit = 50) =>
    api.get(`/dms/${otherUserId}`, { params: { skip, limit } }),
  send: (otherUserId: string, content: string) =>
    api.post(`/dms/${otherUserId}`, { content }),
}

export const iceApi = {
  /** RTCPeerConnection config — STUN + TURN if available. Server-side
   *  so we can rotate credentials without a frontend release. */
  get: () => api.get('/ice-servers'),
}

export const presenceApi = {
  /** Live online counts. `rooms` is comma-separated slugs — only those
   *  rooms have their counts returned. Endpoint is anonymous-safe so the
   *  landing page can render the global "X online now" badge too. */
  stats: (rooms?: string[]) =>
    api.get<{
      data: { globalOnline: number; byRoom: Record<string, number> }
    }>('/presence/stats', { params: rooms?.length ? { rooms: rooms.join(',') } : {} }),
}

export const adminApi = {
  whoami:    () => api.get('/admin/whoami'),
  stats:     () => api.get('/admin/stats'),
  reports:   (status = 'pending', limit = 50) =>
    api.get('/admin/reports', { params: { status, limit } }),
  reviewReport: (reportId: string, outcome: 'valid' | 'invalid' | 'dismissed', note?: string) =>
    api.post(`/admin/reports/${reportId}/review`, { outcome, note }),
  documents: (status = 'pending', limit = 50) =>
    api.get('/admin/documents', { params: { status, limit } }),
  reviewDocument: (docId: string, outcome: 'approve' | 'reject', rejectReason?: string) =>
    api.post(`/admin/documents/${docId}/review`, { outcome, rejectReason }),
}

export const randomGroupApi = {
  join: () =>
    api.post('/random-group/join'),
  leave: (roomName: string) =>
    api.post('/random-group/leave', { roomName }),
  report: (data: {
    roomName: string
    violatorUserId: string
    selfReport?: boolean
    label?: string
    confidence?: number
  }) => api.post('/random-group/report', data),
  active: () =>
    api.get('/random-group/active'),
}

export const directCallApi = {
  /** Once both parties accept via ChatHub, each fetches its own token here. */
  token: (roomName: string) =>
    api.post('/direct-call/token', { roomName }),
}

export const groupCallApi = {
  token: (roomName: string, maxParticipants?: number) =>
    api.post('/group-call/token', { roomName, maxParticipants }),
  create: (roomName: string, maxParticipants = 10) =>
    api.post('/group-call/create', { roomName, maxParticipants }),
  participants: (roomName: string) =>
    api.get(`/group-call/${roomName}/participants`),
  end: (roomName: string) =>
    api.delete(`/group-call/${roomName}`),
  active: () =>
    api.get('/group-call/active'),
}

export const billingApi = {
  getPlans: () =>
    api.get('/billing/plans'),
  createOrder: (planType: string) =>
    api.post('/billing/order', { planType }),
  verifyPayment: (data: {
    orderId: string
    paymentId: string
    signature: string
  }) => api.post('/billing/verify-payment', data),
  getSubscription: () =>
    api.get('/billing/subscription'),
}
