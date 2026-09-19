import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Evita que ESLint busque un tsconfig fuera del workspace cuando se
        // lintea un solo workspace del monorepo.
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Arranque del servidor y CLIs: escriben a stdout a propósito.
    files: [
      'src/index.ts',
      'src/db/migrate.ts',
      'src/db/seed.ts',
      'src/utils/email.ts',
      'scripts/**',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'src/**/*.test.ts', 'src/test/**'],
  },
)
