import type { FieldDescriptor, FieldOutcome } from '@employ-me/core';
import type { FillPlan, PlannedField } from '../plan';
import { fieldFingerprint } from '../read';
import type { AwaitingField, FillReport } from './index';
import { descriptorOf } from './outcome';

/** Identifies a planned write: the same key means the re-plan resolved the field the same way. */
export function writeKey(planned: PlannedField, resume: File | null): string {
  const { step } = planned;
  if (step.kind !== 'write') return '';
  // A different Resume is a different write, so switching Resumes and filling again attaches it.
  return step.write.kind === 'file' ? `file:${resume?.name ?? ''}` : JSON.stringify(step.write);
}

export interface ReportParts {
  readonly final: FillPlan;
  readonly everyField: readonly PlannedField[];
  /** Outcomes of the writes this execute made. */
  readonly outcomes: ReadonlyMap<string, FieldOutcome>;
  readonly writes: ReadonlyMap<string, string>;
  readonly userEdited: ReadonlySet<string>;
  readonly previous: FillReport | undefined;
  readonly resume: File | null;
}

export function buildReport(parts: ReportParts): FillReport {
  const { final, everyField, outcomes, writes, userEdited, previous, resume } = parts;
  const before = new Map(previous?.outcomes.map((o) => [o.fieldId, o]));
  const reported: FieldOutcome[] = [];
  const awaiting: AwaitingField[] = [];
  const fields: FieldDescriptor[] = [];
  const values = new Map<string, string>();
  const onPage = new Set(final.fields.map((f) => f.field.fieldId));
  const earlier = new Set(previous?.planned.map((p) => p.field.fieldId));

  for (const planned of everyField) {
    const fieldId = planned.field.fieldId;
    const kept = before.get(fieldId);
    // Appeared and went in this same execute, before anything was written to
    // it ("To" goes when Workday's "I currently work here" is ticked): no
    // longer a field of the form. An earlier step's fields stay.
    if (
      !outcomes.has(fieldId) &&
      !onPage.has(fieldId) &&
      kept === undefined &&
      !earlier.has(fieldId) &&
      !planned.field.element.isConnected
    ) {
      continue;
    }
    const sameWrite = writes.get(fieldId) === writeKey(planned, resume);
    let outcome: FieldOutcome | null;
    const written = outcomes.get(fieldId);
    if (written !== undefined) outcome = written;
    else if (!onPage.has(fieldId)) outcome = kept ?? stepOutcome(planned, awaiting);
    else if (userEdited.has(fieldId) && planned.step.kind === 'write' && !sameWrite)
      // The re-plan has an answer, but the user already wrote their own: theirs stays.
      outcome = { kind: 'needsReview', fieldId, fieldType: planned.fieldType, reason: 'keptYourEdit' };
    else if (kept !== undefined && (userEdited.has(fieldId) || sameWrite)) outcome = kept;
    else outcome = stepOutcome(planned, awaiting);
    if (outcome !== null) reported.push(outcome);
    fields.push(descriptorOf(planned));
    const value = onPage.has(fieldId) ? fieldFingerprint(planned.field) : previous?.values.get(fieldId);
    if (value !== undefined) values.set(fieldId, value);
  }
  return {
    outcomes: reported,
    awaitingProvider: awaiting,
    fields,
    plan: final,
    planned: everyField,
    values,
    writes,
    userEdited,
  };
}

/** The outcome of a field nothing was written to this time, from its step. Null while it awaits the Provider. */
function stepOutcome(planned: PlannedField, awaiting: AwaitingField[]): FieldOutcome | null {
  const { field, fieldType, step } = planned;
  const fieldId = field.fieldId;
  switch (step.kind) {
    case 'review':
      return { kind: 'needsReview', fieldId, fieldType, reason: step.reason };
    case 'skip':
      return { kind: 'couldNotFill', fieldId, fieldType, reason: step.reason, fix: step.fix };
    case 'awaitProvider':
      awaiting.push({ fieldId, fieldType, need: step.need });
      return null;
    case 'write':
      // Planned after the last write pass (it appeared on the final re-plan).
      return {
        kind: 'couldNotFill',
        fieldId,
        fieldType,
        reason: 'valueDidNotStick',
        fix: 'This field appeared late. Click Fill again, or fill it in yourself.',
      };
  }
}
