export * as act from './act';
export { adapterFor, type AtsAdapter } from './adapters';
export { classifyField, type ClassifyContext } from './classify';
export { watchForSubmission, type SubmissionSignal } from './detect-submission';
export { extractFields } from './extract';
export { canonicalPostingUrl, postingKeyFromUrl, readPosting } from './posting';
export type { Classification, ClassificationSource, ExtractedField, FillContext } from './types';
