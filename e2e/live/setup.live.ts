import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { expect, test } from './harness';
import { LIVE_DIR, type LiveProvider } from './ledger';
import { PERSONA, resumeHtml } from './persona';
import { PERSONA_BACKUP } from './profile';
import { writeRun } from './report';

// Setup through the dashboard, as a person does it (design.md "Profile" →
// "Setup"), with the persona's synthetic Resume read by the real Provider
// (one parseResume call). Records what the Provider read against what the
// Resume says, corrects the rest by hand, answers the questionnaire, and
// downloads a backup that every live Fill restores.
//
//   LIVE_PROVIDER=claude|codex|none pnpm test:live e2e/live/setup.live.ts

const provider = (process.env['LIVE_PROVIDER'] ?? 'claude') as LiveProvider | 'none';
test.use({ provider, maxCalls: provider === 'none' ? 0 : 1 });

const RESUME_PDF = path.join(LIVE_DIR, 'riley-gagnon-resume.pdf');

/** Every field the review step should end with, by schema path. */
const REVIEW: Readonly<Record<string, string | boolean>> = {
  'identity.legalName.first': PERSONA.first,
  'identity.legalName.last': PERSONA.last,
  'identity.over18': 'yes',
  'contact.email': PERSONA.email,
  'contact.phone.countryCode': PERSONA.phone.countryCode,
  'contact.phone.number': PERSONA.phone.number,
  'contact.phone.type': PERSONA.phone.type,
  'address.line1': PERSONA.address.line1,
  'address.city': PERSONA.address.city,
  'address.region': PERSONA.address.region,
  'address.postalCode': PERSONA.address.postalCode,
  'address.country': PERSONA.address.country,
  'links.linkedin': PERSONA.links.linkedin,
  'links.github': PERSONA.links.github,
  ...Object.fromEntries(
    PERSONA.work.flatMap((job, i): (readonly [string, string | boolean])[] => [
      [`background.workHistory.${String(i)}.employer`, job.employer],
      [`background.workHistory.${String(i)}.title`, job.title],
      [`background.workHistory.${String(i)}.location`, job.location],
      [`background.workHistory.${String(i)}.startDate`, job.start],
      [`background.workHistory.${String(i)}.current`, job.end === ''],
      ...(job.end === '' ? [] : [[`background.workHistory.${String(i)}.endDate`, job.end] as const]),
    ]),
  ),
  'background.education.0.school': PERSONA.education.school,
  'background.education.0.degree': PERSONA.education.degree,
  'background.education.0.degreeLevel': PERSONA.education.level,
  'background.education.0.discipline': PERSONA.education.discipline,
  'background.education.0.startDate': PERSONA.education.start,
  'background.education.0.endDate': PERSONA.education.end,
  ...Object.fromEntries(PERSONA.skills.map((skill, i) => [`background.skills.${String(i)}.name`, skill])),
  ...Object.fromEntries(
    PERSONA.languages.flatMap((l, i): [string, string][] => [
      [`background.languages.${String(i)}.language`, l.language],
      [`background.languages.${String(i)}.proficiency`, l.proficiency],
    ]),
  ),
};

/** Values on the page for every `field-*` control, by schema path. */
async function formValues(page: Page): Promise<Record<string, string | boolean>> {
  return page.locator('[data-testid^="field-"]').evaluateAll((elements) =>
    Object.fromEntries(
      elements.flatMap((el): [string, string | boolean][] => {
        const key = (el.getAttribute('data-testid') ?? '').slice('field-'.length);
        if (el instanceof HTMLInputElement && el.type === 'checkbox') return [[key, el.checked]];
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return [[key, el.value]];
        if (el instanceof HTMLTextAreaElement) return [[key, el.value]];
        return [];
      }),
    ),
  );
}

async function setField(page: Page, key: string, value: string | boolean): Promise<void> {
  const control = page.getByTestId(`field-${key}`);
  const kind = await control.evaluate((el) =>
    el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLInputElement ? el.type : 'text',
  );
  if (typeof value === 'boolean') await control.setChecked(value);
  else if (kind === 'select') await control.selectOption(value);
  else await control.fill(value);
}

/** Adds or removes entries until a list section has `count` of them. */
async function entries(page: Page, prefix: string, count: number, add: string): Promise<void> {
  const rows = page.getByTestId(new RegExp(`^${prefix}-\\d+$`));
  while ((await rows.count()) > count) {
    await rows.last().getByRole('button', { name: 'Remove' }).click();
  }
  while ((await rows.count()) < count) await page.getByRole('button', { name: add }).click();
}

