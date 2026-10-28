import type { Profile } from '@employ-me/core';
import type { FieldView } from '../messaging/content';
import type { PanelState } from './state';

// "Copy debug report" (design.md "Your data stays on your machine"): what
// the Fill saw and decided, with every value stripped. It carries the form's
// own labels, the field types, outcomes, reasons and fixes, and never a
// value: no Profile data, no Saved Answers, no Drafts, no suggestions, no
// option lists (an open list can show your own search). As a last guard,
// any of your own words that still turn up (a label that quoted a value) are
// replaced before it is copied.

const REMOVED = '[removed]';

export function buildDebugReport(state: PanelState, profile: Profile | null, version: string): string {
  const { detected, posting, view, provider } = state;
  const report = {
    employMe: version,
    page:
      detected === null
        ? null
        : {
            ats: detected.ats,
            url: withoutQuery(detected.url),
            topFrame: detected.topFrame,
            fieldCount: detected.fieldCount,
            confirmed: detected.confirmed,
          },
    posting:
      posting === null
        ? null
        : {
            // A company site's key can hold its URL's query: left out, like the page's.
            key: { ...posting.key, jobId: posting.key.jobId.split('?')[0] ?? '' },
            country: posting.country ?? null,
            hasDescription: (posting.description ?? '') !== '',
          },
    fill: state.fill,
    provider:
      provider.state === 'unavailable'
        ? { state: provider.state, fix: provider.notice.fix }
        : { state: provider.state },
    aiPolicy: view?.aiPolicy ?? null,
    resume: view === null ? null : view.resume !== null,
    fields: view?.fields.map((field) => fieldLine(field, state)) ?? [],
    submission: state.submission.state,
  };
  return scrub(JSON.stringify(report, null, 2), secretsOf(state, profile));
}

function fieldLine(field: FieldView, state: PanelState) {
  const { outcome } = field;
  return {
    fieldId: field.fieldId,
    label: field.label,
    ...(field.section === undefined ? {} : { section: field.section }),
    control: field.control,
    required: field.required,
    options: field.optionCount,
    fieldType: field.fieldType,
    classifiedBy: field.classifiedBy,
    outcome:
      outcome === null
        ? { kind: 'awaitingProvider', need: field.awaiting ?? null }
        : outcome.kind === 'filled'
          ? { kind: outcome.kind, source: outcome.source }
          : outcome.kind === 'needsReview'
            ? { kind: outcome.kind, reason: outcome.reason }
            : { kind: outcome.kind, reason: outcome.reason, fix: outcome.fix },
    onPage: field.onPage,
    userEdited: field.userEdited,
    hadSuggestion: field.suggestion !== undefined || field.byCountry !== undefined,
    draft: state.drafts[field.fieldId]?.status ?? null,
  };
}

/** Query strings can carry tokens; the Posting key already says which job it is. */
function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    if (error instanceof TypeError) return '';
    throw error;
  }
}

/** Your own words: every free-text value in the Profile, Saved Answers, Drafts and what the form showed. */
function secretsOf(state: PanelState, profile: Profile | null): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      const text = value.trim();
      // Enum values ("hybrid", "notProtectedVeteran") aren't your words and never appear on their own.
      if (text.length >= 3 && !/^[a-z][A-Za-z]*$/.test(text)) found.add(text);
    } else if (typeof value === 'number') {
      if (Math.abs(value) >= 1000) found.add(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) add(item);
    } else if (typeof value === 'object' && value !== null) {
      for (const item of Object.values(value)) add(item);
    }
  };
  add(profile);
  for (const draft of Object.values(state.drafts)) add(draft.text);
  for (const field of state.view?.fields ?? []) {
    add(field.suggestion);
    add(field.byCountry?.map((c) => c.text));
    add(field.candidates);
  }
  add(state.view?.answers.map((a) => a.value));
  // Longest first, so "Sam Lee" goes before "Sam".
  return [...found].sort((a, b) => b.length - a.length);
}

function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    out = out.replace(new RegExp(escapeRegExp(JSON.stringify(secret).slice(1, -1)), 'gi'), REMOVED);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
