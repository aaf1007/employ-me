import type { FieldView } from '../messaging/content';

export interface Tally {
  readonly filled: number;
  readonly total: number;
}

export interface FillProgress extends Tally {
  /** Whole percent filled: 100 only once every field is, 0 only while none is. */
  readonly percent: number;
  /** The fields the form marks required; null when it marks none. */
  readonly required: Tally | null;
}

/**
 * How far the Fill got, over every field it lists across the form's steps
 * (design.md "What you see"). Only a `filled` outcome counts: Needs your
 * review, Couldn't fill (Attestations too, which you tick yourself) and
 * fields still waiting for the AI don't.
 */
export function fillProgress(fields: readonly Pick<FieldView, 'outcome' | 'required'>[]): FillProgress {
  const all = tally(fields);
  const required = tally(fields.filter((f) => f.required));
  return { ...all, percent: percentOf(all), required: required.total === 0 ? null : required };
}

function tally(fields: readonly Pick<FieldView, 'outcome'>[]): Tally {
  return { filled: fields.filter((f) => f.outcome?.kind === 'filled').length, total: fields.length };
}

function percentOf({ filled, total }: Tally): number {
  if (total === 0) return 0;
  if (filled === total) return 100;
  const rounded = Math.round((filled / total) * 100);
  return Math.min(99, Math.max(filled === 0 ? 0 : 1, rounded));
}