const same = (a: string | boolean | undefined, b: string | boolean) =>
  typeof b === 'boolean'
    ? a === b
    : String(a ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

test('setup: the Provider reads the persona’s Resume; the questionnaire covers the rest', async ({
  extension,
  calls,
}) => {
  test.setTimeout(300_000);
  await mkdir(LIVE_DIR, { recursive: true });
  const printer = await chromium.launch();
  const sheet = await printer.newPage();
  await sheet.setContent(resumeHtml());
  await writeFile(RESUME_PDF, await sheet.pdf({ format: 'Letter' }));
  await printer.close();

  const page = await extension.openDashboard('setup');
  await page.getByTestId('resume-file').setInputFiles(RESUME_PDF);
  await page.getByTestId('resume-label').fill('General');
  await page.getByRole('button', { name: 'Add Resume' }).click();
  await page.getByRole('button', { name: 'Read my Resume' }).click();
  const review = page.getByTestId('step-review');
  const notice = page.getByTestId('error-notice');
  await expect(review.or(notice)).toBeVisible({ timeout: 240_000 });
  const parseError = (await notice.isVisible()) ? await notice.getAttribute('data-reason') : null;
  if (parseError !== null) await notice.getByRole('button', { name: 'Fill in my Profile by hand' }).click();
  await expect(review).toBeVisible();

  // What the Provider read, against what the Resume says.
  const read = await formValues(page);
  const prefilled = await page
    .locator('[data-prefilled="true"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-path') ?? ''));
  const parse = Object.entries(REVIEW).map(([key, want]) => ({
    key,
    want,
    read: read[key] ?? null,
    right: same(read[key], want),
  }));
  const extra = Object.entries(read).filter(
    ([key, value]) => !(key in REVIEW) && value !== '' && value !== false,
  );

  // Correct everything by hand, as the review step asks.
  await entries(page, 'work', PERSONA.work.length, 'Add a job');
  await entries(page, 'education', 1, 'Add a school');
  await entries(page, 'skill', PERSONA.skills.length, 'Add a skill');
  await entries(page, 'language', PERSONA.languages.length, 'Add a language');
  for (const [key, want] of Object.entries(REVIEW)) {
    const now = (await formValues(page))[key];
    if (!same(now, want)) await setField(page, key, want);
  }
  for (const [key] of extra) {
    if (/^(identity\.preferredName|identity\.legalName\.middle|address\.line2|links\.portfolio)/.test(key)) {
      await setField(page, key, '');
    }
  }
  const continueButton = page.getByRole('button', { name: 'Continue' });
  await continueButton.click();

  // Where you apply, and a Work Authorization for each country.
  await expect(page.getByTestId('section-countries')).toBeVisible();
  await page.getByTestId('add-countries').selectOption('CA');
  await page.getByTestId('add-countries').selectOption('US');
  await setField(page, 'workAuthorization.CA.authorizedNow', 'yes');
  await setField(page, 'workAuthorization.CA.sponsorship', 'no');
  await setField(page, 'workAuthorization.CA.status', 'Canadian citizen');
  await setField(page, 'workAuthorization.US.authorizedNow', 'no');
  await setField(page, 'workAuthorization.US.sponsorship', 'yes');
  await setField(page, 'workAuthorization.US.status', 'Canadian citizen, TN eligible');
  await setField(page, 'workAuthorization.US.usPerson', 'no');
  for (const country of ['CA', 'US']) {
    const add = page.getByTestId(`add-workAuthorization.${country}.citizenships`);
    if ((await page.getByTestId(`chosen-workAuthorization.${country}.citizenships-CA`).count()) === 0) {
      await add.selectOption('CA');
    }
  }
  await continueButton.click();

  // Preferences and salary per country.
  await expect(page.getByTestId('section-preferences')).toBeVisible();
  await setField(page, 'preferences.relocation', 'yes');
  await setField(page, 'preferences.startDate', '2027-01-11');
  await setField(page, 'preferences.noticePeriod.amount', '2');
  await setField(page, 'preferences.noticePeriod.unit', 'weeks');
  await page.getByLabel('Remote').check();
  await page.getByLabel('Hybrid').check();
  await setField(page, 'preferences.salary.CA.min', '150000');
  await setField(page, 'preferences.salary.CA.max', '175000');
  await setField(page, 'preferences.salary.US.min', '170000');
  await setField(page, 'preferences.salary.US.max', '200000');
  await continueButton.click();

  // Screening defaults.
  await setField(page, 'screening.howHeard', 'Company website');
  await setField(page, 'screening.referred', 'no');
  await setField(page, 'screening.backgroundCheck', 'yes');
  await setField(page, 'screening.nonCompete', 'no');
  await continueButton.click();

  // Self-ID: every answer declined.
  await expect(page.getByTestId('section-selfId')).toBeVisible();
  for (const select of await page.locator('[data-testid^="field-selfId."]').all()) {
    await expect(select).toHaveValue('decline');
  }
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByTestId('step-done')).toBeVisible();

  // The backup every live Fill restores.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Export everything' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-download').click(),
  ]);
  await download.saveAs(PERSONA_BACKUP);

  const spent = await calls();
  const file = await writeRun(`setup.${provider}`, {
    provider,
    parseError,
    calls: spent,
    prefilled,
    parse,
    extra,
    right: parse.filter((p) => p.right).length,
    of: parse.length,
  });
  test.info().annotations.push({ type: 'run', description: file });
  expect(extension.errors).toEqual([]);
});
