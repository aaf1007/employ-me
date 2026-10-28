import type { ResumeWire } from './parse-resume';

type DegreeLevel = NonNullable<ResumeWire['education'][number]['degreeLevel']>;

// The degree abbreviations the parseResume prompt says make a level clear.
// Codex still left "BASc" with no level (live, 2026-10-28), so when the
// model gives none, the level is read from the degree as written. Only
// these abbreviations and spelled-out degrees count; anything else stays
// empty for you to set at review.

export const DEGREE_ABBREVIATIONS: ReadonlyArray<readonly [DegreeLevel, readonly string[]]> = [
  ['bachelor', ['BA', 'BSc', 'BASc', 'BEng', 'BMath', 'BCom']],
  ['master', ['MA', 'MSc', 'MEng', 'MBA']],
  ['doctorate', ['PhD']],
];

const SPELLED_OUT: ReadonlyArray<readonly [DegreeLevel, RegExp]> = [
  ['bachelor', /^(honou?rs )?bachelor('?s)?\b/],
  ['master', /^master('?s)?\b/],
  ['doctorate', /^doctor(ate)? of\b/],
];

/** "B.A.Sc." and "BASc" are bachelor; "Master of Science" is master; "Diploma" is null. */
export function degreeLevelOf(degree: string | null): DegreeLevel | null {
  if (degree === null) return null;
  const words = degree.trim().toLowerCase();
  const compact = words.replace(/[.\s]/g, '');
  const abbreviated = DEGREE_ABBREVIATIONS.find(([, names]) =>
    names.some((n) => n.toLowerCase() === compact),
  );
  return abbreviated?.[0] ?? SPELLED_OUT.find(([, pattern]) => pattern.test(words))?.[0] ?? null;
}
