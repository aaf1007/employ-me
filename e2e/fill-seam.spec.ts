import { expect, test } from './harness';
import { formFrame, prepare, readValues, runFill } from './fill-page';
import { formFixture } from './forms';
import { stubSideRequests } from './side-requests';

// The re-plan seam integration will use: plan with the Provider pending,
// send plan.providerRequest (labels and options only) to mapFields, then
// plan again with the mappings and the Drafts the user accepted, and execute.

test('a Fill re-plans with Provider mappings and accepted Drafts', async ({ page, sites }) => {
  test.setTimeout(90_000);
  const form = formFixture('greenhouse/anthropic-2026-10-28');
  await sites.replay(`${form.name}.har`);
  await stubSideRequests(page.context(), form.ats);
  await page.goto(form.url, { waitUntil: 'load' });
  const frame = await formFrame(page, form);
  await frame.waitForSelector('#first_name');
  await prepare(frame);

  // 1. Rules first; the Provider hasn't been asked yet.
  const first = await runFill(frame, {});
  const ADDRESS = 'question_19018749008'; // "What is the address from which you plan on working?"
  const DEADLINES = 'question_19018741008'; // "Do you have any deadlines or timeline considerations…?"
  const WHY = 'question_19018743008'; // "Why Anthropic?" (required free text)
  expect(first.awaiting.map((a) => a.fieldId)).toEqual(expect.arrayContaining([ADDRESS, DEADLINES, WHY]));
  expect(first.mappingRequest).toEqual(expect.arrayContaining([ADDRESS, DEADLINES]));
  expect(first.draftRequests).toContain(WHY);
  // The form has an AI-use policy question, so Drafts are "polish my draft".
  expect(first.draftModes).toEqual(['polish']);
  // What would go to the Provider: labels and options, never the Profile.
  expect(first.providerRequestJson).not.toMatch(/Sam|sam\.lee|416|Toronto|Northwind/);
  expect(first.providerRequestJson).not.toMatch(/gender|veteran|arbitrat|AI Policy/i);

  // 2. Plan again with the Provider's answers and the user's accepted Draft.
  const second = await runFill(frame, {
    state: 'answered',
    mappings: [
      {
        fieldId: ADDRESS,
        match: { kind: 'fieldType', fieldType: 'address.full', options: [] },
        confidence: 0.92,
      },
      {
        fieldId: DEADLINES,
        match: { kind: 'fieldType', fieldType: 'pref.startDate', options: [] },
        confidence: 0.35,
      },
    ],
    accepted: [{ fieldId: WHY, text: 'I want to work on AI safety.' }],
  });
  expect(second.awaiting).toEqual([]);
  const outcome = (id: string) => second.outcomes.find((o) => o.fieldId === id);
  expect(outcome(ADDRESS)).toMatchObject({ kind: 'needsReview', reason: 'providerMatched' });
  // Low confidence is a suggestion only, like a similar Saved Answer: reviewed, not written.
  expect(outcome(DEADLINES)).toMatchObject({ kind: 'needsReview', reason: 'providerMatched' });
  expect(outcome(WHY)).toMatchObject({ kind: 'filled', source: 'savedAnswer' });

  const values = await readValues(frame, [ADDRESS, DEADLINES, WHY, 'first_name']);
  expect(values).toEqual({
    [ADDRESS]: '100 Queen St W, Toronto, ON, M5H 2N2, Canada',
    [DEADLINES]: '',
    [WHY]: 'I want to work on AI safety.',
    first_name: 'Sam',
  });
});
