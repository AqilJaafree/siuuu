import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000, // corpus fixtures are up to 14MB; parsing is not instant
  },
})
