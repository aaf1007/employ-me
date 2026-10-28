import { fileOf } from './dashboard';
import { expect, test } from './harness';

// Setup (design.md "Profile" → "Setup"): add a Resume, the Provider reads
// it, you check every field, then the questionnaire. Most of it runs against
// the test build's in-memory helper, which can return a full Resume extract;
// the last tests use the real helper with its fake Provider.

const RESUME = fileOf(
  'sam-lee.txt',
  'Sam Lee\nsam.lee@example.com\nSoftware Engineer, Example Corp',
  'text/plain',
);

test.describe('with the in-memory helper', () => {
  test.use({ helper: 'inMemory' });

  test('sets up a Profile from a Resume, and every answer stays editable', async ({ extension }) => {
    const page = await extension.openDashboard('setup');
    const continueButton = page.getByRole('button', { name: 'Continue' });

    // 1. Resume, read by the Provider through the helper.
    await page.getByTestId('resume-file').setInputFiles(RESUME);
    await page.getByTestId('resume-label').fill('Main');
    await page.getByRole('button', { name: 'Add Resume' }).click();
    await page.getByRole('button', { name: 'Read my Resume' }).click();

    // 2. Every pre-filled field is shown for review, highlighted.
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('field-identity.legalName.first')).toHaveValue('Sam');
    await expect(page.getByTestId('field-contact.email')).toHaveValue('sam.lee@example.com');
    await expect(page.locator('[data-path="identity.legalName.last"]')).toHaveAttribute(
      'data-prefilled',
      'true',
    );
    await expect(page.getByTestId('field-background.workHistory.0.employer')).toHaveValue('Example Corp');
    await page.getByTestId('field-identity.preferredName.first').fill('Sammy');
    // The Resume had no street address, and core's address needs one: setup stops on it.
    await continueButton.click();
    await expect(page.getByTestId('error-address.line1')).toHaveText('Required');
    await page.getByTestId('field-address.line1').fill('1 Example St');
    await continueButton.click();

    // 3. Countries, with a Work Authorization for each.
    await expect(page.getByTestId('section-countries')).toBeVisible();
    await continueButton.click();
    await expect(page.locator('[data-path="countries"]')).toContainText('Add at least one country');
    await page.getByTestId('add-countries').selectOption('US');
    await page.getByTestId('add-countries').selectOption('CA');
    await page.getByTestId('field-workAuthorization.US.authorizedNow').selectOption('no');
    await page.getByTestId('field-workAuthorization.US.sponsorship').selectOption('ask');
    await page.getByTestId('field-workAuthorization.US.status').fill('TN eligible');
    await page.getByTestId('field-workAuthorization.US.usPerson').selectOption('no');
    await page.getByTestId('field-workAuthorization.CA.authorizedNow').selectOption('yes');
    await continueButton.click();
    await expect(page.getByTestId('error-workAuthorization.CA.sponsorship')).toBeVisible();
    await page.getByTestId('field-workAuthorization.CA.sponsorship').selectOption('no');
    await page.getByTestId('field-workAuthorization.CA.explanation').fill('Canadian citizen.');
    await continueButton.click();

    // 4. Preferences, and salary per country in that country's currency.
    await expect(page.getByTestId('section-preferences')).toBeVisible();
    await expect(page.getByTestId('salary-US')).toContainText('USD');
    await expect(page.getByTestId('salary-CA')).toContainText('CAD');
    await page.getByTestId('field-preferences.salary.US.min').fill('150000');
    await page.getByTestId('field-preferences.salary.CA.min').fill('120000');
    await page.getByTestId('field-preferences.salary.CA.max').fill('140000');
    await page.getByTestId('field-preferences.relocation').selectOption('yes');
    await page.getByLabel('Remote').check();
    await continueButton.click();

    // 5. Screening defaults.
    await page.getByTestId('field-screening.backgroundCheck').selectOption('yes');
    await page.getByTestId('field-screening.nonCompete').selectOption('no');
    await continueButton.click();

    // 6. Self-ID Answers, per country, every one declined unless you choose.
    await expect(page.getByTestId('section-selfId')).toBeVisible();
    const selfId = page.locator('[data-testid^="field-selfId."]');
    await expect(selfId).toHaveCount(9);
    for (const select of await selfId.all()) await expect(select).toHaveValue('decline');
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByTestId('step-done')).toBeVisible();

    // The Provider was asked once, by the Provider in Settings.
    expect(await extension.helperRequests()).toEqual([{ type: 'parseResume', provider: 'claude' }]);

    // Everything is on the Profile page, and editable.
    await page.getByRole('link', { name: 'See my Profile' }).click();
    await expect(page.getByTestId('profile-editor')).toBeVisible();
    await expect(page.getByTestId('setup-banner')).toHaveCount(0);
    await expect(page.getByTestId('field-identity.preferredName.first')).toHaveValue('Sammy');
    await expect(page.getByTestId('field-workAuthorization.US.sponsorship')).toHaveValue('ask');
    await expect(page.getByTestId('field-preferences.salary.CA.max')).toHaveValue('140000');
    await expect(page.getByTestId('field-selfId.US.veteran')).toHaveValue('decline');

    await page.getByTestId('field-selfId.CA.indigenous').selectOption('metis');
    await page.getByTestId('field-preferences.salary.US.min').fill('155000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('save-bar')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('field-selfId.CA.indigenous')).toHaveValue('metis');
    await expect(page.getByTestId('field-preferences.salary.US.min')).toHaveValue('155000');

    // The Resume is kept, labelled and the default.
    await page.getByRole('link', { name: 'Resumes' }).click();
    await expect(page.getByTestId('resume-Main')).toContainText('Default');

    expect(extension.errors).toEqual([]);
  });

  test('shows why the helper is unavailable, and lets you fill in the Profile by hand', async ({
    extension,
  }) => {
    await extension.configureHelper({ installed: false });
    const page = await extension.openDashboard('setup');
    await page.getByTestId('resume-file').setInputFiles(RESUME);
    await page.getByRole('button', { name: 'Add Resume' }).click();
    await page.getByRole('button', { name: 'Read my Resume' }).click();

    const notice = page.getByTestId('error-notice');
    await expect(notice).toHaveAttribute('data-reason', 'helperNotInstalled');
    await expect(notice).toContainText("helper isn't installed");
    await expect(page.getByTestId('error-fix')).toHaveText(
      'Run npx employ-me setup in a terminal, then click Retry.',
    );

    await notice.getByRole('button', { name: 'Fill in my Profile by hand' }).click();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('field-identity.legalName.first')).toHaveValue('');

    // Settings shows the same reason and fix.
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('helper-status')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('helper-status').getByTestId('error-fix')).toContainText(
      'npx employ-me setup',
    );

    // Once it's installed, Check again finds it.
    await extension.configureHelper({ installed: true });
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByTestId('helper-health')).toContainText('Ready');
    expect(extension.errors).toEqual([]);
  });

  test('reports the Provider’s own error and fix', async ({ extension }) => {
    await extension.configureHelper({ failWith: 'providerNotLoggedIn' });
    const page = await extension.openDashboard('setup');
    await page.getByTestId('resume-file').setInputFiles(RESUME);
    await page.getByRole('button', { name: 'Add Resume' }).click();
    await page.getByRole('button', { name: 'Read my Resume' }).click();
    await expect(page.getByTestId('error-notice')).toHaveAttribute('data-reason', 'providerNotLoggedIn');
    await expect(page.getByTestId('error-fix')).toHaveText(
      'Open a terminal, run the CLI once and log in, then click Retry.',
    );

    await extension.configureHelper({ failWith: null });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('step-review')).toBeVisible();
    expect(extension.errors).toEqual([]);
  });

  test('shows how much of your plan is left, warning when it runs low', async ({ extension }) => {
    await extension.configureHelper({
      providers: [
        { id: 'claude', state: 'ready', version: '2.1.311' },
        {
          id: 'codex',
          state: 'ready',
          version: '0.158.0',
          quota: [
            { remainingPercent: 64, windowMinutes: 300 },
            { remainingPercent: 4, windowMinutes: 10_080, resetsAt: '2026-11-02T08:00:00Z' },
          ],
        },
      ],
    });
    const page = await extension.openDashboard('settings');
    const quota = page.getByTestId('quota-codex');
    await expect(quota).toHaveCount(2);
    await expect(quota.first()).toHaveText('64% left of the 5-hour limit');
    await expect(quota.nth(1)).toContainText('4% left of the weekly limit, resets');
    await expect(quota.nth(1)).toHaveClass('field-error');
    await expect(page.getByTestId('quota-claude')).toHaveCount(0);
    expect(extension.errors).toEqual([]);
  });
});

