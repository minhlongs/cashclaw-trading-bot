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
        statements: 90,
        branches: 90,
        functions: 94,
        lines: 90,
        // Per-path: money-critical modules must independently meet their own floors
        // (set at measured actuals — see docs/development-roadmap.md for per-file detail)
        'src/tree/exchange/**': { statements: 97, branches: 86, functions: 98, lines: 97 },
        'src/tree/bot/**': { statements: 96, branches: 93, functions: 89, lines: 96 },
        'src/tree/quantlib/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});