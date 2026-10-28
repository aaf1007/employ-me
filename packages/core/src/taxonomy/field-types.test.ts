import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, FIELD_TYPE_IDS, mayGoToProvider, sensitivityOf } from './field-types';
import { VOCAB } from './vocab';

describe('field-type taxonomy', () => {
  it('marks sensitivity by group, so a new type cannot silently become ordinary', () => {
    for (const id of FIELD_TYPE_IDS) {
      const expected = id.startsWith('selfId.')
        ? 'selfId'
        : id.startsWith('attestation.')
          ? 'attestation'
          : id.startsWith('never.')
            ? 'neverStored'
            : 'ordinary';
      expect(sensitivityOf(id), id).toBe(expected);
    }
  });

  it('never lets Self-ID or Attestation types go to a Provider', () => {
    expect(mayGoToProvider('selfId.us.race')).toBe(false);
    expect(mayGoToProvider('attestation.certify')).toBe(false);
    expect(mayGoToProvider('never.password')).toBe(false);
    expect(mayGoToProvider('name.first')).toBe(true);
  });

  it('gives every Self-ID vocabulary a "decline" option', () => {
    for (const spec of Object.values(FIELD_TYPES)) {
      if (spec.sensitivity === 'selfId' && spec.vocab !== undefined) {
        expect(VOCAB[spec.vocab]).toContain('decline');
      }
    }
  });
});
