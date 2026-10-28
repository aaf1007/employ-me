import { defineConfig } from '@playwright/test';

const CI = process.env['CI'] !== undefined;

// The extension e2e loop. See CLAUDE.md "End-to-end tests" and e2e/harness.ts.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
});
