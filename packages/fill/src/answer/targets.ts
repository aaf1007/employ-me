import { normalizeLabel } from '@employ-me/core';
import type { OptionTarget } from '../match';

// Option targets for dates and "How did you hear about us?".

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SEASONS = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'fall|autumn',
  'fall|autumn',
  'fall|autumn',
  'winter',
];

/**
 * A month in a list of dates: "April 2025", "Apr 2025", "Spring 2025", or the
 * bare year when the list has only years. Never just any option naming the
 * year: "Fall 2025" is not April 2025.
 */
export function yearMonthTarget(yearMonth: string): OptionTarget {
  const [year = '', month = '1'] = yearMonth.split('-');
  const index = Number(month) - 1;
  const name = MONTHS[index] ?? '';
  const short = name.slice(0, 3).toLowerCase();
  const season = SEASONS[index] ?? 'none';
  const numeric = String(index + 1);
  return {
    text: `${name} ${year}`,
    patterns: [
      new RegExp(`\\b(${name.toLowerCase()}|${short})\\b.*\\b${year}\\b`),
      new RegExp(`\\b(${season})\\b.*\\b${year}\\b|\\b${year}\\b.*\\b(${season})\\b`),
      new RegExp(`^0?${numeric} ${year}$|^${year} 0?${numeric}$`),
      new RegExp(`^${year}$`),
    ],
    fuzzy: false,
  };
}

/** "How did you hear about us?" in a form's own words: "Company website" also reads as "Careers page". */
export function howHeardTarget(answer: string): OptionTarget {
  const text = normalizeLabel(answer);
  const patterns: RegExp[] = [];
  if (/\b(website|site|careers?|company)\b/.test(text)) {
    patterns.push(
      /\b(company|careers?|corporate|our|official) (web ?site|site|page|portal)\b/,
      /\bcareers? (page|site|website|portal)\b/,
      /\b(web ?site|careers? page)\b/,
    );
  }
  if (/\blinked ?in\b/.test(text)) patterns.push(/\blinked ?in\b/);
  if (/\breferr\w*|\bfriend|\bemployee\b/.test(text)) patterns.push(/\b(referr\w*|employee referral)\b/);
  return { text: answer, patterns };
}
