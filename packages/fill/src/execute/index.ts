import type { FieldDescriptor, FieldOutcome, FieldType } from '@employ-me/core';
import * as act from '../act';
import { plan as planForm, type FillPlan, type PlannedField } from '../plan';
import { fieldFingerprint } from '../read';
import { writeOutcome } from './outcome';
import { buildReport, writeKey } from './report';
import { performWrite, type WriteContext } from './write';

/** A field the Fill can't finish until integration asks the Provider and plans again. */
export interface AwaitingField {
  readonly fieldId: string;
  readonly fieldType: FieldType;
  readonly need: 'mapping' | 'draft';
}

export interface FillReport {
  /** One outcome per field, in form order: filled, needs review, or couldn't fill with a fix. */
  readonly outcomes: readonly FieldOutcome[];
  /** Fields waiting on the Provider. Empty once the plan was made with the Provider's answers or with it unavailable. */
  readonly awaitingProvider: readonly AwaitingField[];
  /** Labels and options of every reported field, for the side panel. DOM-free. */
  readonly fields: readonly FieldDescriptor[];
  /** The plan as it stood at the end (after "Add another" and fields that appeared while filling). */
  readonly plan: FillPlan;
  /** Every field this Fill has seen, including ones that have since left the page (an earlier step). */
  readonly planned: readonly PlannedField[];
  /** What each field showed when this execute finished (`fieldFingerprint`), to spot the user's edits later. */
  readonly values: ReadonlyMap<string, string>;
  /** The write each field was given (`writeKey`), so a re-plan writes only what it newly resolved. */
  readonly writes: ReadonlyMap<string, string>;
  /** Fields the user changed on the page after a Fill. No later execute writes them. */
  readonly userEdited: ReadonlySet<string>;
}

const CONDITIONAL_ROUNDS = 2;

/**
 * Carries out a plan: attaches the Resume first where the ATS parses it,
 * adds section entries, writes every field through act/ (each write read
 * back), then fills fields that appeared because of earlier answers. Never
 * presses Submit or Next and never ticks an Attestation (act/'s guard
 * refuses both).
 *
 * Pass the last report as `previous` when executing a re-plan (Provider
 * answers, an accepted Draft, the form's next step): only fields the new plan
 * newly resolved, or resolved differently, are written, and a field the user
 * changed on the page since the last execute is never written again.
 */
export async function execute(plan: FillPlan, previous?: FillReport): Promise<FillReport> {
  const { adapter, doc } = plan.context;
  const resume = plan.context.options.resume?.file ?? null;
  const ctx: WriteContext = { adapter, resume };
  const outcomes = new Map<string, FieldOutcome>();
  const writes = new Map(previous?.writes);
  const userEdited = new Set(previous?.userEdited);
  let current = plan;

  const noteEdits = (fields: readonly PlannedField[]) => {
    if (previous === undefined) return;
    for (const { field } of fields) {
      const before = previous.values.get(field.fieldId);
      if (before !== undefined && fieldFingerprint(field) !== before) userEdited.add(field.fieldId);
    }
  };
  const due = (planned: PlannedField): boolean => {
    const id = planned.field.fieldId;
    if (planned.step.kind !== 'write' || userEdited.has(id) || outcomes.has(id)) return false;
    return writes.get(id) !== writeKey(planned, resume);
  };
  const write = async (planned: PlannedField) => {
    writes.set(planned.field.fieldId, writeKey(planned, resume));
    outcomes.set(planned.field.fieldId, await run(planned, ctx));
  };
  noteEdits(plan.fields);

  if (plan.resumeFirst) {
    const files = plan.fields.filter(
      (p) =>
        p.fieldType === 'file.resume' && p.step.kind === 'write' && p.step.write.kind === 'file' && due(p),
    );
    for (const planned of files) await write(planned);
    const form = adapter.findForm(doc);
    if (files.length > 0 && form !== null) await adapter.waitForResumeParse(form);
  }

  if (plan.repeats.length > 0) {
    for (const repeat of plan.repeats) {
      for (let entries = repeat.have; entries < repeat.want; entries++) {
        if (!(await act.pressAddAnother(repeat.button)).ok) break;
        await settle();
      }
    }
    current = replan(current);
  }

  // Every field seen in any plan, in order of first appearance: a field that
  // goes away after its write (Greenhouse swaps the file input for a chip),
  // or with an earlier step of the form, still gets its outcome.
  const seen = new Map<string, PlannedField>();
  for (const f of previous?.planned ?? []) seen.set(f.field.fieldId, f);
  const remember = (fields: readonly PlannedField[]) => {
    for (const f of fields) if (!outcomes.has(f.field.fieldId)) seen.set(f.field.fieldId, f);
  };
  for (const f of plan.fields) seen.set(f.field.fieldId, f);
  remember(current.fields);

  for (const planned of current.fields) if (due(planned)) await write(planned);
  for (let round = 0; round < CONDITIONAL_ROUNDS; round++) {
    await settle();
    const next = replan(current);
    const appeared = next.fields.filter((f) => !seen.has(f.field.fieldId));
    current = next;
    remember(next.fields);
    if (appeared.length === 0) break;
    noteEdits(appeared);
    for (const planned of appeared) if (due(planned)) await write(planned);
  }
  // You may have changed a field while this ran (its settle waits are long enough to type in).
  // The report keeps what the page shows now, so see the edit before it's taken as the Fill's own.
  noteEdits(current.fields.filter((f) => !outcomes.has(f.field.fieldId)));
  return buildReport({
    final: current,
    everyField: [...seen.values()],
    outcomes,
    writes,
    userEdited,
    previous,
    resume,
  });
}

async function run(planned: PlannedField, ctx: WriteContext): Promise<FieldOutcome> {
  const { field, fieldType, step } = planned;
  if (step.kind !== 'write') throw new Error('run() needs a write step');
  const result = await performWrite(field, fieldType, step.write, ctx);
  return writeOutcome(planned, result);
}

function replan(previous: FillPlan): FillPlan {
  const { doc, profile, savedAnswers, options } = previous.context;
  return planForm(doc, profile, savedAnswers, options);
}

/** Lets the page's own scripts react (render new sections, conditional questions). */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}
