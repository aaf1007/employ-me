import type {
  CountryCode,
  CouldNotFillReason,
  EmployerKey,
  FillSource,
  Profile,
  ReviewReason,
  SavedAnswer,
} from '@employ-me/core';
import type { CountryChoice } from '../classify';
import type { OptionTarget } from '../match';
import type { ExtractedField } from '../types';

/** The Profile as the fill engine reads it. Saved Answers are passed on their own. */
export type ProfileView = Omit<Profile, 'schemaVersion' | 'savedAnswers'>;

/** An answer before it meets a form: what the Profile says, not how this form words it. */
export type Canonical =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'yesNo'; readonly yes: boolean }
  | {
      readonly kind: 'option';
      readonly target: OptionTarget;
      /** The canonical vocab value it stands for ("decline"), to find it in the Provider's option map. */
      readonly vocabValue?: string;
    }
  | { readonly kind: 'options'; readonly targets: readonly OptionTarget[] }
  | { readonly kind: 'date'; readonly iso: string }
  | { readonly kind: 'file' };

/** A country's own answer, shown side by side when the Posting's country is unclear. */
export interface CountryAnswer {
  readonly country: CountryCode;
  readonly text: string;
}

export type Answer =
  | {
      readonly kind: 'answer';
      readonly value: Canonical;
      readonly source: FillSource;
      /** Write it, but flag it (e.g. the Provider matched the field). */
      readonly review?: ReviewReason;
    }
  | {
      readonly kind: 'review';
      readonly reason: ReviewReason;
      /** Suggested text, e.g. a similar Saved Answer. Never written until accepted. */
      readonly suggestion?: string;
      readonly byCountry?: readonly CountryAnswer[];
    }
  | { readonly kind: 'skip'; readonly reason: CouldNotFillReason; readonly fix: string }
  | { readonly kind: 'provider'; readonly need: 'mapping' | 'draft' };

export interface AnswerContext {
  readonly profile: ProfileView;
  readonly savedAnswers: readonly SavedAnswer[];
  /** The Posting's employer, for Saved Answer overrides and "worked here before". */
  readonly employer: EmployerKey | null;
  readonly hasResume: boolean;
}

export const skip = (reason: CouldNotFillReason, fix: string): Answer => ({ kind: 'skip', reason, fix });
export const text = (value: string): Answer => ({
  kind: 'answer',
  value: { kind: 'text', text: value },
  source: 'rules',
});
export const yesNo = (yes: boolean, source: FillSource = 'rules'): Answer => ({
  kind: 'answer',
  value: { kind: 'yesNo', yes },
  source,
});
export const option = (target: OptionTarget, source: FillSource = 'rules'): Answer => ({
  kind: 'answer',
  value: { kind: 'option', target },
  source,
});

export const missing = (what: string): Answer =>
  skip('notInProfile', `Add ${what} to your Profile, then click Fill again. Or fill it in yourself.`);

export function isChoice(field: ExtractedField): boolean {
  return field.widget !== 'text' && field.widget !== 'textarea' && field.widget !== 'file';
}

export type { CountryChoice };

/** Narrows a field type to one of a listed few, so a switch over them can be exhaustive. */
export function isOneOf<T extends string>(value: string, list: readonly T[]): value is T {
  return list.some((item) => item === value);
}
