import { normalizeLabel } from '@employ-me/core';

// Choosing a form's option for an answer (research §6 step 5): exact, then
// normalized, then synonym patterns, then token overlap. Two equally good
// options are "ambiguous" and go to review rather than being guessed.

/** What a field's answer should be, independent of how the form words its options. */
export interface OptionTarget {
  /** The answer in plain words: "Yes", "Decline to self-identify", "Canada". */
  readonly text: string;
  /** Synonym patterns over normalized option text (lower case, no punctuation), best first. */
  readonly patterns: readonly RegExp[];
  /** What to type into a searchable list to find it, when it differs from `text`. */
  readonly search?: string;
  /** When false, only `patterns` may match; token overlap is off (vocab values like "No"). */
  readonly fuzzy?: boolean;
  /**
   * Search results are ranked by the site, so several hits mean "take the
   * first" (city and school pickers), not "ambiguous".
   */
  readonly firstWins?: boolean;
  /** Pick the range option ("60,000 - 70,000", "Under 50k", "100k+") that contains this amount. */
  readonly amount?: number;
}

export type MatchResult =
  | { readonly kind: 'match'; readonly index: number }
  | { readonly kind: 'ambiguous'; readonly indices: readonly number[] }
  | { readonly kind: 'none' };

export function matchOption(options: readonly string[], target: OptionTarget): MatchResult {
  const normalized = options.map(normalizeLabel);
  const wanted = normalizeLabel(target.text);

  if (target.amount !== undefined) {
    const amount = target.amount;
    const inRange = indicesWhere(options, (o) => rangeContains(o, amount));
    return inRange.length === 1 && inRange[0] !== undefined
      ? { kind: 'match', index: inRange[0] }
      : inRange.length > 1
        ? { kind: 'ambiguous', indices: inRange }
        : { kind: 'none' };
  }

  const exact = indicesWhere(normalized, (o) => o === wanted && o !== '');
  if (exact.length >= 1) return pick(exact, normalized, target);

  for (const pattern of target.patterns) {
    const hits = indicesWhere(normalized, (o) => pattern.test(o));
    if (hits.length > 0) return pick(hits, normalized, target);
  }

  if (target.fuzzy === false) return { kind: 'none' };
  const tokens = wanted.split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return { kind: 'none' };
  const containing = indicesWhere(normalized, (o) =>
    tokens.every((t) => new RegExp(`\\b${escape(t)}\\b`).test(o)),
  );
  if (containing.length > 0) return pick(containing, normalized, target);
  return { kind: 'none' };
}

/** One hit is a match; several are ambiguous unless one is the plain option and the rest qualify it. */
function pick(indices: readonly number[], normalized: readonly string[], target: OptionTarget): MatchResult {
  const [first] = indices;
  if ((indices.length === 1 || target.firstWins === true) && first !== undefined) {
    return { kind: 'match', index: first };
  }
  const distinct = new Set(indices.map((i) => normalized[i]));
  if (distinct.size === 1 && first !== undefined) return { kind: 'match', index: first };
  return { kind: 'ambiguous', indices };
}

function indicesWhere(values: readonly string[], test: (value: string) => boolean): number[] {
  const out: number[] = [];
  values.forEach((value, i) => {
    if (test(value)) out.push(i);
  });
  return out;
}

/** Whether a range option such as "€60,000 - €70,000", "60k-70k", "Under 50k" or "100k+" contains `amount`. */
function rangeContains(option: string, amount: number): boolean {
  const numbers = [...option.matchAll(/(\d[\d,.]*)\s*(k)?/gi)]
    .map((m) => Number((m[1] ?? '').replace(/,/g, '')) * (m[2] === undefined ? 1 : 1000))
    .filter((n) => Number.isFinite(n) && n >= 1000);
  const [lo, hi] = numbers;
  if (lo === undefined) return false;
  if (hi !== undefined) return lo <= amount && amount <= hi;
  if (/\+|\b(above|over|more|plus)\b/i.test(option)) return amount >= lo;
  if (/\b(under|below|less|up to)\b/i.test(option)) return amount < lo;
  return false;
}

const STOP_WORDS = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'a', 'an', 'to']);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A plain-text answer to pick from a list: exact, normalized or by its words. */
export function textTarget(text: string, search?: string): OptionTarget {
  return { text, patterns: [], ...(search === undefined ? {} : { search }) };
}
