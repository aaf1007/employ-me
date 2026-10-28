import { profileSchema, type FieldOutcome, type FieldType, type FillSource } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildDebugReport } from './debug-report';
import { INITIAL_STATE, type PanelState } from './state';
import { DETECTED, field, POSTING, PROFILE, WHY } from './test-fakes';

describe('buildDebugReport', () => {
  const state: PanelState = {
    ...INITIAL_STATE,
    phase: 'ready',
    detected: DETECTED,
    posting: { ...POSTING, description: 'Secret-ish JD text' },
    fill: 'done',
    provider: { state: 'unavailable', notice: { message: 'limit', fix: 'Wait for your plan to reset.' } },
    view: {
      ats: 'greenhouse',
      url: DETECTED.url,
      posting: POSTING,
      aiPolicy: false,
      fields: [
        field('n', 'name.full', { kind: 'filled', fieldId: 'n', fieldType: 'name.full', source: 'rules' }),
        // A label that quotes your own value (react-select text near a field).
        field(
          'city',
          'address.city',
          { kind: 'needsReview', fieldId: 'city', fieldType: 'address.city', reason: 'similarSavedAnswer' },
          { label: 'Where in Toronto do you live?', suggestion: 'My secret saved answer' },
        ),
        field(
          'why',
          'freeText.question',
          {
            kind: 'couldNotFill',
            fieldId: 'why',
            fieldType: 'freeText.question',
            reason: 'notInProfile',
            fix: 'Click Draft.',
          },
          { draft: WHY },
        ),
      ],
      providerRequest: null,
      answers: [{ label: 'Email', fieldType: 'contact.email', value: 'sam.lee@example.com' }],
      resume: { id: 'r1', label: 'General', fileName: 'sam-lee.pdf' },
    },
    drafts: {
      why: { request: WHY, status: 'ready', text: 'I am Sam and I love Acme.', flagged: [], polished: false },
    },
  };

  it('keeps labels, types, outcomes and fixes, and strips every value', () => {
    const report = buildDebugReport(state, PROFILE, '1.2.3');
    const parsed: unknown = JSON.parse(report);
    expect(parsed).toMatchObject({
      employMe: '1.2.3',
      page: { ats: 'greenhouse', url: 'https://job-boards.greenhouse.io/acme/jobs/1' },
      provider: { state: 'unavailable', fix: 'Wait for your plan to reset.' },
      fields: [
        { fieldId: 'n', fieldType: 'name.full', outcome: { kind: 'filled', source: 'rules' } },
        {
          fieldId: 'city',
          outcome: { kind: 'needsReview', reason: 'similarSavedAnswer' },
          hadSuggestion: true,
        },
        { fieldId: 'why', outcome: { kind: 'couldNotFill', fix: 'Click Draft.' }, draft: 'ready' },
      ],
    });
    expect(report).toContain('Where in [removed] do you live?');
    for (const value of [
      'Sam',
      'Lee',
      'sam.lee',
      'Toronto',
      'Queen St',
      'My secret',
      'love Acme',
      'JD text',
      'gh_src',
    ]) {
      expect(report).not.toContain(value);
    }
  });

  // Live, 2026-10-28: "CAD", "Yes" and "Prefer not to say" were replaced inside Ashby's field ids
  // ("cards[…f563[removed]9]") and in labels, so the report's ids no longer matched the form.
  it('scrubs your values, never the form’s field ids or its own words', () => {
    const id = 'cards[2f8e0c1a-f563cad9][field4]';
    const withSalary = profileSchema.parse({
      ...PROFILE,
      preferences: { salary: { CA: { currency: 'CAD', min: 150000, period: 'year' } } },
    });
    const filled = (fieldId: string, fieldType: FieldType, source: FillSource): FieldOutcome => ({
      kind: 'filled',
      fieldId,
      fieldType,
      source,
    });
    const view = state.view;
    if (view === null) throw new Error('the test state has a view');
    const report = buildDebugReport(
      {
        ...state,
        view: {
          ...view,
          fields: [
            field(id, 'pref.salary', filled(id, 'pref.salary', 'rules'), {
              label: 'Expected salary in CAD? Yes, a range is fine. Samples welcome.',
            }),
            field('g', 'selfId.us.sex', filled('g', 'selfId.us.sex', 'selfId'), {
              label: 'Gender (choose Prefer not to say if you like)',
              control: 'select',
            }),
            field('e', 'freeText.question', null, {
              label: 'Is your email still sam.lee@example.com? Is Lee your family name?',
            }),
          ],
          answers: [
            { label: 'Expected salary', fieldType: 'pref.salary', value: '150,000 CAD per year' },
            { label: 'Gender', fieldType: 'selfId.us.sex', value: 'Prefer not to say' },
            { label: 'Are you 18?', fieldType: 'identity.over18', value: 'Yes' },
          ],
        },
      },
      withSalary,
      '1.2.3',
    );
    const parsed = reportFieldsSchema.parse(JSON.parse(report));
    expect(parsed.fields.map((f) => f.fieldId)).toEqual([id, 'g', 'e']);
    expect(parsed.fields.map((f) => f.label)).toEqual([
      'Expected salary in CAD? Yes, a range is fine. Samples welcome.',
      'Gender (choose Prefer not to say if you like)',
      'Is your email still [removed]? Is [removed] your family name?',
    ]);
  });
});

const reportFieldsSchema = z.object({
  fields: z.array(z.object({ fieldId: z.string(), label: z.string() })),
});
