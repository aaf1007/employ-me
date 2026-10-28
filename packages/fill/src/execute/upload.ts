import type { FieldOutcome } from '@employ-me/core';
import type { AtsAdapter, ShownFile } from '../adapters';
import type { PlannedField } from '../plan';
import { FILE_REJECTED_FIX, writeOutcome } from './outcome';

// The input taking the Resume isn't the upload: the form uploads it on its
// own afterwards, and can refuse it. "Filled" waits for the form to show the
// file uploaded, under the name of the Resume you chose (research 2026-10-28
// §7.1: wrong and half-uploaded Resumes are Jobright's most repeated bug).

/** How long after the attach a Fill waits for the upload. The rest of the Fill runs meanwhile. */
const UPLOAD_WAIT_MS = 5_000;
const POLL_MS = 200;

export interface UploadCheck {
  readonly adapter: AtsAdapter;
  readonly resume: File | null;
  readonly planned: readonly PlannedField[];
  /** When this execute attached each file (Date.now()). */
  readonly attachedAt: ReadonlyMap<string, number>;
}

/**
 * Checks each Resume this execute attached, and each one an earlier execute
 * left still uploading, against what the form shows now.
 */
export async function confirmUploads(
  outcomes: readonly FieldOutcome[],
  check: UploadCheck,
): Promise<FieldOutcome[]> {
  const byId = new Map(check.planned.map((p) => [p.field.fieldId, p]));
  const confirmed: FieldOutcome[] = [];
  for (const outcome of outcomes) {
    const planned = byId.get(outcome.fieldId);
    const attachedAt = check.attachedAt.get(outcome.fieldId);
    const due =
      (outcome.kind === 'filled' && attachedAt !== undefined) ||
      (outcome.kind === 'needsReview' && outcome.reason === 'fileUploading');
    if (planned?.step.kind !== 'write' || !due || check.resume === null) {
      confirmed.push(outcome);
      continue;
    }
    const shown = await settled(planned, check.adapter, attachedAt ?? Date.now());
    confirmed.push(fromShown(planned, shown, check.resume));
  }
  return confirmed;
}

async function settled(planned: PlannedField, adapter: AtsAdapter, attachedAt: number): Promise<ShownFile> {
  const deadline = attachedAt + UPLOAD_WAIT_MS;
  for (;;) {
    const shown = adapter.shownFile(planned.field);
    if (shown.kind !== 'uploading' || Date.now() >= deadline) return shown;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function fromShown(planned: PlannedField, shown: ShownFile, resume: File): FieldOutcome {
  const { fieldId } = planned.field;
  const { fieldType } = planned;
  switch (shown.kind) {
    case 'uploading':
      return { kind: 'needsReview', fieldId, fieldType, reason: 'fileUploading' };
    case 'failed':
      return { kind: 'couldNotFill', fieldId, fieldType, reason: 'fileRejected', fix: FILE_REJECTED_FIX };
    case 'named':
      if (shown.text.trim() !== '' && !shown.text.includes(resume.name)) {
        return { kind: 'needsReview', fieldId, fieldType, reason: 'otherFileShown' };
      }
      return writeOutcome(planned, { kind: 'done' });
    case 'unknown':
      return writeOutcome(planned, { kind: 'done' });
  }
}
