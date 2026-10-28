import type { OrdinaryFieldType } from '@employ-me/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AcceptedDraft } from './saved-answer-store';
import { createTestStore, failure, value } from './test-store';

describe('Saved Answers', () => {
  it('adds, edits and deletes one you type in', async () => {
    const { store } = await createTestStore();
    const saved = value(
      await store.addSavedAnswer({
        question: 'Why us?',
        answer: 'Because.',
        employerOverrides: { ' Acme ': 'Acme!' },
      }),
    );
    expect(saved).toMatchObject({ source: 'manual', employerOverrides: { acme: 'Acme!' } });
    expect(saved).not.toHaveProperty('fieldType');

    const edited = value(
      await store.updateSavedAnswer(saved.id, { answer: 'Edited.', employerOverrides: {} }),
    );
    expect(edited).toMatchObject({ answer: 'Edited.', employerOverrides: {}, createdAt: saved.createdAt });
    expect(edited.updatedAt > saved.updatedAt).toBe(true);

    value(await store.deleteSavedAnswer(saved.id));
    expect(value(await store.listSavedAnswers())).toEqual([]);
    expect(failure(await store.deleteSavedAnswer(saved.id)).reason).toBe('notFound');
  });

  it('keeps questions unique the way a Fill matches them: case and punctuation ignored', async () => {
    const { store } = await createTestStore();
    value(await store.addSavedAnswer({ question: "What's your notice period?", answer: '2 weeks' }));
    const error = failure(await store.addSavedAnswer({ question: 'whats your NOTICE period', answer: 'x' }));
    expect(error.issues).toEqual([
      { path: 'question', message: 'You already have a Saved Answer for this question' },
    ]);
  });

  it('turns an accepted Draft into a Saved Answer that records its field type', async () => {
    const { store } = await createTestStore();
    const saved = value(
      await store.saveAcceptedDraft({
        question: 'Why do you want to work here?',
        answer: 'Draft text',
        fieldType: 'freeText.question',
      }),
    );
    expect(saved).toMatchObject({ source: 'draft', fieldType: 'freeText.question', answer: 'Draft text' });
  });

  it('files a Draft accepted on one employer’s form as that employer’s override', async () => {
    const { store } = await createTestStore();
    const draft = { question: 'Why us?', fieldType: 'freeText.question' } as const;
    value(await store.saveAcceptedDraft({ ...draft, answer: 'Generic' }));
    value(
      await store.saveAcceptedDraft({ ...draft, question: 'why us', answer: 'For Acme', employer: 'Acme' }),
    );
    let [saved] = value(await store.listSavedAnswers());
    expect(saved).toMatchObject({ answer: 'Generic', employerOverrides: { acme: 'For Acme' } });

    // Accepting the generic answer again for Acme drops the override.
    value(await store.saveAcceptedDraft({ ...draft, answer: 'Generic', employer: 'acme' }));
    value(await store.saveAcceptedDraft({ ...draft, answer: 'New generic' }));
    [saved] = value(await store.listSavedAnswers());
    expect(saved).toMatchObject({ answer: 'New generic', employerOverrides: {} });
    expect(value(await store.listSavedAnswers())).toHaveLength(1);
  });

  it('refuses a question that is Self-ID, an Attestation or never-stored, typed in or edited', async () => {
    const { store } = await createTestStore();
    for (const question of ['What is your race?', 'Social Security Number', 'Password', 'Date of birth']) {
      const error = failure(await store.addSavedAnswer({ question, answer: 'x' }));
      expect(error.reason, question).toBe('invalidInput');
      expect(error.issues?.map((issue) => issue.path)).toEqual(['question']);
    }
    const saved = value(await store.addSavedAnswer({ question: 'Why us?', answer: 'Because.' }));
    expect(failure(await store.updateSavedAnswer(saved.id, { question: 'What is your SIN?' })).reason).toBe(
      'invalidInput',
    );
    expect(
      failure(
        await store.saveAcceptedDraft({ question: 'Gender', answer: 'x', fieldType: 'freeText.question' }),
      ).reason,
    ).toBe('invalidInput');
    expect(value(await store.listSavedAnswers()).map((s) => s.question)).toEqual(['Why us?']);
  });

  // Untyped input (runtime messages, backups) is covered in router.test.ts and backup.test.ts.
  it('cannot be created from a Self-ID, Attestation or never-stored field', () => {
    expectTypeOf<AcceptedDraft['fieldType']>().toEqualTypeOf<OrdinaryFieldType>();
    expectTypeOf<'selfId.us.veteran'>().not.toExtend<AcceptedDraft['fieldType']>();
    expectTypeOf<'selfId.ca.genderIdentity'>().not.toExtend<AcceptedDraft['fieldType']>();
    expectTypeOf<'attestation.certify'>().not.toExtend<AcceptedDraft['fieldType']>();
    expectTypeOf<'never.password'>().not.toExtend<AcceptedDraft['fieldType']>();
  });
});
