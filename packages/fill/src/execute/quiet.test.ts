import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../test-support/dom';
import { QUIET_CAP_MS, QUIET_MS, waitForQuiet } from './quiet';

beforeEach(() => {
  vi.useFakeTimers();
  render('<form id="f"><input id="a"></form>');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function form(): Element {
  const el = document.querySelector('#f');
  if (el === null) throw new Error('no form');
  return el;
}

/** Tracks when the wait resolved, in fake-clock milliseconds from the start. */
function timed(wait: Promise<void>): { at: () => number | null } {
  const start = Date.now();
  let at: number | null = null;
  void wait.then(() => {
    at = Date.now() - start;
  });
  return { at: () => at };
}

/** Adds a node to the form at each of these times. */
function changeAt(...times: number[]): void {
  for (const ms of times)
    setTimeout(() => {
      form().append(document.createTextNode('x'));
    }, ms);
}

describe('waitForQuiet', () => {
  it('resolves once the form has been quiet for QUIET_MS', async () => {
    const wait = timed(waitForQuiet(form()));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(wait.at()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.at()).toBe(QUIET_MS);
  });

  it('is pushed back by each change, including attributes that show a question', async () => {
    changeAt(100, 200);
    setTimeout(() => {
      form().querySelector('#a')?.toggleAttribute('hidden', true);
    }, 300);
    const wait = timed(waitForQuiet(form()));
    await vi.advanceTimersByTimeAsync(300 + QUIET_MS - 1);
    expect(wait.at()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.at()).toBe(300 + QUIET_MS);
  });

  it('ignores attributes that change as anything is typed', async () => {
    setTimeout(() => {
      form().querySelector('#a')?.setAttribute('value', 'typed');
    }, 100);
    const wait = timed(waitForQuiet(form()));
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(wait.at()).toBe(QUIET_MS);
  });

  it('resolves at QUIET_CAP_MS when the form never stops changing', async () => {
    const spinner = setInterval(() => {
      form().append(document.createTextNode('.'));
    }, 50);
    const wait = timed(waitForQuiet(form()));
    await vi.advanceTimersByTimeAsync(QUIET_CAP_MS - 1);
    expect(wait.at()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.at()).toBe(QUIET_CAP_MS);
    clearInterval(spinner);
  });

  it('disconnects its observer and leaves no timer behind', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    changeAt(100);
    const wait = waitForQuiet(form());
    await vi.advanceTimersByTimeAsync(100 + QUIET_MS);
    await wait;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('only observes: the form is the same after the wait', async () => {
    const before = document.body.innerHTML;
    const wait = waitForQuiet(form());
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    await wait;
    expect(document.body.innerHTML).toBe(before);
  });
});
