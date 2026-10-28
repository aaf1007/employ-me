import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  isPublicApiUrl,
  profileSchema,
  type FieldDescriptor,
  type FieldOutcome,
  type Posting,
} from '@employ-me/core';
import { expect, FIXTURES_DIR, test } from './harness';
import { expectedFileSchema, type ExpectedField } from './expected';
import { prepare, submitCount } from './fill-page';
import { clickFill, countSubmits, fieldRow, servePublicApi, submits } from './panel';
import { TEST_PROFILE, TEST_RESUME, TEST_SAVED_ANSWERS } from './profile';
import { seedTestProfile } from './seed';

// Workday. Its Application Forms sit behind a separate sign-in for each
// employer, and employ-me never creates accounts or enters passwords, so the
// forms here are SYNTHETIC: built by hand from Workday's public bundles
// (fixtures/workday/synthetic-*.html, with synthetic-workday.js standing in
// for Workday's widgets). They are unverified until a live pass. What is
// public is recorded: two Posting pages and their CXS job API answers.
//
// Each flow is filled one step at a time, as the Fill carries on when the
// user moves on: the test clicks "Save and Continue" and "Submit" itself,
// after checking the Fill pressed neither. UPDATE_FILL_EXPECTED=1 rewrites
// fixtures/workday/<name>.expected.json; review that diff by hand.

const UPDATE = process.env['UPDATE_FILL_EXPECTED'] === '1';
const UNAVAILABLE = {
  state: 'unavailable',
  unavailableFix: 'Run `npx employ-me setup` in a terminal, then click Retry.',
} as const;

const NVIDIA = {
  posting:
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825',
  api: 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825',
  recorded: 'workday/nvidia-2026-10-28',
};
const RBC = {
  posting:
    'https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
  api: 'https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/job/TORONTO-Ontario-Canada/Lead-Software-Developer_R-0000187445-1',
  recorded: 'workday/rbc-2026-10-28',
};
const apply = (posting: string) => `${posting}/apply/applyManually`;

interface StepRun {
  readonly outcomes: readonly FieldOutcome[];
  readonly awaiting: readonly unknown[];
  readonly fields: readonly FieldDescriptor[];
  readonly posting: Posting | null;
}

interface FixtureState {
  readonly footerClicks: number;
  readonly submitted: boolean;
  readonly accountFormSubmits: number;
}

interface FillApi {
  plan(doc: Document, profile: unknown, saved: unknown, options: unknown): unknown;
  execute(plan: unknown): Promise<{
    outcomes: FieldOutcome[];
    awaitingProvider: unknown[];
    fields: FieldDescriptor[];
    plan: { posting: Posting | null };
  }>;
  postingKeyFromUrl(url: URL): unknown;
  publicApiRequest(key: unknown, formUrl: URL): { url: string } | null;
  parsePublicPosting(key: unknown, json: unknown): { ok: boolean; value?: unknown };
  readPosting(doc: Document, url: URL): Posting | null;
  watchForSubmission(doc: Document, ats: string, onSignal: (signal: unknown) => void): () => void;
}

/** Serves a synthetic form at a real apply URL, with the script that stands in for Workday's widgets. */
async function serveSynthetic(
  sites: { serve(url: string, fixture: string): Promise<void> },
  url: string,
  fixture: string,
): Promise<void> {
  await sites.serve(url, `workday/${fixture}.html`);
  await sites.serve(
    `${new URL(url).origin}/employ-me-synthetic/synthetic-workday.js`,
    'workday/synthetic-workday.js',
  );
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => 'employMeFixture' in globalThis);
  await prepare(page.mainFrame());
}

/** One Fill of the step on screen, from the given Profile, with the Provider unavailable (rules only). */
async function fillStep(
  page: Page,
  options: { profile?: unknown; postingDetails?: unknown } = {},
): Promise<StepRun> {
  return page.evaluate(
    async ({ profile, saved, resume, provider, postingDetails }) => {
      const fill = (globalThis as unknown as { employMeFill: FillApi }).employMeFill;
      const file = new File([resume.pdf], resume.meta.fileName, { type: resume.meta.mimeType });
      const planned = fill.plan(document, profile, saved, {
        resume: { meta: resume.meta, file },
        provider,
        ...(postingDetails === null ? {} : { postingDetails }),
      });
      const report = await fill.execute(planned);
      return {
        outcomes: report.outcomes,
        awaiting: report.awaitingProvider,
        fields: report.fields,
        posting: report.plan.posting,
      };
    },
    {
      profile: options.profile ?? TEST_PROFILE,
      saved: TEST_SAVED_ANSWERS,
      resume: TEST_RESUME,
      provider: UNAVAILABLE,
      postingDetails: options.postingDetails ?? null,
    },
  );
}

