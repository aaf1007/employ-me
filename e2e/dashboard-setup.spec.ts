import { fileOf } from './dashboard';
import { expect, test } from './harness';

// Setup (design.md "Profile" → "Setup") against the test build's in-memory
// helper: add a Resume, the Provider reads it, you check every field, then
// the questionnaire.

const RESUME = fileOf(
  'sam-lee.txt',
  'Sam Lee\nsam.lee@example.com\nSoftware Engineer, Example Corp',
  'text/plain',
);

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

  await page.getByRole('button', { name: 'Fill in my Profile by hand' }).click();
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
