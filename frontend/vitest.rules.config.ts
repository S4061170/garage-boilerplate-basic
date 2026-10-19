import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Run only through the Firestore emulator; ordinary unit tests keep their SDK mocks.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.rules.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
})
