import { describe, expect, it } from 'vitest';
import type { ApplicationSummary } from '../../../storage';
import { posting } from '../../../storage/test-store';
import { companies, filterApplications, NO_FILTER, statusCounts } from './filter';

const app = (id: string, overrides: Partial<ApplicationSummary> = {}): ApplicationSummary => ({
  id,
  posting: posting(id),
  appliedAt: '2026-10-27T12:00:00Z',
  source: 'manual',
  status: 'applied',
  notes: '',
  hasSnapshot: false,
  ...overrides,
});

const apps = [
  app('1', { posting: posting('1', { company: 'Acme', title: 'Backend Engineer' }) }),
  app('2', {
    posting: posting('2', { company: 'Initech', title: 'Frontend Engineer' }),
    status: 'interviewing',
  }),
  app('3', {
    posting: posting('3', { company: 'Acme', title: 'Designer' }),
    notes: 'Recruiter Pat',
    status: 'rejected',
  }),
];

describe('Tracker filters', () => {
  it('searches company, title, location and notes, every word', () => {
    expect(filterApplications(apps, { ...NO_FILTER, search: 'engineer' }).map((a) => a.id)).toEqual([
      '1',
      '2',
    ]);
    expect(filterApplications(apps, { ...NO_FILTER, search: 'acme pat' }).map((a) => a.id)).toEqual(['3']);
    expect(filterApplications(apps, { ...NO_FILTER, search: '  ' })).toHaveLength(3);
  });

  it('filters by Status and company together', () => {
    expect(filterApplications(apps, { ...NO_FILTER, status: 'interviewing' }).map((a) => a.id)).toEqual([
      '2',
    ]);
    expect(
      filterApplications(apps, { ...NO_FILTER, company: 'Acme', status: 'rejected' }).map((a) => a.id),
    ).toEqual(['3']);
  });

  it('lists companies once each and counts Statuses', () => {
    expect(companies(apps)).toEqual(['Acme', 'Initech']);
    expect(statusCounts(apps)).toEqual({ applied: 1, interviewing: 1, offer: 0, rejected: 1, withdrawn: 0 });
  });
});
