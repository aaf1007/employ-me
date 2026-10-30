import { expect, test } from './harness';
import { clickFill, countSubmits, fieldRow, servePublicApi, submits } from './panel';
import { seedTestProfile } from './seed';

// design.md "Sensitive questions": a Self-ID question the rules don't
// recognise, which the AI says is one, is filled from your own Self-ID
// Answers through the AI's reading of its options, and always goes to Needs
// your review. The in-memory helper plays the AI, so the mapping is the
// test's own.

test.use({ helper: 'inMemory' });

const FORM_URL = 'https://job-boards.greenhouse.io/acme/jobs/7654322';
const API_URL =
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs/7654322?questions=true&pay_transparency=true';

test('an oddly worded Self-ID question gets your answer, through the AI’s option map, for review', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(90_000);
  await seedTestProfile(extension);
  await extension.configureHelper({
    mappings: [
      {
        fieldId: 'question_3001',
        match: {
          kind: 'fieldType',
          fieldType: 'selfId.us.race',
          options: [
            { option: 'East or South Asian', value: 'asian' },
            { option: 'European', value: 'white' },
            { option: 'Mixed heritage', value: 'twoOrMoreRaces' },
            { option: 'Skip this question', value: 'decline' },
          ],
        },
        confidence: 0.95,
      },
    ],
  });
  await sites.serve(FORM_URL, 'greenhouse/self-id-wording.html');
  // A US Posting, so the US Self-ID Answers apply.
  await servePublicApi(page.context(), API_URL, {
    title: 'Data Engineer',
    company_name: 'Acme',
    location: { name: 'New York, NY' },
  });
  await page.goto(FORM_URL);
  await countSubmits(page.mainFrame());
  const panel = await extension.openSidePanel({ forPage: page });

  await clickFill(panel);
  const heritage = fieldRow(panel, 'question_3001');
  // The test Profile's US race is "asian": the AI's map finds the form's word for it.
  await expect(heritage).toHaveAttribute('data-outcome', 'needsReview');
  await expect(heritage).toContainText('The AI matched this field');
  await expect(page.locator('#question_3001 option:checked')).toHaveText('East or South Asian');
  await expect(fieldRow(panel, 'first_name')).toHaveAttribute('data-outcome', 'filled');

  expect((await extension.helperRequests()).filter((r) => r.type === 'mapFields')).toHaveLength(1);
  expect(await submits(page.mainFrame())).toBe(0);
  expect(extension.errors).toEqual([]);
});
