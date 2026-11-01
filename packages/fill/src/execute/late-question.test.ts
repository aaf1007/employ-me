import { profileSchema } from '@employ-me/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plan, type ProviderFeedback } from '../plan';
import { render } from '../test-support/dom';
import { execute } from './index';

// research 2026-10-28 §7.4: a slow site renders a follow-up question late.
// The Fill waits for the form to go quiet, so it finds the question itself.

const profile = profileSchema.parse({
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' } },
  contact: { email: 'sam.lee@example.com' },
});
const URL_LEVER = new URL('https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/apply');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/**
 * Once the name is typed, the page shows a spinner that ticks every 100 ms
 * (a remote lookup) and renders the email question at `afterMs`.
 */
function slowForm(afterMs: number): void {
  render(`<form id="application-form">
    <label for="n">Full name</label><input id="n" name="name">
    <div id="later"></div>
    <button type="submit">Submit application</button>
  </form>`);
  const name = document.querySelector('#n');
  const later = document.querySelector('#later');
  if (name === null || later === null) throw new Error('no form');
  name.addEventListener(
    'input',
    () => {
      const started = Date.now();
      const tick = setInterval(() => {
        later.textContent = `Loading${'.'.repeat(Math.floor((Date.now() - started) / 100))}`;
      }, 100);
      setTimeout(() => {
        clearInterval(tick);
        later.innerHTML = '<label for="e">Email</label><input id="e" name="email">';
      }, afterMs);
    },
    { once: true },
  );
}

describe('execute() and a question the page renders late', () => {
  it('finds and fills a question that appears 600 ms after the answer that brings it', async () => {
    slowForm(600);
    const running = execute(
      plan(document, profile, [], { url: URL_LEVER, provider: { state: 'unavailable' } }),
    );
    await vi.runAllTimersAsync();
    const report = await running;

    expect(document.querySelector<HTMLInputElement>('#e')?.value).toBe('sam.lee@example.com');
    expect(report.outcomes.map((o) => [o.fieldId, o.kind])).toEqual([
      ['n', 'filled'],
      ['e', 'filled'],
    ]);
  });
});

describe('execute() and your edits during its longer wait', () => {
  // replan.test.ts covers an edit made as a re-plan starts; this one lands mid-wait.
  it('sees an edit made while it waits for a busy page, and the next re-plan leaves it', async () => {
    render(`<form id="application-form">
      <label for="n">Full name</label><input id="n" name="name">
      <label for="u">Contact address for recruiters</label><input id="u" name="u">
      <div id="busy"></div>
      <button type="submit">Submit application</button>
    </form>`);
    const planWith = (provider: ProviderFeedback) =>
      plan(document, profile, [], { url: URL_LEVER, provider });
    const mapped: ProviderFeedback = {
      state: 'answered',
      mappings: [
        {
          fieldId: 'u',
          match: { kind: 'fieldType', fieldType: 'contact.email', options: [] },
          confidence: 0.95,
        },
      ],
    };
    const first = execute(planWith({}));
    await vi.runAllTimersAsync();

    // The page stays busy for a second after the re-plan's write; you retype your name meanwhile.
    document.querySelector('#u')?.addEventListener(
      'input',
      () => {
        const busy = setInterval(() => {
          document.querySelector('#busy')?.toggleAttribute('hidden');
        }, 100);
        setTimeout(() => {
          clearInterval(busy);
        }, 1000);
        setTimeout(() => {
          const name = document.querySelector<HTMLInputElement>('#n');
          if (name === null) return;
          name.value = 'Samuel Lee';
          name.dispatchEvent(new Event('input', { bubbles: true }));
        }, 500);
      },
      { once: true },
    );
    const second = execute(planWith(mapped), await first);
    await vi.runAllTimersAsync();
    expect((await second).userEdited).toEqual(new Set(['n']));

    const third = execute(planWith(mapped), await second);
    await vi.runAllTimersAsync();
    expect(document.querySelector<HTMLInputElement>('#n')?.value).toBe('Samuel Lee');
    expect((await third).userEdited).toEqual(new Set(['n']));
  });
});
