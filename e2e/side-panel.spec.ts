import { expect, test } from './harness';
import { clickFill, countSubmits, fieldRow, servePublicApi, submits } from './panel';
import { seedTestProfile } from './seed';

// The side panel's own behaviour around a Fill (design.md "Filling" and
// "Tracking"), on a small synthetic Greenhouse-shaped form: one Fill carries
// on through the form's steps, a re-plan leaves your edits alone, "Did you
// apply?" when you leave without a confirmation, the debug report, and a
// Fill when the AI is unavailable.

const FORM_URL = 'https://job-boards.greenhouse.io/acme/jobs/7654321';
const API_URL =
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs/7654321?questions=true&pay_transparency=true';

test.describe('with the fake helper', () => {
  test.use({ helper: 'fake' });

  test('one Fill carries on through the next step, and leaves your edits alone', async ({
    page,
    sites,
    extension,
  }) => {
    test.setTimeout(90_000);
    await seedTestProfile(extension);
    await sites.serve(FORM_URL, 'greenhouse/multi-step.html');
    await servePublicApi(page.context(), API_URL, { title: 'Platform Engineer', company_name: 'Acme' });
    await page.goto(FORM_URL);
    await countSubmits(page.mainFrame());
    const panel = await extension.openSidePanel({ forPage: page });

    await clickFill(panel);
    await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
    await expect(page.locator('#first_name')).toHaveValue('Sam');

    // You click Next yourself.
    await page.locator('#next').click();

    // Step 2 is filled by the same Fill, without clicking Fill again; step 1 keeps its outcomes.
    await expect(fieldRow(panel, 'email')).toHaveAttribute('data-outcome', 'filled', { timeout: 15_000 });
    await expect(page.locator('#email')).toHaveValue('sam.lee@example.com');
    await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');
    // Its required question is drafted, like step 1's would have been.
    const card = fieldRow(panel, 'question_2002').getByTestId('draft-card');
    await expect(card).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });

    // You change a filled field; accepting the Draft plans again, and leaves your change alone.
    await page.locator('#email').fill('sam@work.example.com');
    await card.getByRole('button', { name: 'Accept Draft' }).click();
    await expect(fieldRow(panel, 'question_2002')).toHaveAttribute('data-outcome', 'filled');
    await expect(page.locator('#question_2002')).toHaveValue(/^Fake draft for: What would you build first\?/);
    await expect(page.locator('#email')).toHaveValue('sam@work.example.com');
    await expect(fieldRow(panel, 'email')).toContainText('Changed by you');

    expect(await submits(page.mainFrame())).toBe(0);
    expect(extension.errors).toEqual([]);
  });

  test('leaving a filled form without a confirmation asks "Did you apply?"', async ({
    page,
    sites,
    extension,
  }) => {
    test.setTimeout(90_000);
    await seedTestProfile(extension);
    await sites.serve(FORM_URL, 'greenhouse/multi-step.html');
    await sites.serve('https://job-boards.greenhouse.io/acme', 'greenhouse/basic.html');
    await servePublicApi(page.context(), API_URL, { title: 'Platform Engineer', company_name: 'Acme' });
    await page.goto(FORM_URL);
    const panel = await extension.openSidePanel({ forPage: page });
    await clickFill(panel);

    // The outlines go when the Fill ends; you go elsewhere without submitting through the form.
    await page.goto('https://job-boards.greenhouse.io/acme');
    const ask = panel.getByTestId('did-you-apply');
    await expect(ask).toBeVisible({ timeout: 15_000 });
    await ask.getByRole('button', { name: 'Yes, I applied' }).click();
    await expect(panel.getByTestId('application-recorded')).toBeVisible();

    const tracker = await extension.openDashboard('tracker');
    await tracker.getByTestId('application-row').click();
    const detail = tracker.getByTestId('application-detail');
    await expect(detail).toContainText('Recorded when you said you applied');
    await expect(detail.getByTestId('snapshot-answers')).toContainText('Sam');
    expect(extension.errors).toEqual([]);
  });

  test('Copy debug report leaves every value out', async ({ page, sites, extension }) => {
    test.setTimeout(90_000);
    await seedTestProfile(extension);
    await sites.serve(FORM_URL, 'greenhouse/multi-step.html');
    await servePublicApi(page.context(), API_URL, { title: 'Platform Engineer', company_name: 'Acme' });
    await page.goto(FORM_URL);
    const panel = await extension.openSidePanel({ forPage: page });
    await clickFill(panel);

    // Playwright can't grant clipboard access to an extension page: keep what the panel copies.
    await panel.evaluate(() => {
      const copied = { text: '' };
      Object.assign(globalThis, { employMeCopied: copied });
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            copied.text = text;
            return Promise.resolve();
          },
        },
      });
    });
    await panel.getByRole('button', { name: 'Copy debug report' }).click();
    await expect(panel.getByTestId('debug-copied')).toBeVisible();
    const report = await panel.evaluate(
      () => (globalThis as unknown as { employMeCopied: { text: string } }).employMeCopied.text,
    );
    expect(JSON.parse(report)).toMatchObject({
      page: { ats: 'greenhouse', url: FORM_URL },
      fields: [
        { fieldId: 'first_name', fieldType: 'name.first', outcome: { kind: 'filled', source: 'rules' } },
        { fieldId: 'last_name', fieldType: 'name.last', outcome: { kind: 'filled', source: 'rules' } },
      ],
    });
    expect(report).not.toMatch(/Sam|Lee|sam\.lee|416|Toronto|Northwind|Waterloo/);
  });
});

test.describe('with a helper whose Provider is rate limited', () => {
  test.use({ helper: 'fail:providerRateLimited' });

  test('the Fill still runs on the rules, and says what the AI would have done', async ({
    page,
    sites,
    extension,
  }) => {
    test.setTimeout(90_000);
    await seedTestProfile(extension);
    await sites.serve(FORM_URL, 'greenhouse/multi-step.html');
    await servePublicApi(page.context(), API_URL, { title: 'Platform Engineer', company_name: 'Acme' });
    await page.goto(FORM_URL);
    await page.locator('#next').click();
    const panel = await extension.openSidePanel({ forPage: page });

    await clickFill(panel);
    await expect(fieldRow(panel, 'email')).toHaveAttribute('data-outcome', 'filled');
    await expect(panel.getByTestId('provider-unavailable')).toContainText('usage limit');
    const question = fieldRow(panel, 'question_2002');
    await expect(question).toHaveAttribute('data-outcome', 'couldNotFill');
    await expect(question.getByTestId('field-fix')).toContainText('usage limit');
    expect(extension.errors).toEqual([]);
  });
});
