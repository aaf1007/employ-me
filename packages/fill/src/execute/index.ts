import type { FieldDescriptor, FieldOutcome, FieldType } from '@employ-me/core';
import * as act from '../act';
import { plan as planForm, type FillPlan, type PlannedField } from '../plan';
import { descriptorOf, writeOutcome } from './outcome';
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
}

const CONDITIONAL_ROUNDS = 2;

/**
 * Carries out a plan: attaches the Resume first where the ATS parses it,
 * adds section entries, writes every field through act/ (each write read
 * back), then fills fields that appeared because of earlier answers. Never
 * presses Submit or Next and never ticks an Attestation (act/'s guard
 * refuses both). Writes are idempotent, so executing a re-plan is safe.
 */
export async function execute(plan: FillPlan): Promise<FillReport> {
  const { adapter, doc } = plan.context;
  const ctx: WriteContext = { adapter, resume: plan.context.options.resume?.file ?? null };
  const outcomes = new Map<string, FieldOutcome>();
  let current = plan;

  if (plan.resumeFirst) {
    for (const planned of plan.fields) {
      if (
        planned.step.kind === 'write' &&
        planned.step.write.kind === 'file' &&
        planned.fieldType === 'file.resume'
      ) {
        outcomes.set(planned.field.fieldId, await run(planned, ctx));
      }
    }
    const form = adapter.findForm(doc);
    if (form !== null) await adapter.waitForResumeParse(form);
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
  // goes away after its write (Greenhouse swaps the file input for a chip)
  // still gets its outcome.
  const seen = new Map<string, PlannedField>();
  const remember = (fields: readonly PlannedField[]) => {
    for (const f of fields) seen.set(f.field.fieldId, f);
  };
  for (const f of plan.fields) seen.set(f.field.fieldId, f);
  remember(current.fields);

  const written = new Set(outcomes.keys());
  await writeAll(current.fields, written, outcomes, ctx);
  for (let round = 0; round < CONDITIONAL_ROUNDS; round++) {
    await settle();
    const next = replan(current);
    const appeared = next.fields.filter((f) => !seen.has(f.field.fieldId));
    current = next;
    remember(next.fields.filter((f) => !written.has(f.field.fieldId)));
    if (appeared.length === 0) break;
    await writeAll(appeared, written, outcomes, ctx);
  }
  return report(current, [...seen.values()], outcomes);
}

async function writeAll(
  fields: readonly PlannedField[],
  written: Set<string>,
  outcomes: Map<string, FieldOutcome>,
  ctx: WriteContext,
): Promise<void> {
  for (const planned of fields) {
    if (planned.step.kind !== 'write' || written.has(planned.field.fieldId)) continue;
    written.add(planned.field.fieldId);
    outcomes.set(planned.field.fieldId, await run(planned, ctx));
  }
}

async function run(planned: PlannedField, ctx: WriteContext): Promise<FieldOutcome> {
  const { field, fieldType, step } = planned;
  if (step.kind !== 'write') throw new Error('run() needs a write step');
  const result = await performWrite(field, fieldType, step.write, ctx);
  return writeOutcome(planned, result);
}

function report(
  final: FillPlan,
  everyField: readonly PlannedField[],
  outcomes: ReadonlyMap<string, FieldOutcome>,
): FillReport {
  const reported: FieldOutcome[] = [];
  const awaiting: AwaitingField[] = [];
  const fields: FieldDescriptor[] = [];
  for (const planned of everyField) {
    const { field, fieldType, step } = planned;
    const fieldId = field.fieldId;
    const done = outcomes.get(fieldId);
    let outcome: FieldOutcome | null = done ?? null;
    if (outcome === null) {
      switch (step.kind) {
        case 'review':
          outcome = { kind: 'needsReview', fieldId, fieldType, reason: step.reason };
          break;
        case 'skip':
          outcome = { kind: 'couldNotFill', fieldId, fieldType, reason: step.reason, fix: step.fix };
          break;
        case 'awaitProvider':
          awaiting.push({ fieldId, fieldType, need: step.need });
          break;
        case 'write':
          // Planned after the last write pass (it appeared on the final re-plan).
          outcome = {
            kind: 'couldNotFill',
            fieldId,
            fieldType,
            reason: 'valueDidNotStick',
            fix: 'This field appeared late. Click Fill again, or fill it in yourself.',
          };
          break;
      }
    }
    if (outcome !== null) reported.push(outcome);
    fields.push(descriptorOf(planned));
  }
  return { outcomes: reported, awaitingProvider: awaiting, fields, plan: final };
}

function replan(previous: FillPlan): FillPlan {
  const { doc, profile, savedAnswers, options } = previous.context;
  return planForm(doc, profile, savedAnswers, options);
}

/** Lets the page's own scripts react (render new sections, conditional questions). */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}
