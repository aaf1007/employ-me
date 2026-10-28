import type { AtsId } from '../ats';

// Required/optional markers are form chrome, not part of the question.
const MARKERS = /\(\s*(?:required|optional|obligatoire|facultatif)\s*\)/giu;
// Apostrophes join ("what's" -> "whats") so "What's" and "Whats" still match.
const APOSTROPHES = /['‘’ʼ]/gu;
const PUNCTUATION = /\p{P}+/gu;
const WHITESPACE = /\s+/gu;

/**
 * Canonical form of a field label or question, for exact matching.
 * Saved Answers match "word for word, ignoring case and punctuation"
 * (design.md "Who fills what"), so this ignores exactly those, plus
 * whitespace and required markers. Accents and symbols such as "+" are kept:
 * "C++" is not "C".
 */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .replace(MARKERS, ' ')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/** True when two labels are the same question. Empty labels never match. */
export function labelsMatch(a: string, b: string): boolean {
  const na = normalizeLabel(a);
  return na !== '' && na === normalizeLabel(b);
}

/** Cache key for Provider field mappings: `(ats, normalized label)` (research §6 step 4). */
export function labelCacheKey(ats: AtsId, label: string): string {
  return `${ats}:${normalizeLabel(label)}`;
}
