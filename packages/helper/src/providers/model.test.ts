import { describe, expect, it } from 'vitest';
import { UNSAFE_MODEL_NAMES } from '../../test/unsafe-models';
import { resolveModel } from './model';

describe('resolveModel', () => {
  it('prefers the request, then config.json, then the Provider default', () => {
    expect(resolveModel('claude', 'opus', 'haiku')).toEqual({ ok: true, value: 'opus' });
    expect(resolveModel('claude', undefined, 'haiku')).toEqual({ ok: true, value: 'haiku' });
    expect(resolveModel('claude', undefined, undefined)).toEqual({ ok: true, value: null });
  });

  it.each(['sonnet', 'claude-sonnet-4-5', 'sonnet[1m]', 'gpt-5.6-sol', 'o3:high'])('accepts %s', (name) => {
    expect(resolveModel('codex', name, undefined)).toEqual({ ok: true, value: name });
  });

  it.each(UNSAFE_MODEL_NAMES)('refuses the requested model %j, even with a good config.json one', (name) => {
    expect(resolveModel('claude', name, 'haiku')).toMatchObject({
      ok: false,
      error: { reason: 'invalidRequest' },
    });
  });

  it.each(UNSAFE_MODEL_NAMES)('refuses the config.json model %j and says where to fix it', (name) => {
    const result = resolveModel('codex', undefined, name);
    expect(result).toMatchObject({ ok: false, error: { reason: 'providerFailed' } });
    expect(!result.ok && result.error.fix).toMatch(/"codex" under "models" in employ-me's config\.json/);
  });

  it("doesn't look at config.json when the request names a valid model", () => {
    expect(resolveModel('claude', 'opus', '--bad')).toEqual({ ok: true, value: 'opus' });
  });

  it('never repeats a refused name in the error', () => {
    const name = '--dangerously-skip-permissions';
    expect(JSON.stringify(resolveModel('claude', name, undefined))).not.toContain(name);
    expect(JSON.stringify(resolveModel('claude', undefined, name))).not.toContain(name);
  });
});
