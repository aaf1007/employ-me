import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  FIELD_TYPES,
  FIELD_TYPE_IDS,
  ORDINARY_FIELD_TYPES,
  mayGoToProvider,
  ordinaryFieldTypeSchema,
  sensitivityOf,
  type FieldTypeWith,
  type OrdinaryFieldType,
} from './field-types';
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

  it('derives OrdinaryFieldType from the table, at the type level and at runtime', () => {
    expectTypeOf<'name.first'>().toExtend<OrdinaryFieldType>();
    expectTypeOf<'freeText.question'>().toExtend<OrdinaryFieldType>();
    expectTypeOf<'selfId.us.race'>().not.toExtend<OrdinaryFieldType>();
    expectTypeOf<'selfId.other'>().not.toExtend<OrdinaryFieldType>();
    expectTypeOf<'attestation.certify'>().not.toExtend<OrdinaryFieldType>();
    expectTypeOf<'never.password'>().not.toExtend<OrdinaryFieldType>();
    expectTypeOf<'selfId.other'>().toExtend<FieldTypeWith<'selfId'>>();

    expect(ORDINARY_FIELD_TYPES).toEqual(FIELD_TYPE_IDS.filter((id) => sensitivityOf(id) === 'ordinary'));
    for (const id of FIELD_TYPE_IDS) {
      expect(ordinaryFieldTypeSchema.safeParse(id).success, id).toBe(sensitivityOf(id) === 'ordinary');
    }
  });

  it('gives every Self-ID vocabulary a "decline" option', () => {
    for (const spec of Object.values(FIELD_TYPES)) {
      if (spec.sensitivity === 'selfId' && spec.vocab !== undefined) {
        expect(VOCAB[spec.vocab]).toContain('decline');
      }
    }
  });
});
