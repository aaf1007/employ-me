import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDER_IDS, toProviderField, type MapFieldsInput } from '@employ-me/core/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { findCli } from '../install/find-cli';
import { silentLogger } from '../log/logger';
import { asHelperPlatform } from '../log/paths';
import { selectProvider } from '../providers/select';
import type { HelperProvider } from '../providers/task';

// One tiny real call to each CLI: the user's own claude and codex, logged
// in, through the same Provider code the host uses. Spends a trivial amount
// of the plan. Run with `pnpm smoke:providers`.

const platform = asHelperPlatform(process.platform) ?? 'linux';
const workDir = mkdtempSync(join(tmpdir(), 'employ-me-smoke-'));
const providers: HelperProvider[] = [];
afterAll(async () => {
  await Promise.all(providers.map((provider) => provider.close()));
});

function oneField(): MapFieldsInput {
  const field = toProviderField(
    { fieldId: 'email', label: 'Email address', control: 'email', options: [], required: true },
    'unknown',
  );
  if (!field.ok) throw new Error('fixture should be provider-safe');
  return { ats: 'greenhouse', fields: [field.value], savedQuestions: [] };
}

describe.each(PROVIDER_IDS)('%s, for real', (id) => {
  const cliPath = findCli(id, { platform, home: homedir(), env: process.env });
  const provider = () => {
    expect(
      cliPath,
      `No ${id} CLI found on PATH. Install it and log in, or skip this Provider.`,
    ).not.toBeNull();
    const created = selectProvider(id, { [id]: cliPath ?? '' }, process.env, {
      platform,
      workDir,
      logger: silentLogger,
    });
    if (created === null) throw new Error('selectProvider should build a real Provider');
    providers.push(created);
    return created;
  };

  it('is installed and logged in', async () => {
    const status = await provider().status();
    process.stderr.write(`${id}: ${JSON.stringify({ ...status, path: cliPath })}\n`);
    expect(status.problem).toBeUndefined();
    expect(status.state).toBe('ready');
  });

  it('maps one field with structured output', async () => {
    const started = performance.now();
    const result = await provider().mapFields(oneField(), new AbortController().signal);
    process.stderr.write(`${id}: mapFields took ${Math.round(performance.now() - started)} ms\n`);
    expect(result).toMatchObject({
      ok: true,
      value: { mappings: [{ fieldId: 'email', match: { kind: 'fieldType', fieldType: 'contact.email' } }] },
    });
  });
});
