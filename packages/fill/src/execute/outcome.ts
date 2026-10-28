import type { FieldDescriptor, FieldOutcome, FieldType } from '@employ-me/core';
import type * as act from '../act';
import type { PlannedField } from '../plan';
import type { WriteResult } from './write';

// From what act/ reported to the field's FieldOutcome, with a fix the user can act on.

export function writeOutcome(planned: PlannedField, result: WriteResult): FieldOutcome {
  const { field, fieldType, step } = planned;
  const fieldId = field.fieldId;
  if (step.kind !== 'write') throw new Error('writeOutcome() needs a write step');
  switch (result.kind) {
    case 'done':
      return step.review === undefined
        ? { kind: 'filled', fieldId, fieldType, source: step.source }
        : { kind: 'needsReview', fieldId, fieldType, reason: step.review };
    case 'ambiguous':
      return { kind: 'needsReview', fieldId, fieldType, reason: 'ambiguousOption' };
    case 'failed':
      return failure(fieldId, fieldType, step.write.kind === 'file', result.error);
  }
}

function failure(fieldId: string, fieldType: FieldType, isFile: boolean, error: act.ActError): FieldOutcome {
  switch (error.reason) {
    case 'valueDidNotStick':
      return isFile
        ? {
            kind: 'couldNotFill',
            fieldId,
            fieldType,
            reason: 'fileRejected',
            fix: 'The form did not take the file. Attach your Resume yourself.',
          }
        : {
            kind: 'couldNotFill',
            fieldId,
            fieldType,
            reason: 'valueDidNotStick',
            fix: "The form didn't keep the value. Fill it in yourself.",
          };
    case 'optionNotFound':
      return {
        kind: 'couldNotFill',
        fieldId,
        fieldType,
        reason: 'noMatchingOption',
        fix: "None of the form's options matches your Profile. Choose one yourself.",
      };
    case 'sensitiveFieldType':
      return fieldType.startsWith('attestation.')
        ? {
            kind: 'couldNotFill',
            fieldId,
            fieldType,
            reason: 'attestation',
            fix: 'Attestations are left for you. Tick it yourself if you agree.',
          }
        : {
            kind: 'couldNotFill',
            fieldId,
            fieldType,
            reason: 'neverStored',
            fix: 'employ-me never fills this. Enter it yourself.',
          };
    case 'forbiddenControl':
    case 'wrongElementKind':
    case 'disconnected':
      return {
        kind: 'couldNotFill',
        fieldId,
        fieldType,
        reason: 'controlNotSupported',
        fix: "employ-me can't fill this control. Fill it in yourself.",
      };
  }
}

export function descriptorOf({ field }: PlannedField): FieldDescriptor {
  return {
    fieldId: field.fieldId,
    label: field.label,
    control: field.control,
    options: field.options,
    required: field.required,
    ...(field.section === undefined ? {} : { section: field.section }),
    ...(field.description === undefined ? {} : { description: field.description }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
}
