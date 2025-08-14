import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    include: [
      'tests/basic.test.ts',
      'tests/app-functionality.test.ts', 
      'tests/mention-testing.test.ts',
      'tests/manual-test.test.ts',
      'tests/cron.test.ts',
      'tests/hci.test.ts'
    ],
    exclude: [
      'tests/worker-core.test.ts',
      'tests/news-cache.test.ts',
      'tests/integration.test.ts',
      'tests/cron-system.test.ts',
      'tests/mention-system.test.ts',
      'test/**'
    ]
  },
})