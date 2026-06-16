import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    // The unit suite is native-free: anything touching the real better-sqlite3
    // binary lives in test/integration and runs via `npm run test:integration`.
    exclude: ['src/renderer/**/*', 'test/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/main/domain/**', 'src/main/application/**'],
      exclude: ['src/main/adapters/**', 'src/main/infrastructure/**']
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  }
})
