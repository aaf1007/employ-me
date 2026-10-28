import {
  isOrdinaryFieldType,
  sensitivityOf,
  type FieldMatch,
  type FieldType,
  type SavedAnswer,
} from '@employ-me/core';
import type { CountryClassification } from '../classify';
import { textTarget } from '../match';
import type { ExtractedField } from '../types';
import { countryAnswer } from './country';
import { factAnswer } from './facts';
import { countryOf, describeValue, withProviderOptions } from './values';
import { isChoice, skip, type Answer, type AnswerContext } from './types';

export { yearMonthTarget } from './targets';
export { isChoice } from './types';
export type { Answer, AnswerContext, Canonical, CountryAnswer, ProfileView } from './types';
export { DECLINE_TARGET, vocabTarget, yesNoTarget } from './vocab';

/** A Provider mapping below this confidence is a suggestion for review, never filled (like a similar Saved Answer). */
export const MIN_MAPPING_CONFIDENCE = 0.7;

export interface ProviderMapping {
  readonly match: FieldMatch;
  /** 0 to 1, from `mapFields`. */
  readonly confidence: number;
}

/** What integration knows from the Provider and the user, fed back in through `plan()`. */
export interface ProviderInputs {
  /** Mappings from the helper's `mapFields`, by field id. */
  readonly mappings: ReadonlyMap<string, ProviderMapping>;
  /** Answers the user accepted (Drafts, or a similar Saved Answer), by field id. */
  readonly accepted: ReadonlyMap<string, string>;
  /** Fields whose Draft is waiting in the side panel. */
  readonly draftsReady: ReadonlySet<string>;
  /** Fields whose Draft the Provider couldn't write: they stop waiting for one. */
  readonly draftsFailed: ReadonlySet<string>;
  /** `pending` until integration has asked the Provider; `unavailable` when it can't. */
  readonly state: 'pending' | 'unavailable' | 'answered';
  /** The helper's fix, shown when the Provider is unavailable. */
  readonly unavailableFix?: string;
}

export interface Answered {
  readonly fieldType: FieldType;
  readonly answer: Answer;
}

const ATTESTATION_FIX =
  'Attestations are left for you. Read it, and tick or choose it yourself if you agree.';
const NEVER_FIX = 'employ-me never stores or fills this. Enter it yourself.';
const UNRECOGNIZED_FIX = 'Neither the rules nor the AI recognised this question. Answer it yourself.';

/** The answer for one classified field, in the order design.md "Who fills what" gives. */
export function answerFor(
  field: ExtractedField,
  classification: CountryClassification,
  ctx: AnswerContext,
  provider: ProviderInputs,
): Answered {
  const { fieldType } = classification;
  const sensitivity = sensitivityOf(fieldType);
  if (sensitivity === 'attestation') return { fieldType, answer: skip('attestation', ATTESTATION_FIX) };
  if (sensitivity === 'neverStored') return { fieldType, answer: skip('neverStored', NEVER_FIX) };

  if (sensitivity === 'ordinary') {
    const accepted = provider.accepted.get(field.fieldId);
    if (accepted !== undefined) return { fieldType, answer: acceptedAnswer(field, accepted) };
  }

  if (fieldType !== 'unknown' && fieldType !== 'freeText.question') {
    const answer =
      countryAnswer(fieldType, field, classification.country, ctx) ?? factAnswer(fieldType, field, ctx);
    return { fieldType, answer: answer ?? skip('unrecognizedField', 'Answer this one yourself.') };
  }

  const saved = savedAnswerFor(classification.savedAnswerId, ctx);
  if (saved !== undefined) return { fieldType, answer: savedText(field, saved, ctx) };

  const mapping = provider.mappings.get(field.fieldId);
  if (mapping !== undefined) return fromMapping(field, mapping, classification, ctx, provider);
  if (fieldType === 'freeText.question') return { fieldType, answer: draftAnswer(field, provider) };
  // The AI has answered the field mapping and left this one out.
  if (provider.state === 'answered') return unrecognized(field, fieldType, provider);
  return { fieldType, answer: providerNeeded('mapping', provider) };
}

function acceptedAnswer(field: ExtractedField, accepted: string): Answer {
  return isChoice(field)
    ? { kind: 'answer', value: { kind: 'option', target: textTarget(accepted) }, source: 'savedAnswer' }
    : { kind: 'answer', value: { kind: 'text', text: accepted }, source: 'savedAnswer' };
}

function savedAnswerFor(id: string | undefined, ctx: AnswerContext): SavedAnswer | undefined {
  return id === undefined ? undefined : ctx.savedAnswers.find((s) => s.id === id);
}

