import { describe, expect, it } from 'vitest';
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
});
