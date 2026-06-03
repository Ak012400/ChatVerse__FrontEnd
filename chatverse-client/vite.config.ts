import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker'

/**
 * Frontend talks to the backend via `VITE_API_URL` (see .env) — currently
 * https://localhost:7217. The proxy below is a fallback used only if the
 * frontend code reaches /api or /hubs as a relative path. Ports here MUST
 * match the backend's launchSettings.json (`https` profile = 7217).
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    checker({ typescript: true }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://localhost:7217',
        changeOrigin: true,
        secure: false, // dev cert is self-signed
      },
      '/hubs': {
        target: 'https://localhost:7217',
        changeOrigin: true,
        secure: false,
        ws: true, // WebSocket pass-through for SignalR
      },
    },
  },
})
