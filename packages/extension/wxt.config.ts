import { formMatchPatterns, publicApiMatchPatterns } from '@employ-me/core';
import { defineConfig } from 'wxt';
import { EXTENSION_KEY } from './src/manifest-key';

/**
 * The test build only (`wxt build --mode e2e`): the company sites e2e serves
 * from fixtures/. Playwright can't click Chrome's toolbar icon (which grants
 * activeTab) or answer Chrome's permission prompt, so these stand in for
 * both. Real builds have no host permission beyond the job sites' own.
 */
const E2E_COMPANY_SITES = [
  'https://helsing.ai/*',
  'https://careers.example.org/*',
  'https://forms.example.net/*',
];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports only: auto-imports hide where `browser` is used, and the
  // boundary lint rules need to see it.
  imports: false,
  manifest: ({ command, mode }) => ({
    name: 'employ-me',
    description: 'Fills in job applications from your own Profile. You review and submit.',
    key: EXTENSION_KEY,
    minimum_chrome_version: '116',
    // Research §5. Deliberately absent: <all_urls>, tabs, cookies, debugger.
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'nativeMessaging'],
    host_permissions: [
      ...formMatchPatterns(),
      ...publicApiMatchPatterns(),
      ...(mode === 'e2e' ? E2E_COMPANY_SITES : []),
    ],
    // The generic fallback reads a company's own site through activeTab, given by the toolbar click
    // (background/action.ts). A frame from another site is asked for on its own, one site at a time.
    optional_host_permissions: ['https://*/*'],
    action: { default_title: 'employ-me' },
    // Zero telemetry, enforced by the browser too: extension pages may only
    // connect to the ATS public job APIs. `wxt dev` needs its local server, so
    // this applies to builds only.
    ...(command === 'build' ? { content_security_policy: { extension_pages: extensionPagesCsp() } } : {}),
  }),
});

function extensionPagesCsp(): string {
  // A source ending in "/" allows every path under it: "https://*.myworkdayjobs.com/wday/cxs/".
  const apiOrigins = publicApiMatchPatterns().map((pattern) => pattern.replace(/\*$/, ''));
  return [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${apiOrigins.join(' ')}`,
  ].join('; ');
}
