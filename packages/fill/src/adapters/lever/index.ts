import type { AtsAdapter } from '../types';

// Server-rendered with stable field names; a hidden cards[...][baseTemplate] input holds each question as JSON; resume upload triggers a parse that overwrites filled fields, so upload first (research §4).
export const leverAdapter: AtsAdapter = {
  ats: 'lever',
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
