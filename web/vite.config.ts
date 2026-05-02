import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_PORT = process.env.ZENDIA_SERVER_PORT ?? '8910'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      '/stream': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
        changeOrigin: true,
      },
      '/tts': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
