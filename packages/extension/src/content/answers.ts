import type { SubmittedAnswer } from '@employ-me/core';
import {
  fieldFingerprint,
  keptInSnapshot,
  readFieldValue,
  type FillReport,
  type PlannedField,
} from '@employ-me/fill';

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

/**
 * The fields you changed on the page since the Fill wrote them, across every
 * step of the form. The report only learns of an edit when the Fill plans
 * again; this compares what each field shows now with what it showed when
 * the Fill finished.
 */
export class EditLog {
  private readonly edited = new Set<string>();

  read(report: FillReport): string[] {
    for (const id of report.userEdited) this.edited.add(id);
    for (const { field } of report.planned) {
      const before = report.values.get(field.fieldId);
      // Gone from the page (an earlier step): keep what was seen then.
      if (before === undefined || !field.element.isConnected) continue;
      if (fieldFingerprint(field) !== before) this.edited.add(field.fieldId);
    }
    return [...this.edited];
  }
}
