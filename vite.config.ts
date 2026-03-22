import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws/pty': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
      },
      '/api/boson': {
        target: 'https://hackathon.boson.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/boson/, ''),
      },
    },
  },
})
