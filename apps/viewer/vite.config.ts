import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assetWatcherPlugin } from './scripts/asset-watcher.plugin'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  server: {
    port: 4321,
    fs: { allow: ['..', '../..'] }, // allow reads from repo root (assets/ and presentations/*/assets/)
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(), // MUST come before viteReact()
    viteReact(),
    assetWatcherPlugin(), // chokidar + SSE broadcast + TUI — AFTER viteReact
  ],
})
