import { formMatchPatterns, publicApiMatchPatterns } from '@employ-me/core';
import { defineConfig } from 'wxt';
import { EXTENSION_KEY } from './src/manifest-key';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports only: auto-imports hide where `browser` is used, and the
  // boundary lint rules need to see it.
  imports: false,
  manifest: ({ command }) => ({
    name: 'employ-me',
    description: 'Fills in job applications from your own Profile. You review and submit.',
    key: EXTENSION_KEY,
    minimum_chrome_version: '116',
    // Research §5. Deliberately absent: <all_urls>, tabs, cookies, debugger.
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'nativeMessaging'],
    host_permissions: [...formMatchPatterns(), ...publicApiMatchPatterns()],
    // The generic fallback asks for one site at a time, when you click Fill.
    optional_host_permissions: ['https://*/*'],
    action: { default_title: 'employ-me' },
    // Zero telemetry, enforced by the browser too: extension pages may only
    // connect to the ATS public job APIs. `wxt dev` needs its local server, so
    // this applies to builds only.
    ...(command === 'build' ? { content_security_policy: { extension_pages: extensionPagesCsp() } } : {}),
  }),
});

function extensionPagesCsp(): string {
  const apiOrigins = publicApiMatchPatterns().map((pattern) => pattern.replace('/*', ''));
  return [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${apiOrigins.join(' ')}`,
  ].join('; ');
}
