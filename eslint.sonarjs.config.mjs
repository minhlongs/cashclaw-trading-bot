import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    plugins: {
      sonarjs,
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    excludes: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    plugins: {
      sonarjs,
    },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
    },
  },
];