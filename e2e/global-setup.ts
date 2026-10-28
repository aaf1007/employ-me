import { execFileSync } from 'node:child_process';

/** Builds the extension once per run. Set E2E_SKIP_BUILD=1 to reuse the last build. */
export default function globalSetup(): void {
  if (process.env['E2E_SKIP_BUILD'] === '1') return;
  execFileSync('pnpm', ['--filter', '@employ-me/extension', 'build'], { stdio: 'inherit' });
}
