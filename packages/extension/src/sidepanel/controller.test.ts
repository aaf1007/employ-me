import { describe, expect, it, vi } from 'vitest';
import { PanelController } from './controller';
import { DETECTED, deps, fakeBackground, fakeTab, POSTING, PROFILE, settle } from './test-fakes';

const application = {
  id: 'a1',
  posting: POSTING,
  appliedAt: '2026-10-28T12:00:00Z',
  source: 'confirmation',
  status: 'applied',
  notes: '',
};

function background(overrides: Parameters<typeof fakeBackground>[0] = {}) {
  return fakeBackground({
    'profile.get': () => ({ ok: true, value: PROFILE }),
    'applications.findByPosting': () => ({ ok: true, value: [] }),
    'helper.mapFields': () => ({
      ok: true,
      value: {
        mappings: [
          {
            fieldId: 'u',
            match: { kind: 'fieldType', fieldType: 'contact.email', options: [] },
            confidence: 0.9,
          },
        ],
      },
    }),
    'helper.draftAnswer': () => ({
      ok: true,
      value: {
        draft: {
          text: 'Because of the mission.',
          language: 'en',
          claims: [{ text: 'I won an award.', support: 'unsupported' }],
        },
      },
    }),
    'savedAnswers.saveAcceptedDraft': () => ({
      ok: true,
      value: {
        id: 's1',
        question: 'Why Acme?',
        answer: 'Because of the people.',
        fieldType: 'freeText.question',
        source: 'draft',
        employerOverrides: {},
        createdAt: '2026-10-28T12:00:00Z',
        updatedAt: '2026-10-28T12:00:00Z',
      },
    }),
    'applications.recordSubmission': () => ({ ok: true, value: application }),
    ...overrides,
  });
}

async function started(tab = fakeTab(), bg = background()) {
  const controller = new PanelController(deps(tab.tab, bg.call));
  controller.start();
  await settle();
  return { controller, tab, bg, state: () => controller.store.get() };
}

