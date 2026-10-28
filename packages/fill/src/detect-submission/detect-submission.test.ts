import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '../test-support/dom';
import { CONFIRMATION_WINDOW_MS, isConfirmation, watchForSubmission, type SubmissionSignal } from './index';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('isConfirmation', () => {
  it.each([
    ['greenhouse', 'https://job-boards.greenhouse.io/acme/jobs/1/confirmation'],
    ['lever', 'https://jobs.lever.co/acme/0b2c9a3e-1111-4222-8333-444455556666/thanks'],
  ] as const)('%s confirms by URL', (ats, url) => {
    expect(isConfirmation(document, new URL(url), ats)).toEqual({ kind: 'confirmed', ats, evidence: 'url' });
  });

  it('Ashby confirms with its success container', () => {
    render('<div class="ashby-application-form-success-container">Thanks for applying!</div>');
    expect(
      isConfirmation(document, new URL('https://jobs.ashbyhq.com/acme/x/application'), 'ashby'),
    ).toMatchObject({
      kind: 'confirmed',
      evidence: 'page',
    });
  });

  it('Workday confirms with its "Congratulations!" panel', () => {
    render(
      '<div data-automation-id="signInContent"><h3>Congratulations!</h3><p>Your application has successfully been submitted.</p></div>',
    );
    expect(
      isConfirmation(document, new URL('https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/x_R-1'), 'workday'),
    ).toEqual({ kind: 'confirmed', ats: 'workday', evidence: 'page' });
  });

  it('a Workday step is not a confirmation', () => {
    render('<div data-automation-id="applyFlowMyInfoPage"><h2>My Information</h2></div>');
    expect(
      isConfirmation(document, new URL('https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/x_R-1'), 'workday'),
    ).toBeNull();
  });

  it('a form is not a confirmation', () => {
    render('<form id="application-form"><input name="email"></form>');
    expect(
      isConfirmation(document, new URL('https://job-boards.greenhouse.io/acme/jobs/1'), 'greenhouse'),
    ).toBeNull();
  });
});

describe('watchForSubmission', () => {
  it('reports the confirmation when the page shows it', async () => {
    const signals: SubmissionSignal[] = [];
    const stop = watchForSubmission(document, 'ashby', (s) => signals.push(s));
    render('<div class="ashby-application-form-success-container">Application submitted</div>');
    await vi.waitFor(() => {
      expect(signals).toEqual([{ kind: 'confirmed', ats: 'ashby', evidence: 'page' }]);
    });
    stop();
  });

  it('asks "Did you apply?" when a submit gets no confirmation in time', () => {
    vi.useFakeTimers();
    render('<form id="f"><input name="email"></form>');
    const signals: SubmissionSignal[] = [];
    const stop = watchForSubmission(document, 'greenhouse', (s) => signals.push(s));
    // The user's own submit, simulated.
    document.getElementById('f')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(CONFIRMATION_WINDOW_MS + 1);
    expect(signals).toEqual([{ kind: 'unclear' }]);
    stop();
  });

  it('Workday: the footer Submit, a plain button, starts the same wait', () => {
    vi.useFakeTimers();
    render('<button type="button" data-automation-id="pageFooterNextButton">Submit</button>');
    const signals: SubmissionSignal[] = [];
    const stop = watchForSubmission(document, 'workday', (s) => signals.push(s));
    // The user's own click, simulated.
    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(CONFIRMATION_WINDOW_MS + 1);
    expect(signals).toEqual([{ kind: 'unclear' }]);
    stop();
  });
});
