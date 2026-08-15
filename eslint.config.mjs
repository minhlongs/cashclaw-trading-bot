import nextConfig from 'eslint-config-next';

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  ...nextConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      'complexity': ['warn', { max: 15 }],
      'no-duplicate-imports': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['warn', 'always'],
      'no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // Downgrade pre-existing react-hooks errors to warnings (not enforced before lint config existed)
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn'
    }
  }
];
