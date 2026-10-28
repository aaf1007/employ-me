import { EXTENSION_ID } from '@employ-me/core';
import { expect, test } from './harness';
import { servePublicApi } from './panel';

const FORMS = [
  {
    ats: 'greenhouse',
    url: 'https://job-boards.greenhouse.io/acme/jobs/1234567',
    fixture: 'greenhouse/basic.html',
  },
  {
    ats: 'lever',
    url: 'https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply',
    fixture: 'lever/basic.html',
  },
  {
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/acme/0b2c9a3e-1111-4222-8333-444455556666/application',
    fixture: 'ashby/basic.html',
  },
] as const;

test('loads with the fixed extension ID the helper whitelists', ({ extension }) => {
  expect(extension.id).toBe(EXTENSION_ID);
});

for (const form of FORMS) {
  test(`content script runs on a routed ${form.ats} URL`, async ({ page, sites, extension }) => {
    await sites.serve(form.url, form.fixture);
    await page.goto(form.url);

    await expect
      .poll(() => extension.pingContentScripts())
      .toEqual([{ type: 'pong', ats: form.ats, url: form.url, topFrame: true }]);
    expect(sites.blocked).toEqual([]);
  });
}

test('content script runs inside an embedded Greenhouse iframe, and not on the company page', async ({
  page,
  sites,
  extension,
}) => {
  const embedUrl = 'https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1234567';
  await sites.serve('https://careers.example.com/jobs?gh_jid=1234567', 'generic/greenhouse-embed.html');
  await sites.serve(embedUrl, 'greenhouse/basic.html');
  await page.goto('https://careers.example.com/jobs?gh_jid=1234567');

  await expect
    .poll(() => extension.pingContentScripts())
    .toEqual([{ type: 'pong', ats: 'greenhouse', url: embedUrl, topFrame: false }]);
});

test('the toolbar icon opens the side panel from its own click, which grants activeTab', async ({
  extension,
}) => {
  // Playwright can't click Chrome's toolbar (design.md "Starting a Fill"). The click reaches
  // action.onClicked, which opens the panel: with openPanelOnActionClick Chrome would open it
  // itself and grant no activeTab (packages/extension/src/background/action.ts).
  const wiring = await extension.serviceWorker.evaluate(async () => {
    const { chrome } = globalThis as unknown as {
      chrome: {
        sidePanel: { getPanelBehavior(): Promise<{ openPanelOnActionClick?: boolean }> };
        action: { onClicked: { hasListeners(): boolean } };
      };
    };
    return {
      behavior: await chrome.sidePanel.getPanelBehavior(),
      onClicked: chrome.action.onClicked.hasListeners(),
    };
  });
  expect(wiring).toEqual({ behavior: { openPanelOnActionClick: false }, onClicked: true });
});

test('side panel and dashboard open without errors', async ({ page, sites, extension }) => {
  const [form] = FORMS;
  await sites.serve(form.url, form.fixture);
  // The panel reads the Posting's public job API (research §7) as soon as it finds the form.
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567?questions=true&pay_transparency=true',
    { title: 'Software Engineer', company_name: 'Acme', content: '' },
  );
  await page.goto(form.url);

  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByTestId('sidepanel')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Fill' })).toBeVisible();

  const dashboard = await extension.openDashboard('tracker');
  await expect(dashboard.getByTestId('view-tracker')).toBeVisible();
  await dashboard.getByRole('link', { name: 'Settings' }).click();
  await expect(dashboard.getByTestId('view-settings')).toBeVisible();

  expect(extension.errors).toEqual([]);
});
