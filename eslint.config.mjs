// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', 'blob-report/**', '.superpowers/**', 'dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // The suite's own convention: unused destructured fixture params are a real
      // finding (see review history), but a leading underscore opts out deliberately.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Page objects and API clients intentionally return `unknown`/loosely-typed
      // envelope bodies in a few spots (see HttpClient) — keep this a warning, not
      // a hard error, so it nudges without blocking on the handful of deliberate uses.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts'],
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // This suite deliberately reuses one shared fixture/guest across parallel
      // tests within a describe block in several specs (documented in README gotchas)
      // — the rule's "no shared state across tests" assumption doesn't hold here.
      'playwright/no-conditional-in-test': 'off',
      'playwright/expect-expect': 'off',
    },
  },
  eslintConfigPrettier,
);
