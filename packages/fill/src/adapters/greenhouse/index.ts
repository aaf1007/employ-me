import type { AtsAdapter } from '../types';

// Single page, field ids match API names (first_name, question_{id}); every dropdown is a react-select; often embedded as iframe#grnhse_iframe (research §4).
export const greenhouseAdapter: AtsAdapter = {
  ats: 'greenhouse',
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
