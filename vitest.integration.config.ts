import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Integration suite — the tests that exercise the real better-sqlite3 native
// binary (adapter SQL, cursor pagination, FTS, schema migrations). Kept out of
// the default `npm test` so the unit run never needs the Electron/Node ABI
// rebuild dance. Run with `npm run test:integration`.
//
// NOTE: better-sqlite3 must be on the Node ABI for this to load
// (`node_modules/.bin/prebuild-install -r node` inside the package dir);
// `electron-builder install-app-deps` restores the Electron ABI for the app.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.{test,spec}.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  }
})
