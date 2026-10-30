import type { CouldNotFillReason, FieldOutcome, FillSource, ReviewReason } from '@employ-me/core';

// The side panel's words for each outcome (CODING_STANDARDS.md "UI": the
// glossary's words). Every "Couldn't fill" also shows its fix.

const FILLED: Readonly<Record<FillSource, string>> = {
  rules: 'From your Profile',
  savedAnswer: 'From your Saved Answers',
  selfId: 'From your Self-ID Answers',
  provider: 'Matched by the AI',
};

const REVIEW: Readonly<Record<ReviewReason, string>> = {
  similarSavedAnswer: 'The AI found a similar Saved Answer. Check it before you use it.',
  countryUnclear: "The Posting's country is unclear. Choose the answer for the right country.",
  askEachTime: 'You asked to answer this one each time.',
  draftReady: 'A Draft is waiting for you below.',
  providerMatched: 'The AI matched this field. Check the answer.',
  ambiguousOption: 'More than one option fits. Choose one yourself.',
  keptYourEdit: 'You changed this on the page, so employ-me left your answer alone.',
  asksForMore: 'Filled from your Profile, but the question asks for more. Add the rest yourself.',
  fileUploading: 'Your Resume is attached, but the form was still uploading it. Check it finished.',
  otherFileShown: "The form shows a different file from the Resume you chose. Check it's the right one.",
  fileUploadUnknown:
    "Your Resume is attached, but the form doesn't show whether it uploaded. Check it before you submit.",
};

const COULD_NOT_FILL: Readonly<Record<CouldNotFillReason, string>> = {
  notInProfile: 'Not in your Profile',
  unrecognizedField: 'Not recognised',
  noMatchingOption: 'No option matches your Profile',
  providerUnavailable: 'The AI is unavailable',
  draftFailed: "The AI couldn't write a Draft",
  valueDidNotStick: "The form didn't keep the value",
  controlNotSupported: "employ-me can't fill this control",
  attestation: 'Attestations are left for you',
  neverStored: 'employ-me never fills this',
  coverLetter: 'Cover letters are left for you',
  fileRejected: "The form didn't take the file",
};

export function outcomeText(outcome: FieldOutcome): string {
  switch (outcome.kind) {
    case 'filled':
      return FILLED[outcome.source];
    case 'needsReview':
      return REVIEW[outcome.reason];
    case 'couldNotFill':
      return COULD_NOT_FILL[outcome.reason];
  }
}
