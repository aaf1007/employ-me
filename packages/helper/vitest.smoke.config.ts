import { defineConfig } from 'vitest/config';

// `pnpm smoke:providers`: one tiny real call to each CLI, on your own plan.
// Opt-in and never part of `pnpm check` (CODING_STANDARDS.md "Tests").
export default defineConfig({
  test: {
    name: 'helper-smoke',
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.smoke.ts'],
    testTimeout: 180_000,
  },
});
