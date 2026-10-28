import { execFileSync } from 'node:child_process';

/**
 * Builds the extension, and the helper for specs that use `helper`, once per
 * run. Set E2E_SKIP_BUILD=1 to reuse the last builds.
 */
export default function globalSetup(): void {
  if (process.env['E2E_SKIP_BUILD'] === '1') return;
  execFileSync('pnpm', ['--filter', '@employ-me/extension', '--filter', 'employ-me', 'build'], {
    stdio: 'inherit',
  });
}