function fixtureState(page: Page): Promise<FixtureState> {
  return page.evaluate(() => (globalThis as unknown as { employMeFixture: FixtureState }).employMeFixture);
}

/**
 * What each field shows now, read from the DOM by the test, not the engine.
 * Field ids follow Workday's names: a path id (`name--legalName--firstName`),
 * a classic `data-automation-id`, a `formField-` wrapper, or an entry field
 * (`workExperience--startDate-month--0`: entry 0's "From" month box).
 */
function readValues(page: Page, fieldIds: readonly string[]): Promise<Record<string, string>> {
  return page.evaluate((ids) => {
    const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const one = (root: ParentNode, selector: string) => root.querySelector(selector);
    const PART: Record<string, string> = { month: 'Month', day: 'Day', year: 'Year' };
    const locate = (fieldId: string): Element | null => {
      const exact =
        document.getElementById(fieldId) ??
        one(document, `[data-automation-id="${CSS.escape(fieldId)}"]`) ??
        one(document, `[data-automation-id="formField-${CSS.escape(fieldId)}"]`);
      if (exact !== null) return exact;
      const match = /^(.*?)(?:-(month|day|year))?(?:--(\d+))?$/.exec(fieldId);
      const [, key = '', part, index] = match ?? [];
      const segment = part === undefined ? '' : `-dateSection${PART[part] ?? ''}-input`;
      const entry = /^(workExperience|education)--(.+)$/.exec(key);
      if (entry !== null && index !== undefined) {
        const [, kind = '', leaf = ''] = entry;
        const containers = [...document.querySelectorAll('[data-automation-id]')].filter((el) =>
          new RegExp(`^${kind}-\\d+$`).test(el.getAttribute('data-automation-id') ?? ''),
        );
        const container = containers[Number(index)];
        if (container === undefined) return null;
        return (
          one(container, `[id$="--${CSS.escape(leaf)}${segment}"]`) ??
          one(container, `[data-automation-id="${CSS.escape(leaf)}"]`) ??
          one(container, `[data-automation-id="formField-${CSS.escape(leaf)}"]`)
        );
      }
      return segment === '' ? null : document.getElementById(`${key}${segment}`);
    };
    const read = (fieldId: string): string => {
      let el = locate(fieldId);
      if (el === null) return '<missing>';
      if (
        el.localName !== 'fieldset' &&
        el.getAttribute('data-automation-id')?.startsWith('formField-') === true
      ) {
        el = el.querySelector('input:not(.mirror), textarea, button[aria-haspopup="listbox"]') ?? el;
      }
      if (el.localName === 'fieldset') {
        return [...el.querySelectorAll('input')]
          .filter((input) => input instanceof HTMLInputElement && input.checked)
          .map((input) => text(document.querySelector(`label[for="${CSS.escape(input.id)}"]`)))
          .join(' | ');
      }
      if (el.getAttribute('aria-haspopup') === 'listbox' && el.localName === 'button') {
        return text(el) === 'Select One' ? '' : text(el);
      }
      if (el.getAttribute('data-automation-id') === 'searchBox') {
        const container = el.closest('[data-automation-id="multiselectInputContainer"]');
        return [...(container?.querySelectorAll('[data-automation-id="selectedItem"]') ?? [])]
          .map(text)
          .join(' | ');
      }
      if (el instanceof HTMLInputElement && el.type === 'checkbox')
        return el.checked ? 'checked' : 'unchecked';
      if (el instanceof HTMLInputElement && el.type === 'file') {
        // Workday keeps the file in its own state and clears the input.
        const group = el.closest('[role="group"]');
        return [...(group?.querySelectorAll('[data-automation-id="file-upload-item-name"]') ?? [])]
          .map(text)
          .join(' | ');
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return '';
    };
    return Object.fromEntries(ids.map((id) => [id, read(id)]));
  }, fieldIds);
}

/** Fills the step on screen and checks what every Fill must hold; returns its fields for the expected file. */
async function fillAndCheck(
  page: Page,
  options: { profile?: unknown; postingDetails?: unknown } = {},
): Promise<{ fields: ExpectedField[]; posting: Posting | null }> {
  const before = await fixtureState(page);
  const url = page.url();
  const run = await fillStep(page, options);

  // Every field has exactly one outcome: with the Provider unavailable nothing waits.
  expect(run.awaiting).toEqual([]);
  expect(run.outcomes.map((o) => o.fieldId)).toEqual(run.fields.map((f) => f.fieldId));

  const values = await readValues(
    page,
    run.fields.map((f) => f.fieldId),
  );
  const fields = run.outcomes.map((outcome) => ({
    fieldId: outcome.fieldId,
    label: run.fields.find((f) => f.fieldId === outcome.fieldId)?.label ?? '',
    fieldType: outcome.fieldType,
    outcome: outcome.kind,
    reason: outcome.kind === 'filled' ? outcome.source : outcome.reason,
    value: values[outcome.fieldId] ?? '<missing>',
  }));

  // Attestations are never ticked or chosen; passwords never typed.
  for (const field of fields.filter((f) => f.fieldType.startsWith('attestation.'))) {
    expect.soft(field, field.label).toMatchObject({ outcome: 'couldNotFill', reason: 'attestation' });
    expect.soft(['', 'unchecked'], `${field.fieldId} was left alone`).toContain(field.value);
  }
  for (const field of fields.filter((f) => f.fieldType.startsWith('never.'))) {
    expect
      .soft(field, field.label)
      .toMatchObject({ outcome: 'couldNotFill', reason: 'neverStored', value: '' });
  }

  // The Fill pressed nothing that moves the form on: no step change, no Submit, no account, no submit event.
  expect(await fixtureState(page)).toEqual(before);
  expect(await submitCount(page.mainFrame())).toBe(0);
  expect(page.url()).toBe(url);
  return { fields, posting: run.posting };
}

async function userClicksNext(page: Page): Promise<void> {
  await page.locator('[data-automation-id="pageFooterNextButton"]').click();
}

/** Compares a flow's fields, every step in order, with fixtures/<name>.expected.json. */
async function checkExpected(
  name: string,
  posting: Posting | null,
  fields: readonly ExpectedField[],
): Promise<void> {
  const file = path.join(FIXTURES_DIR, `${name}.expected.json`);
  const summary = {
    title: posting?.title,
    company: posting?.company,
    location: posting?.location,
    country: posting?.country,
  };
  if (UPDATE) {
    const out = { fixture: name, ats: 'workday', synthetic: true, posting: summary, fields };
    await writeFile(file, `${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  const expected = expectedFileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  expect(expected.synthetic).toBe(true);
  expect(summary).toEqual(expected.posting);
  expect(fields).toEqual(expected.fields);
}

async function recordedApi(recorded: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, `${recorded}.cxs.json`), 'utf8'));
}

test('a recorded Workday Posting page: content script, Posting and the CXS API', async ({
  page,
  sites,
  extension,
}) => {
  await sites.serve(RBC.posting, `${RBC.recorded}.posting.html`);
  await page.goto(RBC.posting, { waitUntil: 'load' });
  await expect
    .poll(() => extension.pingContentScripts())
    .toEqual([{ type: 'pong', ats: 'workday', url: RBC.posting, topFrame: true }]);

  await prepare(page.mainFrame());
  const json = await recordedApi(RBC.recorded);
  const found = await page.evaluate((answer) => {
    const fill = (globalThis as unknown as { employMeFill: FillApi }).employMeFill;
    const here = new URL(location.href);
    const key = fill.postingKeyFromUrl(here);
    return {
      key,
      posting: fill.readPosting(document, here),
      api: fill.publicApiRequest(key, here)?.url,
      details: fill.parsePublicPosting(key, answer),
    };
  }, json);
  expect(found.key).toEqual({ ats: 'workday', employer: 'rbc', jobId: 'R-0000187445' });
  expect(found.posting).toMatchObject({
    title: 'Lead Software Developer',
    company: 'Royal Bank of Canada',
    country: 'CA',
  });
  // The extension's network allowlist takes exactly this URL, and the recorded answer is what it gets.
  expect(found.api).toBe(RBC.api);
  expect(isPublicApiUrl(new URL(RBC.api))).toBe(true);
  expect(found.details).toMatchObject({
    ok: true,
    value: { title: 'Lead Software Developer', country: 'CA', location: 'TORONTO, Ontario, Canada' },
  });
  // The Snapshot keeps the description as text.
  expect(found.details).toMatchObject({
    value: { description: expect.stringMatching(/^Job Description\s+As a Lead/) },
  });
});

test('US flow (current naming): every step, Self-ID from the Self-ID Answers, never Next or Submit', async ({
  page,
  sites,
  extension,
}) => {
  test.setTimeout(180_000);
  const url = apply(NVIDIA.posting);
  await serveSynthetic(sites, url, 'synthetic-us-apply');
  await open(page, url);
  await expect
    .poll(() => extension.pingContentScripts())
    .toEqual([{ type: 'pong', ats: 'workday', url, topFrame: true }]);

  const steps = [
    'applyFlowMyInfoPage',
    'applyFlowMyExpPage',
    'applyFlowPrimaryQuestionsPage',
    'applyFlowVoluntaryDisclosuresPage',
    'applyFlowSelfIdentifyPage',
    'applyFlowReviewPage',
  ];
  const all: ExpectedField[] = [];
  let posting: Posting | null = null;
  for (const [i, step] of steps.entries()) {
    await expect(page.locator(`[data-automation-id="${step}"]`)).toBeVisible();
    const run = await fillAndCheck(page);
    posting ??= run.posting;
    all.push(...run.fields);
    if (step === 'applyFlowReviewPage') expect(run.fields).toEqual([]);
    if (i < steps.length - 1) await userClicksNext(page);
  }

  // The user's own Submit, then Workday's "Congratulations!".
  await page.evaluate(() => {
    const fill = (globalThis as unknown as { employMeFill: FillApi }).employMeFill;
    fill.watchForSubmission(document, 'workday', (signal) =>
      Object.assign(globalThis, { employMeSignal: signal }),
    );
  });
  await expect(page.locator('[data-automation-id="pageFooterNextButton"]')).toHaveText('Submit');
  await userClicksNext(page);
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as { employMeSignal?: unknown }).employMeSignal))
    .toEqual({ kind: 'confirmed', ats: 'workday', evidence: 'page' });

  expect(sites.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  expect(sites.blocked).toEqual([]);
  await checkExpected('workday/synthetic-us-apply', posting, all);
});

test('US flow: Self-ID Answers left at their default fill "decline" in Workday’s own words', async ({
  page,
  sites,
}) => {
  test.setTimeout(90_000);
  const url = apply(NVIDIA.posting);
  await serveSynthetic(sites, url, 'synthetic-us-apply');
  await open(page, url);
  const declining = profileSchema.parse({ ...TEST_PROFILE, selfId: {} });
  for (let i = 0; i < 3; i++) await userClicksNext(page);

  await expect(page.locator('[data-automation-id="applyFlowVoluntaryDisclosuresPage"]')).toBeVisible();
  const disclosures = await fillAndCheck(page, { profile: declining });
  expect(
    Object.fromEntries(disclosures.fields.map((f) => [f.fieldId, [f.outcome, f.reason, f.value]])),
  ).toEqual({
    'personalInfoUS--gender': ['filled', 'selfId', 'I do not wish to answer'],
    'personalInfoUS--ethnicity': ['filled', 'selfId', 'I do not wish to answer. (United States of America)'],
    'personalInfoUS--veteranStatus': ['filled', 'selfId', 'I do not wish to self-identify'],
    'termsAndConditions--acceptTermsAndAgreements': ['couldNotFill', 'attestation', 'unchecked'],
  });

  await userClicksNext(page);
  const selfIdentify = await fillAndCheck(page, { profile: declining });
  expect(
    selfIdentify.fields.find((f) => f.fieldId === 'selfIdentifiedDisabilityData--disabilityStatus'),
  ).toMatchObject({
    outcome: 'filled',
    reason: 'selfId',
    value: 'I do not want to answer',
  });
});

test('Canadian flow (classic naming): the Posting from the CXS API, Canadian Self-ID', async ({
  page,
  sites,
}) => {
  test.setTimeout(120_000);
  const url = apply(RBC.posting);
  await serveSynthetic(sites, url, 'synthetic-ca-apply');
  await open(page, url);

  // As integration does: the apply flow carries no JSON-LD, so the Posting's country comes from the API.
  const json = await recordedApi(RBC.recorded);
  const postingDetails = await page.evaluate((answer) => {
    const fill = (globalThis as unknown as { employMeFill: FillApi }).employMeFill;
    const here = new URL(location.href);
    const key = fill.postingKeyFromUrl(here);
    return { api: fill.publicApiRequest(key, here)?.url, parsed: fill.parsePublicPosting(key, answer) };
  }, json);
  expect(postingDetails.api).toBe(RBC.api);

  const steps = [
    'applyFlowMyInfoPage',
    'applyFlowPrimaryQuestionsPage',
    'applyFlowVoluntaryDisclosuresPage',
    'applyFlowReviewPage',
  ];
  const all: ExpectedField[] = [];
  let posting: Posting | null = null;
  for (const [i, step] of steps.entries()) {
    await expect(page.locator(`[data-automation-id="${step}"]`)).toBeVisible();
    const run = await fillAndCheck(page, { postingDetails: postingDetails.parsed.value });
    posting ??= run.posting;
    all.push(...run.fields);
    if (i < steps.length - 1) await userClicksNext(page);
  }
  expect(sites.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  await checkExpected('workday/synthetic-ca-apply', posting, all);
});

test('sign-in: the email at most, never a password, never an account', async ({ page, sites }) => {
  const url = apply(RBC.posting);
  await serveSynthetic(sites, url, 'synthetic-sign-in');
  await open(page, url);

  const createAccount = await fillAndCheck(page);
  await userClicksSignIn(page);
  const signIn = await fillAndCheck(page);
  expect(await fixtureState(page)).toMatchObject({ accountFormSubmits: 0 });
  expect(sites.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  await checkExpected('workday/synthetic-sign-in', null, [...createAccount.fields, ...signIn.fields]);
});

async function userClicksSignIn(page: Page): Promise<void> {
  await page.locator('[data-automation-id="signInLink"]').click();
  await expect(page.locator('[data-automation-id="signInSubmitButton"]')).toBeVisible();
}

test.describe('in the side panel', () => {
  test.use({ helper: 'fake' });

  test('one Fill carries across Workday’s steps, and the user’s Submit is recorded', async ({
    page,
    sites,
    extension,
  }) => {
    test.setTimeout(240_000);
    await seedTestProfile(extension);
    const url = apply(NVIDIA.posting);
    await serveSynthetic(sites, url, 'synthetic-us-apply');
    await servePublicApi(page.context(), NVIDIA.api, await recordedApi(NVIDIA.recorded));
    await page.goto(url, { waitUntil: 'load' });
    await countSubmits(page.mainFrame());
    const panel = await extension.openSidePanel({ forPage: page });
    await expect(panel.getByTestId('posting-title')).toHaveText('Software Engineer, OpenShell');

    await clickFill(panel);
    await expect(fieldRow(panel, 'name--legalName--firstName')).toHaveAttribute('data-outcome', 'filled');
    await expect(page.locator('#name--legalName--firstName')).toHaveValue('Sam');
    await expect(page.locator('#country--country')).toHaveText('Canada');
    await expect(fieldRow(panel, 'phoneNumber--smsOptIn')).toHaveAttribute('data-outcome', 'couldNotFill');

    // Each step is filled by the same Fill once you move on to it yourself.
    const steps: ReadonlyArray<readonly [string, string]> = [
      ['workExperience--jobTitle--0', 'filled'],
      ['primaryQuestionnaire--0b1f7a2e01c210001', 'filled'],
      ['personalInfoUS--gender', 'filled'],
      ['selfIdentifiedDisabilityData--disabilityStatus', 'filled'],
    ];
    for (const [fieldId, outcome] of steps) {
      expect((await fixtureState(page)).submitted).toBe(false);
      await userClicksNext(page);
      await expect(fieldRow(panel, fieldId)).toHaveAttribute('data-outcome', outcome, { timeout: 60_000 });
    }
    await expect(page.locator('[id^="workExperience-"][id$="--jobTitle"]').first()).toHaveValue(
      'Software Engineer',
    );
    // Earlier steps keep their outcomes; the signature boxes were left for you.
    await expect(fieldRow(panel, 'name--legalName--firstName')).toHaveAttribute('data-outcome', 'filled');
    await expect(fieldRow(panel, 'selfIdentifiedDisabilityData--name')).toHaveAttribute(
      'data-outcome',
      'couldNotFill',
    );
    await expect(page.locator('#selfIdentifiedDisabilityData--name')).toHaveValue('');

    // Review, then your own Submit: Workday's "Congratulations!" records the Application.
    await userClicksNext(page);
    await expect(page.locator('[data-automation-id="pageFooterNextButton"]')).toHaveText('Submit');
    expect(await fixtureState(page)).toMatchObject({ footerClicks: 5, submitted: false });
    expect(await submits(page.mainFrame())).toBe(0);
    await userClicksNext(page);
    await expect(panel.getByTestId('application-recorded')).toBeVisible({ timeout: 20_000 });

    const tracker = await extension.openDashboard('tracker');
    await tracker.getByTestId('application-row').click();
    const detail = tracker.getByTestId('application-detail');
    await expect(detail).toContainText('Recorded when the job site confirmed your submission');
    await expect(detail.getByTestId('snapshot-description')).toContainText(
      'Are you ready to translate groundbreaking AI research',
    );
    await expect(detail.getByTestId('snapshot-resume')).toHaveText('General · sam-lee-resume.pdf');
    expect(
      sites.requests.filter(
        (r) => r.method !== 'GET' && new URL(r.url).hostname.endsWith('myworkdayjobs.com'),
      ),
    ).toEqual([]);
    expect(extension.errors).toEqual([]);
  });
});
