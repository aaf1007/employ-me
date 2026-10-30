import { profileSchema } from '@employ-me/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute } from '../../execute';
import { plan } from '../../plan';
import { render } from '../../test-support/dom';
import { workdayAdapter } from './index';
import { STEP_POLL_MS, STEP_READY_CAP_MS } from './step-ready';

// A Workday step renders its sections in batches (research 2026-10-28 §7.4):
// the Fill waits for the field count to hold before planning the step.

const APPLY = new URL(
  'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-Remote/Software-Engineer--OpenShell_JR2020825/apply/applyManually',
);
const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});

const FIRST_NAME = `<div data-automation-id="formField-legalName--firstName">
  <label for="name--legalName--firstName">First Name</label>
  <input type="text" id="name--legalName--firstName"></div>`;
const EMAIL = `<div data-automation-id="formField-emailAddress">
  <label for="emailAddress--emailAddress">Email Address</label>
  <input type="text" id="emailAddress--emailAddress"></div>`;

beforeEach(() => {
  vi.useFakeTimers();
  render(`<div data-automation-id="applyFlowMyInfoPage"><div id="first"></div><div id="second"></div></div>`);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Renders a batch of fields into a section of the step at `ms`. */
function batchAt(ms: number, section: '#first' | '#second', html: string): void {
  setTimeout(() => {
    const el = document.querySelector(section);
    if (el !== null) el.innerHTML = html;
  }, ms);
}

function step(): Element {
  const form = workdayAdapter.findForm(document);
  if (form === null) throw new Error('no step');
  return form;
}

function timed(wait: Promise<void>): { at: () => number | null } {
  const start = Date.now();
  let at: number | null = null;
  void wait.then(() => {
    at = Date.now() - start;
  });
  return { at: () => at };
}

describe('workdayAdapter.waitForStepReady', () => {
  it('waits for the second batch, then for the count to hold', async () => {
    batchAt(0, '#first', FIRST_NAME);
    await vi.advanceTimersByTimeAsync(0);
    batchAt(100, '#second', EMAIL);
    const wait = timed(workdayAdapter.waitForStepReady(step()));
    // 1 field at 0, 2 at the first poll, still 2 at the second.
    await vi.advanceTimersByTimeAsync(2 * STEP_POLL_MS - 1);
    expect(wait.at()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.at()).toBe(2 * STEP_POLL_MS);
  });

  it('is ready after one poll when the step is already whole', async () => {
    batchAt(0, '#first', FIRST_NAME);
    await vi.advanceTimersByTimeAsync(0);
    const wait = timed(workdayAdapter.waitForStepReady(step()));
    await vi.advanceTimersByTimeAsync(STEP_POLL_MS);
    expect(wait.at()).toBe(STEP_POLL_MS);
  });

  it('does not take an empty step as ready', async () => {
    batchAt(3 * STEP_POLL_MS - 10, '#first', FIRST_NAME);
    const wait = timed(workdayAdapter.waitForStepReady(step()));
    await vi.advanceTimersByTimeAsync(3 * STEP_POLL_MS);
    expect(wait.at()).toBeNull();
    await vi.advanceTimersByTimeAsync(STEP_POLL_MS);
    expect(wait.at()).toBe(4 * STEP_POLL_MS);
  });

  it('goes ahead at STEP_READY_CAP_MS on a step that never stops growing', async () => {
    let n = 0;
    const grow = setInterval(() => {
      n++;
      document
        .querySelector('#second')
        ?.insertAdjacentHTML('beforeend', `<label for="q${n}">Question ${n}</label><input id="q${n}">`);
    }, STEP_POLL_MS / 2);
    const wait = timed(workdayAdapter.waitForStepReady(step()));
    await vi.advanceTimersByTimeAsync(STEP_READY_CAP_MS);
    expect(wait.at()).toBe(STEP_READY_CAP_MS);
    clearInterval(grow);
  });

  it('lets the first Fill of a step wait for sections still loading when it started', async () => {
    // The step shows nothing yet; its sections arrive later than one quiet wait would look.
    batchAt(300, '#first', FIRST_NAME);
    batchAt(600, '#second', EMAIL);
    const running = execute(plan(document, profile, [], { url: APPLY, provider: { state: 'unavailable' } }));
    await vi.runAllTimersAsync();
    const report = await running;
    expect(report.outcomes.map((o) => [o.fieldId, o.kind])).toEqual([
      ['name--legalName--firstName', 'filled'],
      ['emailAddress--emailAddress', 'filled'],
    ]);
  });

  it('writes to the control the step shows after the wait, when the page re-rendered it under the same id', async () => {
    batchAt(0, '#first', FIRST_NAME);
    await vi.advanceTimersByTimeAsync(0);
    const planned = plan(document, profile, [], { url: APPLY, provider: { state: 'unavailable' } });
    // Workday re-renders the section while the step loads: same field, new input.
    batchAt(100, '#first', FIRST_NAME);
    const running = execute(planned);
    await vi.runAllTimersAsync();
    const report = await running;
    expect(document.querySelector<HTMLInputElement>('#name--legalName--firstName')?.value).toBe('Sam');
    expect(report.outcomes.map((o) => [o.fieldId, o.kind])).toEqual([
      ['name--legalName--firstName', 'filled'],
    ]);
  });
});
