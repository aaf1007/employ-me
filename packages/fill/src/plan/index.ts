import {
  toProviderField,
  toProviderSavedQuestion,
  type Posting,
  type ProviderField,
  type ProviderSavedQuestion,
  type SavedAnswer,
} from '@employ-me/core';
import { adapterFor, type AtsAdapter } from '../adapters';
import { answerFor, type ProfileView, type ProviderInputs } from '../answer';
import { classifyField, type CountryChoice } from '../classify';
import { countriesIn, readPosting } from '../posting';
import type { ExtractedField } from '../types';
import type {
  DraftRequestRef,
  FillPlan,
  PlanOptions,
  PlannedField,
  ProviderRequest,
  RepeatStep,
} from './types';
import { stepFor } from './write';

export type * from './types';

/**
 * Plans a Fill of the Application Form in `doc`: extracts every field,
 * classifies it (adapter map → Self-ID/Attestation rules → taxonomy → Saved
 * Answers), and decides one step per field. Reads the page only; `execute()`
 * does the writing. Plan again with `options.provider` once the Provider has
 * mapped fields or the user has accepted Drafts: the new plan replaces the old.
 */
export function plan(
  doc: Document,
  profile: ProfileView,
  savedAnswers: readonly SavedAnswer[],
  options: PlanOptions = {},
): FillPlan {
  const url = options.url ?? new URL(doc.location.href);
  const adapter = adapterFor(url);
  const form = adapter.findForm(doc);
  const posting = options.posting ?? readPosting(doc, url);
  const country = postingCountry(posting, options);
  const provider = providerInputs(options);
  const ctx = {
    profile,
    savedAnswers,
    employer: posting?.key.employer ?? null,
    hasResume: options.resume !== undefined && options.resume !== null,
  };
  const knownOptions = options.postingDetails?.fieldOptions ?? {};

  const fields: PlannedField[] = (form === null ? [] : adapter.extract(form)).map((extracted) => {
    const field = withKnownOptions(extracted, knownOptions);
    const classification = classifyField(field, {
      ats: adapter.ats,
      url,
      savedAnswers,
      country,
      adapterMap: (f) => adapter.classify(f),
    });
    const { fieldType, answer } = answerFor(field, classification, ctx, provider);
    return { field, fieldType, classifiedBy: classification.source, step: stepFor(answer, field, fieldType) };
  });

  const aiPolicy = fields.some((f) => f.fieldType === 'attestation.aiPolicy');
  return {
    ats: adapter.ats,
    url: url.href,
    posting,
    country,
    fields,
    providerRequest: providerRequest(adapter, fields, savedAnswers),
    draftRequests: draftRequests(fields, aiPolicy, posting),
    aiPolicy,
    resumeFirst:
      adapter.parsesResume && fields.some((f) => f.step.kind === 'write' && f.step.write.kind === 'file'),
    repeats: form === null ? [] : repeats(adapter, form, profile),
    context: { doc, adapter, profile, options, savedAnswers },
  };
}

/** The Posting's country (design.md "Country-specific answers"): known only when exactly one is named. */
function postingCountry(posting: Posting | null, options: PlanOptions): CountryChoice {
  const declared = posting?.country ?? options.postingDetails?.country;
  if (declared !== undefined) return { kind: 'known', country: declared };
  const location = [posting?.location, options.postingDetails?.location]
    .filter((l) => l !== undefined)
    .join('; ');
  const named = countriesIn(location);
  const [only] = named;
  return named.length === 1 && only !== undefined
    ? { kind: 'known', country: only }
    : { kind: 'unclear', candidates: named };
}

function providerInputs(options: PlanOptions): ProviderInputs {
  const feedback = options.provider ?? {};
  return {
    state: feedback.state ?? 'pending',
    ...(feedback.unavailableFix === undefined ? {} : { unavailableFix: feedback.unavailableFix }),
    mappings: new Map(
      (feedback.mappings ?? []).map((m) => [m.fieldId, { match: m.match, confidence: m.confidence }]),
    ),
    accepted: new Map((feedback.accepted ?? []).map((a) => [a.fieldId, a.text])),
    draftsReady: new Set(feedback.draftsReady ?? []),
  };
}

/** Greenhouse's public API lists options its react-selects render only when open. */
function withKnownOptions(
  field: ExtractedField,
  known: Readonly<Record<string, readonly string[]>>,
): ExtractedField {
  if (field.options.length > 0) return field;
  const options = known[field.fieldId] ?? (field.name === undefined ? undefined : known[field.name]);
  return options === undefined ? field : { ...field, options: options.slice(0, 1000) };
}

/** Labels and options only, built by core's boundary functions (CLAUDE.md "Hard rules" 2). */
function providerRequest(
  adapter: AtsAdapter,
  fields: readonly PlannedField[],
  savedAnswers: readonly SavedAnswer[],
): ProviderRequest | null {
  const providerFields: ProviderField[] = [];
  for (const planned of fields) {
    if (planned.step.kind !== 'awaitProvider' || planned.step.need !== 'mapping') continue;
    const result = toProviderField(planned.field, planned.fieldType);
    if (result.ok) providerFields.push(result.value);
  }
  if (providerFields.length === 0) return null;
  const savedQuestions: ProviderSavedQuestion[] = [];
  for (const saved of savedAnswers) {
    const result = toProviderSavedQuestion(saved);
    if (result.ok) savedQuestions.push(result.value);
  }
  return { ats: adapter.ats, fields: providerFields, savedQuestions };
}

function draftRequests(
  fields: readonly PlannedField[],
  aiPolicy: boolean,
  posting: Posting | null,
): DraftRequestRef[] {
  return fields
    .filter((f) => f.step.kind === 'awaitProvider' && f.step.need === 'draft')
    .map(({ field }) => ({
      fieldId: field.fieldId,
      fieldType: 'freeText.question' as const,
      question: {
        label: field.label === '' ? 'Question' : field.label,
        required: field.required,
        ...(field.description === undefined ? {} : { description: field.description }),
        ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
        language: 'en',
      },
      mode: aiPolicy ? 'polish' : 'write',
      posting: {
        ...(posting?.title === undefined ? {} : { title: posting.title }),
        ...(posting?.company === undefined ? {} : { company: posting.company }),
        ...(posting?.description === undefined ? {} : { description: posting.description.slice(0, 100_000) }),
      },
      ...(posting === null ? {} : { employer: posting.key.employer }),
    }));
}

/** One "Add another" press per Profile entry the form has no room for yet. */
function repeats(adapter: AtsAdapter, form: Element, profile: ProfileView): RepeatStep[] {
  const steps: RepeatStep[] = [];
  for (const section of adapter.repeatingSections(form)) {
    const want =
      section.section === 'education'
        ? profile.background.education.length
        : profile.background.workHistory.length;
    if (section.addButton !== null && section.entries > 0 && want > section.entries) {
      steps.push({ section: section.section, button: section.addButton, have: section.entries, want });
    }
  }
  return steps;
}
