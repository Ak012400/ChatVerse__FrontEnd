import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker' // Ye import add kiya

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    checker({ typescript: true }) // Ye checker plugin add kiya gaya hai
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,        // WebSocket proxy — SignalR ke liye zaroori
      }
    }
  }
})