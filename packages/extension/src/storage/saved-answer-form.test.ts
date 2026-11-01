import { describe, expect, it } from 'vitest';
import { createTestStore, failure, value } from './test-store';

// design.md "Keeping answers you gave on the form": the answers you ticked in
// the side panel's offer, kept once the Application is created.

describe('saving answers you gave on a form', () => {
  it('keeps a new question as a Saved Answer from a form, with its field type', async () => {
    const { store, changes } = await createTestStore();
    const saved = value(
      await store.saveFormAnswers({
        answers: [
          { question: 'How did you hear about us?', answer: 'LinkedIn', fieldType: 'screening.howHeard' },
          { question: 'Which time zone are you in?', answer: 'Eastern', fieldType: 'unknown' },
        ],
        employer: 'acme',
      }),
    );
    expect(saved).toEqual([
      expect.objectContaining({
        question: 'How did you hear about us?',
        answer: 'LinkedIn',
        source: 'form',
        fieldType: 'screening.howHeard',
        employerOverrides: {},
      }),
      expect.objectContaining({
        question: 'Which time zone are you in?',
        source: 'form',
        fieldType: 'unknown',
      }),
    ]);
    expect(value(await store.listSavedAnswers())).toEqual(saved);
    expect(changes).toEqual(['savedAnswers']);
  });

  it('updates the answer of a question you already have, keeping where it came from', async () => {
    const { store } = await createTestStore();
    const before = value(
      await store.addSavedAnswer({ question: "What's your time zone?", answer: 'Pacific' }),
    );
    const [after] = value(
      await store.saveFormAnswers({
        answers: [{ question: 'whats your TIME ZONE', answer: 'Eastern', fieldType: 'unknown' }],
        employer: 'acme',
      }),
    );
    expect(after).toMatchObject({
      id: before.id,
      question: "What's your time zone?",
      answer: 'Eastern',
      source: 'manual',
      createdAt: before.createdAt,
    });
    expect(value(await store.listSavedAnswers())).toHaveLength(1);
  });

  it("changes the employer's own override when it has one, and leaves the answer alone", async () => {
    const { store } = await createTestStore();
    value(
      await store.addSavedAnswer({
        question: 'Why us?',
        answer: 'Generic',
        employerOverrides: { acme: 'For Acme' },
      }),
    );
    const [after] = value(
      await store.saveFormAnswers({
        answers: [{ question: 'Why us?', answer: 'Acme, again', fieldType: 'freeText.question' }],
        employer: 'acme',
      }),
    );
    expect(after).toMatchObject({ answer: 'Generic', employerOverrides: { acme: 'Acme, again' } });
  });

  it('saves nothing when one of the answers is refused', async () => {
    const { store, changes } = await createTestStore();
    const error = failure(
      await store.saveFormAnswers({
        answers: [
          { question: 'Which time zone are you in?', answer: 'Eastern', fieldType: 'unknown' },
          { question: 'What is your gender?', answer: 'Decline', fieldType: 'unknown' },
        ],
      }),
    );
    expect(error.reason).toBe('invalidInput');
    expect(value(await store.listSavedAnswers())).toEqual([]);
    expect(changes).toEqual([]);
  });
});
