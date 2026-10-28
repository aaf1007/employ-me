import { execFileSync } from 'node:child_process';
import { buildFillBundle } from './fill-bundle/build';

/**
 * Builds once per run: the extension, the helper for specs that use
 * `helper: 'fake'`, and the extension's test build (`wxt build --mode e2e`,
 * to .output/chrome-mv3-e2e) for specs that use `helper: 'inMemory'`. Set
 * E2E_SKIP_BUILD=1 to reuse the last builds. The fill engine's test bundle
 * (e2e/fill-bundle) is built every run: it takes a second.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env['E2E_SKIP_BUILD'] !== '1') {
    execFileSync('pnpm', ['--filter', '@employ-me/extension', '--filter', 'employ-me', 'build'], {
      stdio: 'inherit',
    });
    execFileSync('pnpm', ['--filter', '@employ-me/extension', 'build:e2e'], { stdio: 'inherit' });
  }
  await buildFillBundle();
}
