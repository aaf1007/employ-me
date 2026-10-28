import { snapshotSchema } from '@employ-me/core';
import { describe, expect, it } from 'vitest';
import { submissionOf, withPublicDetails } from './posting';
import { POSTING } from './test-fakes';

describe('withPublicDetails', () => {
  it('fills gaps from the public API, and takes its full description', () => {
    expect(
      withPublicDetails(
        { ...POSTING, description: 'Short page text' },
        { title: 'API title', location: 'Toronto, ON', country: 'CA', description: 'The full description.' },
      ),
    ).toEqual({ ...POSTING, location: 'Toronto, ON', country: 'CA', description: 'The full description.' });
    expect(withPublicDetails(POSTING, null)).toEqual(POSTING);
  });
});

describe('submissionOf', () => {
  it('moves the description into the Snapshot', () => {
    const { posting, snapshot } = submissionOf(
      { ...POSTING, description: 'Build things.' },
      [{ label: 'Email', fieldType: 'contact.email', value: 'sam.lee@example.com' }],
      { id: 'r1', label: 'General', fileName: 'sam-lee.pdf' },
      new Date('2026-10-28T12:00:00Z'),
    );
    expect(posting).toEqual(POSTING);
    expect(snapshotSchema.parse(snapshot)).toEqual({
      capturedAt: '2026-10-28T12:00:00.000Z',
      postingDescription: 'Build things.',
      answers: [{ label: 'Email', fieldType: 'contact.email', value: 'sam.lee@example.com' }],
      resume: { id: 'r1', label: 'General', fileName: 'sam-lee.pdf' },
    });
  });
});
