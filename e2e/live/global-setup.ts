import { execFileSync } from 'node:child_process';

/** Builds the extension and the helper once per live run, unless E2E_SKIP_BUILD=1. */
export default function globalSetup(): void {
  if (process.env['E2E_SKIP_BUILD'] === '1') return;
  execFileSync('pnpm', ['--filter', '@employ-me/extension', '--filter', 'employ-me', 'build'], {
    stdio: 'inherit',
  });
}
