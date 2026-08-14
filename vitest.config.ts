import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '**/*.e2e.*'],
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['src/test-setup.ts'],
    testTimeout: 10000,
    hookTimeout: 5000,
    coverage: {
      thresholds: {
        statements: 70,
        branches: 85,
        functions: 85,
        lines: 70,
      },
    },
  },
});
