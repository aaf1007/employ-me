import { formFrame } from './fill-page';
import { formFixture } from './forms';
import { expect, test } from './harness';
import { clickFill, countSubmits, fieldRow, servePublicApi, submits } from './panel';
import { seedTestProfile } from './seed';
import { isSubmission, stubSideRequests } from './side-requests';

// design.md "Keeping answers you gave on the form": once the Application is
// created, the side panel offers the answers you typed or changed, each
// unticked; the ones you tick become Saved Answers, and a later Fill on
// another employer's form that asks the same question word for word fills
// them. No helper: nothing here needs the AI, and nothing goes to it.

const SECOND_URL = 'https://job-boards.greenhouse.io/northwind/jobs/7654330';
const C_SHARP = 'How many years of C# development experience do you have?';
const FRAMEWORKS = 'What frameworks/libraries are you most proficient in?';

test('answers you typed or changed are offered once you apply, and fill the next form', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(150_000);
  await seedTestProfile(extension);
  const form = formFixture('greenhouse/geotab-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/geotab/jobs/5423014008?questions=true&pay_transparency=true',
    { title: 'Computer Vision Engineering', company_name: 'Geotab' },
  );
  await page.goto(form.url, { waitUntil: 'load' });
  const frame = await formFrame(page, form);
  await frame.waitForSelector('#first_name', { timeout: 20_000 });
  await countSubmits(frame);
  const panel = await extension.openSidePanel({ forPage: page });
  await expect(panel.getByTestId('posting-title')).not.toHaveText('');

  await clickFill(panel);
  // Without the AI, the C# question couldn't be filled; the frameworks one came from a Saved Answer.
  await expect(fieldRow(panel, 'question_18658589008')).toHaveAttribute('data-outcome', 'couldNotFill');
  await expect(fieldRow(panel, 'question_18658591008')).toHaveAttribute('data-outcome', 'filled');

  // You answer the one it couldn't fill, and change the one it filled.
  await frame.locator('#question_18658589008').fill('5');
  await frame.locator('#question_18658591008').fill('TypeScript and React.');

  // You click Submit; Greenhouse's board moves to its confirmation without a page load (simulated).
  expect(await submits(frame)).toBe(0);
  expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);
  await frame.evaluate(() => {
    history.pushState({}, '', `${location.pathname}/confirmation`);
  });
  await expect(panel.getByTestId('application-recorded')).toBeVisible({ timeout: 15_000 });

  const offer = panel.getByTestId('answer-offer');
  await expect(offer).toContainText('Save 2 answers you typed or changed for next time?');
  const offered = offer.getByTestId('offered-answer');
  // Only those two: nothing filled from your Profile, no Self-ID, Attestation or file.
  await expect(offered).toHaveCount(2);
  const cSharp = offered.filter({ hasText: C_SHARP });
  const frameworks = offered.filter({ hasText: FRAMEWORKS });
  await expect(cSharp.getByTestId('offered-answer-value')).toHaveText('5');
  await expect(frameworks.getByTestId('offered-answer-value')).toHaveText('TypeScript and React.');
  await expect(frameworks.getByTestId('offered-answer-previous')).toContainText('React, Node.js and Django.');

  // Opt-in: nothing is ticked, and Save stays off until you tick one.
  for (const box of await offer.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  const save = offer.getByRole('button', { name: /^Save \d answers?$/ });
  await expect(save).toBeDisabled();
  await cSharp.getByRole('checkbox').check();
  await frameworks.getByRole('checkbox').check();
  await save.click();
  await expect(panel.getByTestId('answer-offer-saved')).toContainText('Kept 2 Saved Answers.');

  // Visible and editable in the dashboard like any other.
  const dashboard = await extension.openDashboard('saved-answers');
  const kept = dashboard.getByTestId('saved-answer').filter({ hasText: C_SHARP });
  await expect(kept).toContainText('5');
  await expect(kept).toContainText('Kept from an answer you gave on a form');
  await expect(dashboard.getByTestId('saved-answer').filter({ hasText: FRAMEWORKS })).toContainText(
    'TypeScript and React.',
  );
  await dashboard.close();

  // Another employer's form asks the same questions word for word: the next Fill fills them.
  await sites.serve(SECOND_URL, 'greenhouse/same-questions.html');
  await servePublicApi(
    page.context(),
    'https://boards-api.greenhouse.io/v1/boards/northwind/jobs/7654330?questions=true&pay_transparency=true',
    { title: 'Backend Engineer', company_name: 'Northwind' },
  );
  await page.goto(SECOND_URL, { waitUntil: 'load' });
  await countSubmits(page.mainFrame());
  await expect(panel.getByTestId('posting-title')).toHaveText('Backend Engineer', { timeout: 15_000 });
  await clickFill(panel);
  await expect(fieldRow(panel, 'question_4001')).toHaveAttribute('data-outcome', 'filled');
  await expect(page.locator('#question_4001')).toHaveValue('5');
  await expect(fieldRow(panel, 'question_4002')).toHaveAttribute('data-outcome', 'filled');
  await expect(page.locator('#question_4002')).toHaveValue('TypeScript and React.');

  expect(await submits(page.mainFrame())).toBe(0);
  expect(extension.errors).toEqual([]);
});
