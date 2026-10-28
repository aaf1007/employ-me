import { describe, expect, it } from 'vitest';
import { routeFromHash } from './routes';

describe('routeFromHash', () => {
  it('reads the section from the hash, defaulting to Profile', () => {
    expect(routeFromHash('#tracker')).toBe('tracker');
    expect(routeFromHash('#setup')).toBe('setup');
    expect(routeFromHash('#resumes')).toBe('resumes');
    expect(routeFromHash('')).toBe('profile');
    expect(routeFromHash('#nope')).toBe('profile');
  });
});
