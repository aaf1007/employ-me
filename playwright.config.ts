import { defineConfig } from '@playwright/test';

const CI = process.env['CI'] !== undefined;

// Workers inherit this, and the Chromium they launch, and the Native Messaging host Chrome starts:
// e2e never spends the user's plan. Set here rather than passed to the launch (e2e/harness.ts).
process.env['EMPLOY_ME_PROVIDER'] = 'fake';

// The extension e2e loop. See CLAUDE.md "End-to-end tests" and e2e/harness.ts.
export default defineConfig({
  testDir: 'e2e',
  // The opt-in live harness (playwright.live.config.ts) touches real job sites and spends real plans.
  testIgnore: ['live/**'],
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
});
