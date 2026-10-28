import type { AtsAdapter } from '../types';

// Fallback for any other site: extracts what it can and lists everything it couldn't fill (design.md "Job sites").
export const genericAdapter: AtsAdapter = {
  ats: 'generic',
  findForm() {
    throw new Error('not implemented');
  },
  extract() {
    throw new Error('not implemented');
  },
  classify() {
    throw new Error('not implemented');
  },
  postingKey() {
    throw new Error('not implemented');
  },
};
