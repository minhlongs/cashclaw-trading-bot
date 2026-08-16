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
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts'],
      thresholds: {
        statements: 82,
        branches: 85,
        functions: 85,
        lines: 82,
        // Per-path: money-critical modules must independently meet global thresholds
        'src/tree/exchange/**': { statements: 82, branches: 85, functions: 85, lines: 82 },
        'src/tree/bot/**': { statements: 82, branches: 85, functions: 85, lines: 82 },
        'src/tree/quantlib/**': { statements: 82, branches: 85, functions: 85, lines: 82 },
      },
    },
  },
});