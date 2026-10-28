import { HELPER_HOST_NAME, helperResponseSchema } from '@employ-me/core';
import type { Worker } from '@playwright/test';
import { expect, test } from './harness';

// The extension and the real helper over Chrome Native Messaging, with the
// fake Provider: the test-host hook in CLAUDE.md "End-to-end tests".

interface ChromeRuntime {
  runtime: { sendNativeMessage(host: string, message: unknown): Promise<unknown> };
}

async function ask(worker: Worker, message: object) {
  const answer = await worker.evaluate(
    async ([host, request]) => {
      const { chrome } = globalThis as unknown as { chrome: ChromeRuntime };
      return chrome.runtime.sendNativeMessage(host, request);
    },
    [HELPER_HOST_NAME, message] as const,
  );
  return helperResponseSchema.parse(answer);
}

const mapFields = {
  v: 1,
  id: 'e2e-map',
  type: 'mapFields',
  provider: 'claude',
  input: {
    ats: 'greenhouse',
    fields: [{ fieldId: 'q1', label: 'Why us?', control: 'textarea', options: [], required: true }],
    savedQuestions: [],
  },
};

test.describe('with the fake helper', () => {
  test.use({ helper: 'fake' });

  test('answers health over Native Messaging', async ({ extension }) => {
    const health = await ask(extension.serviceWorker, { v: 1, id: 'e2e-health', type: 'health' });
    expect(health).toMatchObject({
      ok: true,
      type: 'health',
      result: { fakeProvider: true, protocolVersion: 1 },
    });
  });

  test('maps fields through the fake Provider', async ({ extension }) => {
    expect(await ask(extension.serviceWorker, mapFields)).toMatchObject({
      ok: true,
      result: { mappings: [{ fieldId: 'q1', match: { kind: 'needsDraft' } }] },
    });
  });
});

test.describe('with a helper whose Provider is rate limited', () => {
  test.use({ helper: 'fail:providerRateLimited' });

  test('returns the reason and a fix', async ({ extension }) => {
    const response = await ask(extension.serviceWorker, mapFields);
    expect(response).toMatchObject({ ok: false, error: { reason: 'providerRateLimited' } });
    expect(!response.ok && response.error.fix).toMatch(/usage limit/);
  });
});
