import api from './client'

export const roomsApi = {
  getAll: () =>
    api.get('/rooms'),
  getOne: (slug: string) =>
    api.get(`/rooms/${slug}`),
  getMessages: (slug: string, skip = 0, limit = 50) =>
    api.get(`/rooms/${slug}/messages`, { params: { skip, limit } }),
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
