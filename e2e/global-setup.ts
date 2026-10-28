import { execFileSync } from 'node:child_process';

/**
 * Builds once per run: the extension, the helper for specs that use
 * `helper: 'fake'`, and the extension's test build (`wxt build --mode e2e`,
 * to .output/chrome-mv3-e2e) for specs that use `helper: 'inMemory'`. Set
 * E2E_SKIP_BUILD=1 to reuse the last builds.
 */
export default function globalSetup(): void {
  if (process.env['E2E_SKIP_BUILD'] === '1') return;
  execFileSync('pnpm', ['--filter', '@employ-me/extension', '--filter', 'employ-me', 'build'], {
    stdio: 'inherit',
  });
  execFileSync('pnpm', ['--filter', '@employ-me/extension', 'build:e2e'], { stdio: 'inherit' });
}
