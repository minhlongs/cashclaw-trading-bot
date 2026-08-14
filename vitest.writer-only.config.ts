import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tree/telemetry/writer.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 5000,
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: false,
        singleThread: true,
      },
    },
  },
});
