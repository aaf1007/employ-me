import { defineConfig } from '@playwright/test';

// The opt-in live harness (e2e/live/): real job sites, your real claude or
// codex. It spends your plan, so it never runs in CI or `pnpm test:e2e`:
// only `pnpm test:live`. Run e2e/live/setup.live.ts once first.
export default defineConfig({
  testDir: 'e2e/live',
  testMatch: '**/*.live.ts',
  globalSetup: './e2e/live/global-setup.ts',
  outputDir: 'test-results/live',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 420_000,
  expect: { timeout: 15_000 },
});
