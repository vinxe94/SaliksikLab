import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pdfAssets from './pdf-assets'

export default defineConfig({
  plugins: [react(), pdfAssets()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok.app',
      '.ngrok-free.dev',
      '.ngrok.dev',
      '.ngrok.io',
      '.trycloudflare.com',
    ],
    proxy: {
      '/temp': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
