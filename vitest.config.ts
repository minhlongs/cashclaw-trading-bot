import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '**/*.e2e.*'],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 5000,
    coverage: {
      thresholds: {
        statements: 25,
        branches: 75,
        functions: 65,
        lines: 25,
      },
    },
  },
});
