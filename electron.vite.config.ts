import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: 'electron/main.ts', formats: ['cjs'] },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      lib: { entry: 'electron/preload.ts', formats: ['cjs'] },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: 'src',
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
