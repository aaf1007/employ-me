// The fill engine's public surface. Integration (the content script and side
// panel) calls plan() then execute(), feeds the Provider's answers and the
// user's accepted Drafts back through plan(), and executes again.
export * as act from './act';
export { adapterFor, type AtsAdapter } from './adapters';
export type { ProfileView } from './answer';
export { classifyField, type ClassifyContext, type CountryChoice } from './classify';
export {
  CONFIRMATION_WINDOW_MS,
  isConfirmation,
  watchForSubmission,
  type SubmissionSignal,
} from './detect-submission';
export { MIN_MAPPING_CONFIDENCE } from './answer';
export { execute, type AwaitingField, type FillReport } from './execute';
export { extractFields } from './extract';
export type { OptionTarget } from './match';
export { fieldFingerprint, keptInSnapshot, readFieldValue, submittedAnswers, type FieldValue } from './read';
export { clearOutcomes, showOutcomes } from './outline';
export {
  draftFieldType,
  draftRequestFor,
  plan,
  type DraftRequestRef,
  type FillPlan,
  type PlanOptions,
  type PlannedField,
  type ProviderFeedback,
  type ProviderRequest,
  type ResumeFile,
  type Step,
  type Write,
} from './plan';
export {
  canonicalPostingUrl,
  countriesIn,
  parsePublicPosting,
  postingKeyFromUrl,
  publicApiRequest,
  readPosting,
  type PublicApiParseError,
  type PublicApiRequest,
  type PublicPostingDetails,
} from './posting';
export type { Classification, ClassificationSource, ExtractedField, FillContext, Widget } from './types';
