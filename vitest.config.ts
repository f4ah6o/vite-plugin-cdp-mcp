import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Group tests by area as per project structure
    include: [
      // Globs are relative to `dir`
      'contract/**/*.test.ts',
      'integration/**/*.test.ts',
      'unit/**/*.test.ts',
      'performance/**/*.test.ts',
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
