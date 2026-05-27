import api from './client'

// Rooms ke liye API (Yehi ChatPage.tsx maang raha hai)
export const roomsApi = {
  getAll: () => api.get('/rooms'),
  getOne: (slug: string) => api.get(`/rooms/${slug}`),
}

// Trust Score API (ProfilePage ke liye)
export const trustApi = {
  getScore: () => api.get('/trust/score'),
}

// Age Verification API (ProfilePage ke liye)
export const ageApi = {
  getStatus: () => api.get('/age/status'),
}