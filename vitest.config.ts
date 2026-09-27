import { defineConfig } from 'vitest/config';

// Unit tests cover the pure game logic (economy, tricks, saves).
// Kept separate from vite.config.ts so the single-file build plugin
// doesn't run for tests.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
