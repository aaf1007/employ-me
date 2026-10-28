// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { boundaryConfigs } from './tools/eslint/boundaries.js';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.output/',
    '**/.wxt/',
    'playwright-report/',
    'test-results/',
    'fixtures/',
  ]),
  {
    linterOptions: {
      // No `eslint-disable` comments anywhere. If a rule is wrong, change the
      // rule in this config, in a reviewed change (CLAUDE.md "Hard rules").
      noInlineConfig: true,
      reportUnusedInlineConfigs: 'error',
    },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    files: ['packages/extension/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // Playwright fixtures must destructure their dependencies, even when there are none: `async ({}, use)`.
    files: ['e2e/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
  boundaryConfigs,
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
