import { describe, expect, it } from 'vitest';
import { emptyProfile, profileSchema } from './profile';

describe('profileSchema', () => {
  it('defaults every Self-ID Answer to decline, per country', () => {
    const { selfId } = emptyProfile();
    expect(Object.values(selfId.US)).toEqual(['decline', 'decline', 'decline', 'decline', 'decline']);
    expect(Object.values(selfId.CA)).toEqual(['decline', 'decline', 'decline', 'decline']);
  });

  it('keeps one Work Authorization per country with yes/no/ask sponsorship', () => {
    const profile = profileSchema.parse({
      schemaVersion: 1,
      workAuthorization: {
        CA: { authorizedNow: true, sponsorship: 'no', citizenships: ['CA'] },
        US: { authorizedNow: false, sponsorship: 'ask', status: 'TN eligible', usPerson: false },
      },
    });
    expect(profile.workAuthorization['US']?.sponsorship).toBe('ask');
    expect(profile.workAuthorization['CA']?.citizenships).toEqual(['CA']);
  });

  it('allows "U.S. person" on the US entry only', () => {
    const result = profileSchema.safeParse({
      schemaVersion: 1,
      workAuthorization: { CA: { authorizedNow: true, sponsorship: 'no', usPerson: true } },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ['dateOfBirth', { identity: { legalName: { first: 'A', last: 'B' }, dateOfBirth: '2000-01-01' } }],
    ['sin', { identity: { legalName: { first: 'A', last: 'B' }, sin: '123456789' } }],
    ['password', { contact: { email: 'a@b.co', password: 'hunter2' } }],
    ['references', { references: [] }],
    ['signature', { signature: 'A B' }],
  ])('rejects never-stored data: %s', (_name, extra) => {
    expect(profileSchema.safeParse({ schemaVersion: 1, ...extra }).success).toBe(false);
  });

  it('requires exactly one default Resume', () => {
    const resume = {
      id: 'r1',
      label: 'Backend',
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      addedAt: '2026-10-27T12:00:00Z',
      isDefault: false,
    };
    expect(profileSchema.safeParse({ schemaVersion: 1, resumes: [resume] }).success).toBe(false);
    expect(
      profileSchema.safeParse({ schemaVersion: 1, resumes: [{ ...resume, isDefault: true }] }).success,
    ).toBe(true);
  });
});
