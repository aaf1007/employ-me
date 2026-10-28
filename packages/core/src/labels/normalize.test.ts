import { describe, expect, it } from 'vitest';
import { labelCacheKey, labelsMatch, normalizeLabel } from './normalize';

describe('normalizeLabel', () => {
  it.each([
    ['First Name *', 'first name'],
    ['  Email   address ', 'email address'],
    ["What's your LinkedIn?", 'whats your linkedin'],
    ['What’s your LinkedIn?', 'whats your linkedin'],
    ['Phone (required)', 'phone'],
    ['Téléphone (obligatoire)', 'téléphone'],
    ['Experience with C++?', 'experience with c++'],
    ['Ｆｕｌｌ　Ｎａｍｅ', 'full name'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected);
  });
});

describe('labelsMatch', () => {
  it('ignores case and punctuation', () => {
    expect(labelsMatch('Why do you want to work here?', 'why do you want to work here')).toBe(true);
  });

  it('does not match different words', () => {
    expect(labelsMatch('Why do you want to work here?', 'Why do you want this job?')).toBe(false);
  });

  it('never matches empty labels', () => {
    expect(labelsMatch('*', '')).toBe(false);
  });
});

describe('labelCacheKey', () => {
  it('scopes the normalized label by ATS', () => {
    expect(labelCacheKey('greenhouse', 'First Name *')).toBe('greenhouse:first name');
  });
});
