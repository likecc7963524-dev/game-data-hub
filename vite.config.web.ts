import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// When deploying to GitHub Pages, set base to '/game-data-hub/'
// When deploying elsewhere or local dev, use '/'
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  plugins: [react()],
  root: 'src',
  base,
  build: {
    outDir: resolve(__dirname, 'web-dist'),
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
