import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each test sets ART_ROOT_OVERRIDE on its own tmp dir; isolate so
    // parallel tests don't trample each other's env.
    isolate: true,
    pool: 'forks',
  },
})
