import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: ['**/*.test.mjs'],
    pool: 'forks',
  },
})
