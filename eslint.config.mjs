// A small, correctness-first lint: promise mistakes (the defect class behind
// unhandled rejections that used to turn into the error screen), obvious
// async slips, and a few core bug-finders. No style rules: tsc covers types
// and unused code; formatting is not enforced.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/__generated__/**', '.claude/**', 'android/**', 'ios/**', 'assets/**', '*.config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'App.tsx', 'index.js', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Promises that nobody awaits or handles.
      '@typescript-eslint/no-floating-promises': 'error',
      // Async functions where a void callback is expected (a rejection is then unhandled).
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      // tsc owns these.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Node scripts and plain JS: core rules only (no type info).
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', Buffer: 'readonly', window: 'readonly', document: 'readonly', performance: 'readonly', indexedDB: 'readonly', navigator: 'readonly', Image: 'readonly', PointerEvent: 'readonly', CustomEvent: 'readonly', Event: 'readonly', requestAnimationFrame: 'readonly', location: 'readonly', crypto: 'readonly', getComputedStyle: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly' } },
    // (smoke.mjs runs code in both Node and the browser page, so no-undef can't apply.)
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
);