/** A Saved Answer's text, with the employer's override when there is one. */
function savedText(field: ExtractedField, saved: SavedAnswer, ctx: AnswerContext): Answer {
  const value = (ctx.employer === null ? undefined : saved.employerOverrides[ctx.employer]) ?? saved.answer;
  return acceptedAnswer(field, value);
}

function fromMapping(
  field: ExtractedField,
  { match: mapping, confidence }: ProviderMapping,
  classification: CountryClassification,
  ctx: AnswerContext,
  provider: ProviderInputs,
): Answered {
  const ruleType = classification.fieldType;
  const sure = confidence >= MIN_MAPPING_CONFIDENCE;
  switch (mapping.kind) {
    case 'fieldType': {
      const mapped = mapping.fieldType;
      if (mapped === 'unknown' || mapped === 'freeText.question') {
        return unrecognized(field, ruleType, provider);
      }
      // The rules didn't see a Self-ID question, Attestation or never-stored
      // field here, and the AI says it is one. Self-ID fills only from your
      // own answers to questions the rules recognise, and the others never
      // fill (design.md "Sensitive questions"): so it's yours to answer, and
      // nothing is suggested.
      if (!isOrdinaryFieldType(mapped)) {
        return { fieldType: mapped, answer: { kind: 'review', reason: 'providerMatched' } };
      }
      const inner = answerFor(
        field,
        { fieldType: mapped, source: 'provider', ...countryOf(classification) },
        ctx,
        {
          ...provider,
          mappings: new Map(),
        },
      );
      if (inner.answer.kind !== 'answer') return { fieldType: mapped, answer: inner.answer };
      if (!sure) {
        // A weak match is only a suggestion: shown for review, never written.
        const suggestion = describeValue(inner.answer.value);
        return {
          fieldType: mapped,
          answer: { kind: 'review', reason: 'providerMatched', ...(suggestion === '' ? {} : { suggestion }) },
        };
      }
      const answer: Answer = {
        ...inner.answer,
        value: withProviderOptions(inner.answer.value, mapping.options),
        source: 'provider',
        review: 'providerMatched',
      };
      return { fieldType: mapped, answer };
    }
    case 'savedAnswer': {
      const saved = ctx.savedAnswers.find((s) => s.id === mapping.savedAnswerId);
      if (saved === undefined) return { fieldType: ruleType, answer: draftAnswer(field, provider) };
      const suggestion =
        (ctx.employer === null ? undefined : saved.employerOverrides[ctx.employer]) ?? saved.answer;
      return { fieldType: ruleType, answer: { kind: 'review', reason: 'similarSavedAnswer', suggestion } };
    }
    case 'needsDraft':
      // The AI says it's free text: a Draft answers it, and its Draft button works.
      return { fieldType: 'freeText.question', answer: draftAnswer(field, provider) };
    case 'unknown':
      return unrecognized(field, ruleType, provider);
  }
}

/**
 * A question neither the rules nor the AI recognised. In a text box it's a
 * free-text question ("years of experience with X?", "security clearance?"),
 * so it gets a Draft, or a Draft button when optional (design.md "Drafts").
 * Anything else is yours to answer.
 */
function unrecognized(field: ExtractedField, fieldType: FieldType, provider: ProviderInputs): Answered {
  const box = field.widget === 'text' || field.widget === 'textarea';
  if (box && (field.control === 'text' || field.control === 'textarea')) {
    return { fieldType: 'freeText.question', answer: draftAnswer(field, provider) };
  }
  return { fieldType, answer: skip('unrecognizedField', UNRECOGNIZED_FIX) };
}

/** Free-text questions: Drafts for required ones, a Draft button for optional ones (design.md "Drafts"). */
function draftAnswer(field: ExtractedField, provider: ProviderInputs): Answer {
  if (provider.draftsReady.has(field.fieldId)) return { kind: 'review', reason: 'draftReady' };
  if (!field.required) {
    return skip(
      'notInProfile',
      'Optional question with no Saved Answer. Click Draft, or write your own answer.',
    );
  }
  // When the whole Provider is unavailable, its own reason and fix say more.
  if (provider.state !== 'unavailable' && provider.draftsFailed.has(field.fieldId)) {
    return skip(
      'draftFailed',
      'The AI did not write a Draft for this question. Click Draft to try again, or write your own.',
    );
  }
  return providerNeeded('draft', provider);
}

function providerNeeded(need: 'mapping' | 'draft', provider: ProviderInputs): Answer {
  if (provider.state === 'unavailable') {
    return skip(
      'providerUnavailable',
      provider.unavailableFix ?? 'The AI is unavailable. Answer this one yourself, or click Retry.',
    );
  }
  return { kind: 'provider', need };
}
