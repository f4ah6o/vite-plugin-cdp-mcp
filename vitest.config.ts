import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Group tests by area as per project structure
    include: [
      'tests/contract/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'dist/**'],
    environment: 'node',
    globals: true,
    dir: 'tests',
    reporters: 'default',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration tests may spin up external processes; keep pool simple
    pool: 'threads',
    isolate: true,
  },
})
