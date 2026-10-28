import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, FIXTURES_DIR, test } from './harness';
import { expectedFileSchema, type ExpectedField } from './expected';
import { formFrame, prepare, readValues, runFill, submitCount } from './fill-page';
import { FORMS } from './forms';
import { isSubmission, stubSideRequests } from './side-requests';

// One spec per recorded Application Form: replay it offline with its real
// JavaScript, Fill it from the test Profile with the Provider unavailable
// (rules only), and check every field's outcome and value, that Attestations
// were left alone, and that nothing was submitted.
//
// UPDATE_FILL_EXPECTED=1 rewrites fixtures/<name>.expected.json from the run;
// review the diff by hand before committing it.

const UPDATE = process.env['UPDATE_FILL_EXPECTED'] === '1';
const UNAVAILABLE_FIX = 'Run `npx employ-me setup` in a terminal, then click Retry.';

for (const form of FORMS) {
  test(`fills ${form.name}`, async ({ page, sites }) => {
    test.setTimeout(90_000);
    await sites.replay(`${form.name}.har`);
    await stubSideRequests(page.context(), form.ats);
    await page.goto(form.url, { waitUntil: 'load' });
    const frame = await formFrame(page, form);
    await frame.waitForSelector('input:not([type="hidden"]), textarea', { timeout: 20_000 });
    await page.waitForTimeout(1500);
    const startUrl = frame.url();
    await prepare(frame);

    const run = await runFill(frame, { state: 'unavailable', unavailableFix: UNAVAILABLE_FIX });
    const values = await readValues(
      frame,
      run.fields.map((f) => f.fieldId),
    );
    const actual: ExpectedField[] = run.outcomes.map((outcome) => {
      const field = run.fields.find((f) => f.fieldId === outcome.fieldId);
      return {
        fieldId: outcome.fieldId,
        label: field?.label ?? '',
        fieldType: outcome.fieldType,
        outcome: outcome.kind,
        reason: outcome.kind === 'filled' ? outcome.source : outcome.reason,
        value: values[outcome.fieldId] ?? '<missing>',
      };
    });

    // Every field has exactly one outcome: with the Provider unavailable nothing waits.
    expect(run.awaiting).toEqual([]);
    expect(run.outcomes.map((o) => o.fieldId)).toEqual(run.fields.map((f) => f.fieldId));

    // Attestations are never ticked or chosen.
    for (const field of actual.filter((f) => f.fieldType.startsWith('attestation.'))) {
      expect.soft(field, field.label).toMatchObject({ outcome: 'couldNotFill', reason: 'attestation' });
      expect.soft(['', 'unchecked'], `${field.fieldId} was left alone`).toContain(field.value);
    }

    // Nothing was submitted: no submit event, no submission request, still on the form.
    expect(await submitCount(frame)).toBe(0);
    expect(sites.requests.filter((r) => isSubmission(form, r))).toEqual([]);
    expect(frame.url()).toBe(startUrl);

    const file = path.join(FIXTURES_DIR, `${form.name}.expected.json`);
    const posting = {
      title: run.posting?.title,
      company: run.posting?.company,
      location: run.posting?.location,
      country: run.posting?.country,
    };
    if (UPDATE) {
      await writeFile(
        file,
        `${JSON.stringify({ fixture: form.name, ats: form.ats, posting, fields: actual }, null, 2)}\n`,
      );
      return;
    }
    const expected = expectedFileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    expect(posting).toEqual(expected.posting);
    expect(actual).toEqual(expected.fields);
  });
}
