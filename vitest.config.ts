import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws anywhere outside a React Server Component render. The
      // feed module imports it on purpose; a test importing the feed is not a client
      // leak, so the guard is stubbed rather than the import dropped.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000, // corpus fixtures are up to 14MB; parsing is not instant
  },
})