test.describe('with the real helper and its fake Provider', () => {
  test.use({ helper: 'fake' });

  test('reads the Resume over Native Messaging and reports the helper’s health', async ({ extension }) => {
    const page = await extension.openDashboard('setup');
    await page.getByTestId('resume-file').setInputFiles(RESUME);
    await page.getByRole('button', { name: 'Add Resume' }).click();
    await page.getByRole('button', { name: 'Read my Resume' }).click();
    // The fake Provider finds nothing, so nothing is pre-filled: you fill it in.
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review')).toContainText('Fill in what applies to you');
    await expect(page.getByTestId('field-identity.legalName.first')).toHaveValue('');

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('helper-health')).toContainText('Test mode');
    await expect(page.getByTestId('provider-claude')).toContainText('Ready');
    expect(extension.errors).toEqual([]);
  });
});

test.describe('with a helper that can’t read the Resume', () => {
  test.use({ helper: 'fail:resumeUnreadable' });

  test('asks for a readable copy instead of retrying', async ({ extension }) => {
    const page = await extension.openDashboard('setup');
    await page.getByTestId('resume-file').setInputFiles(RESUME);
    await page.getByRole('button', { name: 'Add Resume' }).click();
    await page.getByRole('button', { name: 'Read my Resume' }).click();

    const notice = page.getByTestId('error-notice');
    await expect(notice).toHaveAttribute('data-reason', 'resumeUnreadable');
    await expect(page.getByTestId('error-fix')).toContainText('PDF or DOCX with selectable text');
    await expect(notice.getByRole('button', { name: 'Try again' })).toHaveCount(0);

    // A second file can be added right there; it becomes the one to read.
    const readable = page.getByTestId('add-readable-resume');
    await readable
      .getByTestId('resume-file')
      .setInputFiles(fileOf('sam-lee-text.txt', 'Sam Lee', 'text/plain'));
    await readable.getByRole('button', { name: 'Add this copy' }).click();
    await expect(page.getByTestId('error-notice')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: /sam-lee-text\.txt/ })).toBeChecked();
    expect(extension.errors).toEqual([]);
  });
});
