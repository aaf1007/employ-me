import type { SubmittedAnswer } from '@employ-me/core';
import { keptInSnapshot, readFieldValue, type PlannedField } from '@employ-me/fill';

/**
 * The answers a Snapshot keeps, across every step of the form: what each
 * field shows now, or the last thing it showed before it left the page.
 */
export class AnswerLog {
  private readonly byField = new Map<string, SubmittedAnswer>();

  read(planned: readonly PlannedField[]): SubmittedAnswer[] {
    for (const { field, fieldType } of planned) {
      if (!keptInSnapshot(field, fieldType)) continue;
      const value = readFieldValue(field);
      // Gone from the page (an earlier step): keep what it last showed.
      if (value === null) continue;
      if (value === '' || (Array.isArray(value) && value.length === 0)) {
        this.byField.delete(field.fieldId);
        continue;
      }
      this.byField.set(field.fieldId, {
        label: field.label === '' ? field.fieldId : field.label,
        fieldType,
        value,
      });
    }
    return planned.flatMap(({ field }) => this.byField.get(field.fieldId) ?? []);
  }
}
