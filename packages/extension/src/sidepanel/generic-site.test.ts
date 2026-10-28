import { describe, expect, it, vi } from 'vitest';
import { PanelController } from './controller';
import { NO_ACCESS, reachSite, unreachableOrigins, type ProbedFrame } from './site-access';
import {
  COMPANY_SITE_DETECTED,
  COMPANY_SITE_URL,
  deps,
  fakeBackground,
  fakeTab,
  PROFILE,
  settle,
  type UnknownSite,
} from './test-fakes';

// The generic fallback (design.md "Job sites"): on a company's own site
// nothing runs in the page until you click Fill, and then the Fill lists
// what it couldn't fill like on any job site.

const application = {
  id: 'a1',
  posting: COMPANY_SITE_DETECTED.posting,
  appliedAt: '2026-10-28T12:00:00Z',
  source: 'didYouApply',
  status: 'applied',
  notes: '',
};

function background(applied: readonly unknown[] = []) {
  return fakeBackground({
    'profile.get': () => ({ ok: true, value: PROFILE }),
    'applications.findByPosting': () => ({ ok: true, value: applied }),
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
      value: { draft: { text: 'Because of the mission.', language: 'en', claims: [] } },
    }),
    'applications.recordSubmission': () => ({ ok: true, value: application }),
  });
}

async function onCompanySite(site: UnknownSite = { url: COMPANY_SITE_URL }, bg = background()) {
  const tab = fakeTab({ unknownSite: site });
  const controller = new PanelController(deps(tab.tab, bg.call));
  controller.start();
  // Detection polls a few times (1 ms apart in tests) before it calls the site unknown.
  await vi.waitFor(() => {
    expect(controller.store.get().phase).not.toBe('detecting');
  });
  await settle();
  return { controller, tab, bg, state: () => controller.store.get() };
}

describe('the side panel on a company site', () => {
  it('runs nothing in the page until you click Fill, and warns from the address if you applied there', async () => {
    const bg = background([{ ...application, hasSnapshot: true }]);
    const { tab, state } = await onCompanySite(undefined, bg);
    expect(state()).toMatchObject({
      phase: 'unknownSite',
      pageUrl: COMPANY_SITE_URL,
      applied: [{ id: 'a1' }],
    });
    expect(tab.sent).toEqual([]);
    // The Fill will key the Posting the same way: job page and apply step agree, tracking dropped.
    expect(bg.calls.find((c) => c.type === 'applications.findByPosting')?.payload).toEqual({
      key: { ats: 'generic', employer: 'careers.example.org', jobId: '/jobs/42' },
    });
  });

  it('runs the content script when you click Fill, then fills like any job site', async () => {
    const { controller, tab, state } = await onCompanySite();
    await controller.fillThisSite();
    expect(tab.sent.map((s) => s.type)).toEqual(['reach', 'fill', 'feedback']);
    expect(state()).toMatchObject({ phase: 'ready', fill: 'done', detected: { ats: 'generic' } });
  });

  it('says how to let it read the page when Chrome won’t', async () => {
    const { controller, tab, state } = await onCompanySite({ url: null, readable: false });
    expect(state()).toMatchObject({ phase: 'unknownSite', pageUrl: null });
    await controller.fillThisSite();
    expect(state()).toMatchObject({ phase: 'unknownSite', fill: 'idle', notice: NO_ACCESS });
    expect(tab.sent.map((s) => s.type)).toEqual(['reach']);
  });

  it('asks before reading a frame from another site, and fills there once you allow it', async () => {
    const forms = 'https://forms.example.net';
    const { controller, tab, state } = await onCompanySite({
      url: COMPANY_SITE_URL,
      unreachable: [forms],
      detected: null,
    });
    await controller.fillThisSite();
    expect(state()).toMatchObject({ phase: 'noForm', unreachable: [forms] });
    expect(tab.sent.map((s) => s.type)).toEqual(['reach']);

    await controller.allowFrames();
    expect(tab.sent.map((s) => s.type)).toEqual(['reach', 'allow', 'reach', 'fill', 'feedback']);
    expect(tab.sent[1]?.origins).toEqual([forms]);
    expect(state()).toMatchObject({ phase: 'ready', fill: 'done', unreachable: [] });
  });

  it('keeps the page’s own text as the Snapshot’s description, with no public API to give one', async () => {
    const { controller, tab, bg, state } = await onCompanySite();
    await controller.fillThisSite();
    tab.navigate(null);
    // The panel looks for the form on the new page a few times first.
    await vi.waitFor(() => {
      expect(state().submission.state).toBe('askDidYouApply');
    });
    // The next page was read again: the Fill you started carries on there.
    expect(tab.sent.filter((s) => s.type === 'reach')).toHaveLength(2);

    await controller.answerDidYouApply(true);
    expect(bg.calls.find((c) => c.type === 'applications.recordSubmission')?.payload).toMatchObject({
      source: 'didYouApply',
      posting: { key: COMPANY_SITE_DETECTED.posting?.key },
      snapshot: { postingDescription: COMPANY_SITE_DETECTED.pageText },
    });
  });
});

describe('reaching a company site', () => {
  const frame = (frameId: number, url: string, frameOrigins: string[] = []): ProbedFrame => ({
    frameId,
    url,
    frameOrigins,
  });

  it('runs the content script once per frame, never on a known ATS host or where it already runs', async () => {
    const injected: number[][] = [];
    const reach = await reachSite({
      probe: () =>
        Promise.resolve([
          frame(0, 'https://careers.example.org/jobs/42', ['https://job-boards.greenhouse.io']),
          frame(3, 'https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1'),
          frame(4, 'https://careers.example.org/widget'),
          frame(5, 'about:blank'),
        ]),
      answers: (frameId) => Promise.resolve(frameId === 4),
      inject: (frameIds) => {
        injected.push([...frameIds]);
        return Promise.resolve(true);
      },
    });
    expect(injected).toEqual([[0]]);
    expect(reach).toEqual({ ok: true, value: { frameIds: [0, 3, 4], unreachable: [] } });
  });

  it('fails with the fix when Chrome won’t let it read the page', async () => {
    const reach = await reachSite({
      probe: () => Promise.resolve(null),
      answers: () => Promise.resolve(false),
      inject: () => Promise.resolve(true),
    });
    expect(reach).toEqual({ ok: false, error: NO_ACCESS });
  });

  it('lists the https sites of frames no probe answered from', () => {
    expect(
      unreachableOrigins([
        frame(0, 'https://careers.example.org/jobs/42', [
          'https://forms.example.net',
          'https://careers.example.org',
          'http://legacy.example.com',
        ]),
        frame(2, 'https://careers.example.org/frame', ['https://apply.example.com']),
      ]),
    ).toEqual(['https://apply.example.com', 'https://forms.example.net']);
  });
});
