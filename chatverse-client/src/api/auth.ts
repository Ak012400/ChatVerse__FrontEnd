import api from './client'

export const authApi = {
  guest: () =>
    api.post('/auth/guest'),

  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),

  verifyOtp: (data: { email: string; code: string }) =>
    api.post('/auth/verify-otp', data),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  resendOtp: (email: string) =>
    api.post('/auth/resend-otp', { email }),

  logout: () =>
    api.post('/auth/logout'),

  me: () =>
    api.get('/auth/me'),

  upgrade: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/upgrade', data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    api.post('/auth/reset-password', data),
}
