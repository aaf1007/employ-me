import { describe, expect, it } from 'vitest';
import { quotaText, windowName } from './quota';

describe('plan usage', () => {
  it('names usage windows the way plans do', () => {
    expect(windowName(300)).toBe('5-hour');
    expect(windowName(10_080)).toBe('weekly');
    expect(windowName(2880)).toBe('2-day');
    expect(windowName(90)).toBe('90-minute');
    expect(windowName(undefined)).toBe('current');
  });

  it('says how much is left and when it resets', () => {
    const format = (iso: string) => `at ${iso}`;
    expect(quotaText({ remainingPercent: 71.6, windowMinutes: 300 }, format)).toBe(
      '72% left of the 5-hour limit',
    );
    expect(
      quotaText({ remainingPercent: 3, windowMinutes: 10_080, resetsAt: '2026-11-01T00:00:00Z' }, format),
    ).toBe('3% left of the weekly limit, resets at 2026-11-01T00:00:00Z');
  });
});