describe('PanelController', () => {
  it('finds the form, warns when you already applied, and picks the default Resume', async () => {
    const bg = background({
      'applications.findByPosting': () => ({ ok: true, value: [{ ...application, hasSnapshot: true }] }),
    });
    const { state } = await started(fakeTab(), bg);
    expect(state()).toMatchObject({ phase: 'ready', resumeId: 'r1', applied: [{ id: 'a1' }] });
    expect(bg.calls.find((c) => c.type === 'applications.findByPosting')?.payload).toEqual({
      key: POSTING.key,
    });
  });

  it('maps fields and drafts every required question at once, then plans again with both', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();

    const types = bg.calls.map((c) => c.type);
    expect(types).toContain('helper.mapFields');
    expect(types.filter((t) => t === 'helper.draftAnswer')).toHaveLength(1);
    // The Draft context is built by toDraftContext: whitelisted facts, never contact or address.
    const draftInput = JSON.stringify(bg.calls.find((c) => c.type === 'helper.draftAnswer')?.payload);
    expect(draftInput).toContain('Sam Lee');
    expect(draftInput).not.toMatch(/sam\.lee@example\.com|Queen St|M5H/);
    expect(tab.sent.map((s) => s.type)).toEqual(['fill', 'feedback']);
    expect(tab.sent[1]?.provider).toMatchObject({
      state: 'answered',
      mappings: [{ fieldId: 'u' }],
      draftsReady: ['why'],
    });
    expect(state()).toMatchObject({ fill: 'done', provider: { state: 'answered' } });
    expect(state().drafts['why']).toMatchObject({
      status: 'ready',
      text: 'Because of the mission.',
      flagged: ['I won an award.'],
    });
  });

  // fill keeps a required question waiting until its Draft is ready or reported failed.
  it('reports a Draft the Provider couldn’t write, so the field stops waiting', async () => {
    const failing = background({
      'helper.draftAnswer': () => ({
        ok: false,
        error: { reason: 'providerTimeout', message: 'The AI took too long.', fix: 'Click Retry.' },
      }),
    });
    const { controller, tab, state } = await started(fakeTab(), failing);
    await controller.fill();
    expect(tab.sent.at(-1)?.provider).toMatchObject({ draftsFailed: ['why'] });
    expect(state().drafts['why']?.status).toBe('failed');
  });

  it('accepting a Draft writes your edit through a re-plan and keeps it as a Saved Answer', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();
    controller.drafts.setText('why', 'Because of the people.');
    await controller.drafts.accept('why');

    expect(tab.sent.at(-1)?.provider).toMatchObject({
      accepted: [{ fieldId: 'why', text: 'Because of the people.' }],
      draftsReady: [],
    });
    expect(bg.calls.find((c) => c.type === 'savedAnswers.saveAcceptedDraft')?.payload).toEqual({
      question: 'Why Acme?',
      answer: 'Because of the people.',
      fieldType: 'freeText.question',
      employer: 'acme',
    });
    expect(state().view?.fields.find((f) => f.fieldId === 'why')?.outcome?.kind).toBe('filled');
  });

  it('in polish mode waits for your own text, and polishes it', async () => {
    const { controller, bg, state } = await started(fakeTab({ aiPolicy: true }));
    await controller.fill();
    expect(bg.calls.some((c) => c.type === 'helper.draftAnswer')).toBe(false);
    expect(state().drafts['why']?.status).toBe('yourDraft');

    controller.drafts.setText('why', 'I like the mission.');
    await controller.drafts.draft('why');
    expect(bg.calls.find((c) => c.type === 'helper.draftAnswer')?.payload).toMatchObject({
      input: { mode: 'polish', userDraft: 'I like the mission.' },
    });
    expect(state().drafts['why']).toMatchObject({ status: 'ready', polished: true });
  });

  it('keeps filling on rules when the AI is unavailable, with the helper’s fix', async () => {
    const unavailable = {
      ok: false,
      error: { reason: 'providerRateLimited', message: 'limit', fix: 'Wait for your plan to reset.' },
    };
    const bg = background({ 'helper.mapFields': () => unavailable, 'helper.draftAnswer': () => unavailable });
    const { controller, tab, state } = await started(fakeTab(), bg);
    await controller.fill();
    expect(tab.sent.at(-1)?.provider).toMatchObject({
      state: 'unavailable',
      unavailableFix: 'Wait for your plan to reset.',
    });
    expect(state().provider).toMatchObject({
      state: 'unavailable',
      notice: { fix: 'Wait for your plan to reset.' },
    });
    expect(state().view?.fields.map((f) => f.outcome?.kind)).toEqual([
      'filled',
      'couldNotFill',
      'couldNotFill',
    ]);
  });

  it('records the Application with its Snapshot when the job site confirms', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();
    tab.emit({ type: 'answers', answers: [{ label: 'Name', fieldType: 'name.full', value: 'Sam Lee' }] });
    tab.emit({ type: 'submission', signal: 'confirmed' });
    await settle();

    expect(bg.calls.find((c) => c.type === 'applications.recordSubmission')?.payload).toEqual({
      source: 'confirmation',
      // The description lives in the Snapshot, not the Posting.
      posting: POSTING,
      snapshot: {
        capturedAt: '2026-10-28T12:00:00.000Z',
        postingDescription: 'From the public API.',
        answers: [{ label: 'Name', fieldType: 'name.full', value: 'Sam Lee' }],
        resume: { id: 'r1', label: 'General', fileName: 'sam-lee.pdf' },
      },
    });
    expect(state().submission.state).toBe('recorded');
    expect(tab.sent.at(-1)?.type).toBe('endSession');
  });

  it('records the confirmation page a form submit loads (Lever /thanks)', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();
    tab.navigate({ ...DETECTED, fieldCount: 0, confirmed: true });
    await settle();
    expect(bg.calls.some((c) => c.type === 'applications.recordSubmission')).toBe(true);
    expect(state().submission.state).toBe('recorded');
  });

  it('asks "Did you apply?" when you leave a filled form without a confirmation', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();
    tab.navigate(null);
    // The panel looks for the form on the new page a few times first.
    await vi.waitFor(() => {
      expect(state().submission.state).toBe('askDidYouApply');
    });

    await controller.answerDidYouApply(true);
    expect(bg.calls.find((c) => c.type === 'applications.recordSubmission')?.payload).toMatchObject({
      source: 'didYouApply',
    });
  });

  it('forgets the Fill when you say you didn’t apply', async () => {
    const { controller, tab, bg, state } = await started();
    await controller.fill();
    tab.navigate(null);
    await vi.waitFor(() => {
      expect(state().submission.state).toBe('askDidYouApply');
    });
    await controller.answerDidYouApply(false);
    expect(state().submission.state).toBe('declined');
    expect(bg.calls.some((c) => c.type === 'applications.recordSubmission')).toBe(false);
  });

  it('carries the same Fill on when the form shows its next step', async () => {
    const { controller, tab } = await started();
    await controller.fill();
    tab.emit({ type: 'formChanged' });
    await settle();
    expect(tab.sent.filter((s) => s.type === 'fill')).toHaveLength(2);
  });

  it('a Fill clicked the moment the form shows waits for your Profile and the public job API', async () => {
    const tab = fakeTab();
    const bg = background();
    const controller = new PanelController(deps(tab.tab, bg.call));
    // The Fill button shows with phase "ready": click it then, before anything else answers.
    const filled = new Promise<void>((resolve) => {
      const stop = controller.store.subscribe(() => {
        if (controller.store.get().phase !== 'ready') return;
        stop();
        resolve(controller.fill());
      });
    });
    controller.start();
    await filled;
    await settle();
    expect(controller.store.get().posting?.description).toBe('From the public API.');
    expect(controller.store.get().drafts['why']).toMatchObject({ status: 'ready' });
  });

  it('carries the Fill on to a next step you moved to while it was still asking the AI', async () => {
    const tab = fakeTab();
    let nextClicked = false;
    const bg = background({
      'helper.mapFields': () => {
        // You click Next on the page before the AI answers.
        if (!nextClicked) tab.emit({ type: 'formChanged' });
        nextClicked = true;
        return { ok: true, value: { mappings: [] } };
      },
    });
    const { controller, state } = await started(tab, bg);
    await controller.fill();
    await settle();
    expect(tab.sent.filter((s) => s.type === 'fill')).toHaveLength(2);
    expect(state().fill).toBe('done');
  });

  describe('on a Posting’s description page', () => {
    const LEVER = 'https://jobs.lever.co/acme/a20b80c5-53c4-4c34-b8de-c6d9208994a6?lever-source=x';

    it('offers its Application Form’s address, and navigates there without clicking anything', async () => {
      const { controller, tab, state } = await started(fakeTab({ postingPage: LEVER }));
      expect(state()).toMatchObject({
        phase: 'noForm',
        formUrl: 'https://jobs.lever.co/acme/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply',
      });
      // The content script answered "no form" once: the panel didn't keep polling for one.
      expect(tab.sent).toEqual([]);

      await controller.openApplicationForm();
      await settle();
      expect(tab.sent).toEqual([
        { type: 'open', url: 'https://jobs.lever.co/acme/a20b80c5-53c4-4c34-b8de-c6d9208994a6/apply' },
      ]);
      // The form's page loaded: the panel found it, and Fill is ready.
      expect(state()).toMatchObject({ phase: 'ready', formUrl: null, detected: DETECTED });
    });

    it('offers nothing on a page that has no form and no rule for one', async () => {
      const { controller, tab, state } = await started(
        fakeTab({ postingPage: 'https://job-boards.greenhouse.io/acme' }),
      );
      // It polls for a form that may still render, then says there's none.
      await vi.waitFor(() => {
        expect(state()).toMatchObject({ phase: 'noForm', formUrl: null });
      });
      await controller.openApplicationForm();
      expect(tab.sent).toEqual([]);
    });

    it('offers nothing where the form is on the page', async () => {
      const { state } = await started();
      expect(state()).toMatchObject({ phase: 'ready', formUrl: null });
    });
  });
});
