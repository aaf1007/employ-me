import { FIELD_TYPE_IDS, sensitivityOf } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { createHelperClient, createInMemoryHelper } from '../helper';
import {
  BACKGROUND_ADDRESS,
  BACKGROUND_API,
  BACKGROUND_MESSAGE_TYPES,
  responseSchemaFor,
  type BackgroundMessageType,
} from '../messaging/background';
import { createTestStore, posting, textFile, value } from '../storage/test-store';
import { createRouter } from './router';
import { senderKind, type SenderKind } from './sender';

async function setup() {
  const test = await createTestStore();
  const helper = createInMemoryHelper();
  const router = createRouter({
    store: () => Promise.resolve(test.store),
    helper: createHelperClient(helper),
  });
  /** Sends a message as it would arrive: JSON in, JSON out, parsed with the client's schema. */
  const send = async <T extends BackgroundMessageType>(
    type: T,
    payload: unknown,
    from: SenderKind = 'extensionPage',
  ) => {
    const raw = await router.handle(
      JSON.parse(JSON.stringify({ to: BACKGROUND_ADDRESS, type, payload })),
      from,
    );
    return responseSchemaFor(type).parse(JSON.parse(JSON.stringify(raw)));
  };
  return { ...test, helper, router, send };
}

const snapshot = { capturedAt: '2026-10-27T12:00:00Z', postingDescription: 'JD', answers: [], resume: null };

describe('background router', () => {
  it('records a confirmed submission and finds it again by Posting', async () => {
    const { send } = await setup();
    const recorded = await send(
      'applications.recordSubmission',
      { source: 'confirmation', posting: posting('1'), snapshot },
      'contentScript',
    );
    expect(recorded).toMatchObject({ ok: true, value: { status: 'applied', snapshot } });
    const found = await send('applications.findByPosting', { key: posting('1').key }, 'contentScript');
    expect(found.ok && found.value.map((a) => a.hasSnapshot)).toEqual([true]);
  });

  it('hands out the Profile and a Resume file as base64', async () => {
    const { send, store } = await setup();
    value(await store.addResume({ label: 'Main', fileName: 'sam.txt', file: textFile('Sam Lee') }));
    expect(await send('profile.get', {}, 'contentScript')).toMatchObject({
      ok: true,
      value: { schemaVersion: 1 },
    });
    const file = await send('resumes.getFile', {}, 'contentScript');
    expect(file.ok && atob(file.value.dataBase64)).toBe('Sam Lee');
  });

  it('keeps an accepted Draft, and refuses one from a Self-ID, Attestation or never-stored field', async () => {
    const { send, store } = await setup();
    const draft = {
      question: 'Why us?',
      answer: 'Because.',
      fieldType: 'freeText.question',
      employer: 'acme',
    };
    expect(await send('savedAnswers.saveAcceptedDraft', draft, 'contentScript')).toMatchObject({
      ok: true,
      value: { source: 'draft', fieldType: 'freeText.question' },
    });
    for (const fieldType of FIELD_TYPE_IDS.filter((t) => sensitivityOf(t) !== 'ordinary')) {
      const refused = await send('savedAnswers.saveAcceptedDraft', {
        ...draft,
        question: fieldType,
        fieldType,
      });
      expect(refused, fieldType).toMatchObject({ ok: false, error: { reason: 'invalidMessage' } });
    }
    expect(value(await store.listSavedAnswers())).toHaveLength(1);
  });

  it('runs the helper with the Provider and model from Settings', async () => {
    const { send, store, helper } = await setup();
    value(await store.saveSettings({ provider: 'codex', models: { codex: 'gpt-5-codex' } }));
    value(await store.addResume({ label: 'Main', fileName: 'sam.txt', file: textFile('Sam Lee') }));
    const parsed = await send('helper.parseResume', {});
    expect(parsed.ok && parsed.value.extract.identity?.legalName?.first).toBe('Sam');
    expect(helper.requests.at(-1)).toMatchObject({
      type: 'parseResume',
      provider: 'codex',
      model: 'gpt-5-codex',
      input: { fileName: 'sam.txt', mimeType: 'text/plain', dataBase64: btoa('Sam Lee') },
    });
  });

  it("passes the helper's reason and fix through when it isn't installed", async () => {
    const { send, helper } = await setup();
    helper.configure({ installed: false });
    expect(await send('helper.health', {})).toMatchObject({
      ok: false,
      error: {
        reason: 'helperNotInstalled',
        fix: 'Run `npx employ-me setup` in a terminal, then click Retry.',
      },
    });
  });

  it("says so when there's no Resume to parse", async () => {
    const { send } = await setup();
    expect(await send('helper.parseResume', {})).toMatchObject({ ok: false, error: { reason: 'notFound' } });
  });

  it('lets only extension pages reach the helper: a job site must not spend your plan', async () => {
    const { send, helper } = await setup();
    const helperMessages = BACKGROUND_MESSAGE_TYPES.filter(
      (type) => BACKGROUND_API[type].audience === 'extensionPages',
    );
    expect(helperMessages).toEqual([
      'helper.health',
      'helper.parseResume',
      'helper.mapFields',
      'helper.draftAnswer',
    ]);
    for (const type of helperMessages) {
      expect(await send(type, {}, 'contentScript'), type).toMatchObject({
        ok: false,
        error: { reason: 'forbidden' },
      });
    }
    expect(helper.requests).toEqual([]);
  });

  it('refuses everything from senders that are neither', async () => {
    const { send } = await setup();
    expect(await send('profile.get', {}, 'other')).toMatchObject({
      ok: false,
      error: { reason: 'forbidden' },
    });
  });

  it('refuses unknown messages and payloads with extra keys', async () => {
    const { router, send } = await setup();
    expect(
      await router.handle({ to: BACKGROUND_ADDRESS, type: 'profile.delete', payload: {} }, 'extensionPage'),
    ).toMatchObject({
      ok: false,
      error: { reason: 'invalidMessage' },
    });
    expect(await router.handle('hello', 'extensionPage')).toMatchObject({ ok: false });
    expect(await send('profile.get', { everything: true })).toMatchObject({
      ok: false,
      error: { reason: 'invalidMessage' },
    });
  });

  it('reports a database that will not open as storageFailed', async () => {
    const helper = createHelperClient(createInMemoryHelper());
    const router = createRouter({ store: () => Promise.reject(new Error('blocked')), helper });
    expect(
      await router.handle({ to: BACKGROUND_ADDRESS, type: 'profile.get', payload: {} }, 'extensionPage'),
    ).toMatchObject({ ok: false, error: { reason: 'storageFailed' } });
  });
});

describe('senderKind', () => {
  const id = 'ippegianaaknpaknfbjblanhbehckehh';
  it('tells extension pages, content scripts and strangers apart', () => {
    expect(senderKind({ id, url: `chrome-extension://${id}/dashboard.html`, tab: {} }, id)).toBe(
      'extensionPage',
    );
    expect(senderKind({ id, url: 'https://job-boards.greenhouse.io/acme/jobs/1', tab: {} }, id)).toBe(
      'contentScript',
    );
    expect(senderKind({ id: 'someoneelse', url: `chrome-extension://${id}/x.html` }, id)).toBe('other');
    expect(senderKind({ id, url: `chrome-extension://${id}.evil.example/` }, id)).toBe('other');
  });
});
