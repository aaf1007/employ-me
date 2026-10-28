import type { AtsAdapter } from '../types';

// Elements carry [data-field-path] (_systemfield_*); Yes/No answers are buttons over a hidden checkbox (research §4).
export const ashbyAdapter: AtsAdapter = {
  ats: 'ashby',
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
