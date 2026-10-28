import type {
  AtsId,
  CouldNotFillReason,
  DraftPosting,
  DraftQuestion,
  EmployerKey,
  FieldMatch,
  FieldType,
  FillSource,
  Posting,
  ProviderField,
  ProviderSavedQuestion,
  ResumeMeta,
  OrdinaryFieldType,
  ReviewReason,
  SavedAnswer,
} from '@employ-me/core';
import type { TextCheck } from '../act';
import type { AtsAdapter } from '../adapters';
import type { CountryAnswer, ProfileView, ProviderInputs } from '../answer';
import type { CountryChoice } from '../classify';
import type { OptionTarget } from '../match';
import type { PublicPostingDetails } from '../posting';
import type { ClassificationSource, ExtractedField } from '../types';

/** The Resume to attach: its metadata and its bytes. */
export interface ResumeFile {
  readonly meta: ResumeMeta;
  readonly file: File;
}

/**
 * What integration feeds back after asking the Provider and the user
 * (the re-plan seam). Pass it to `plan()` again; the new plan replaces the old.
 */
export interface ProviderFeedback {
  /** `pending` (default) until the Provider was asked; `unavailable` when it can't be reached. */
  readonly state?: ProviderInputs['state'];
  /** The helper's fix for an unavailable Provider (core HELPER_ERROR_FIXES). */
  readonly unavailableFix?: string;
  /** `mapFields` output (core `MapFieldsOutput['mappings']`): a match and its confidence per field id. */
  readonly mappings?: readonly {
    readonly fieldId: string;
    readonly match: FieldMatch;
    readonly confidence: number;
  }[];
  /** Field ids whose Draft is waiting in the side panel. */
  readonly draftsReady?: readonly string[];
  /** Answers the user accepted: Drafts (edited or not) and similar Saved Answers. */
  readonly accepted?: readonly { readonly fieldId: string; readonly text: string }[];
}

export interface PlanOptions {
  /** The Posting as integration knows it (e.g. merged with its public API). Default: read from the page. */
  readonly posting?: Posting | null;
  /** Facts from the Posting's public API (`parsePublicPosting`), e.g. Greenhouse's option lists. */
  readonly postingDetails?: PublicPostingDetails;
  readonly resume?: ResumeFile | null;
  readonly provider?: ProviderFeedback;
  /** Overrides adapter detection (tests, and frames whose URL the caller knows better). */
  readonly url?: URL;
}

/** What act/ should write for one field. Option choices are resolved against live options when the list is closed at plan time. */
export type Write =
  | { readonly kind: 'text'; readonly text: string; readonly check: TextCheck }
  | { readonly kind: 'select'; readonly values: readonly string[]; readonly labels: readonly string[] }
  | { readonly kind: 'choose'; readonly indices: readonly number[]; readonly labels: readonly string[] }
  | { readonly kind: 'checkbox'; readonly checked: boolean }
  | { readonly kind: 'combobox'; readonly targets: readonly OptionTarget[] }
  | { readonly kind: 'typeahead'; readonly target: OptionTarget }
  | { readonly kind: 'file' };

export type Step =
  | {
      readonly kind: 'write';
      readonly write: Write;
      readonly source: FillSource;
      readonly review?: ReviewReason;
    }
  | {
      readonly kind: 'review';
      readonly reason: ReviewReason;
      readonly suggestion?: string;
      readonly byCountry?: readonly CountryAnswer[];
      /** Option labels that fitted equally well, for "ambiguousOption". */
      readonly candidates?: readonly string[];
    }
  | { readonly kind: 'skip'; readonly reason: CouldNotFillReason; readonly fix: string }
  | { readonly kind: 'awaitProvider'; readonly need: 'mapping' | 'draft' };

export interface PlannedField {
  readonly field: ExtractedField;
  readonly fieldType: FieldType;
  readonly classifiedBy: ClassificationSource;
  readonly step: Step;
}

/** A required free-text question waiting for a Draft. Build its context with core's `toDraftContext`. */
export interface DraftRequestRef {
  readonly fieldId: string;
  /** Recorded with the Saved Answer the accepted Draft becomes (core requires an ordinary type). */
  readonly fieldType: OrdinaryFieldType;
  readonly question: DraftQuestion;
  /** "polish" when the form has an AI-use policy question (design.md "Drafts"). */
  readonly mode: 'write' | 'polish';
  readonly posting: DraftPosting;
  readonly employer?: EmployerKey;
}

/** The `mapFields` request body, minus the Provider id: labels and options only. */
export interface ProviderRequest {
  readonly ats: AtsId;
  readonly fields: readonly ProviderField[];
  readonly savedQuestions: readonly ProviderSavedQuestion[];
}

/** An "Add another" press execute() will make, so the form has one entry per Profile entry. */
export interface RepeatStep {
  readonly section: 'education' | 'work';
  readonly button: Element;
  readonly have: number;
  readonly want: number;
}

export interface FillPlan {
  readonly ats: AtsId;
  readonly url: string;
  readonly posting: Posting | null;
  readonly country: CountryChoice;
  /** Every field on the form, each with exactly one step. */
  readonly fields: readonly PlannedField[];
  /** Fields only the Provider can map, as core's branded ProviderFields. Null when none. */
  readonly providerRequest: ProviderRequest | null;
  readonly draftRequests: readonly DraftRequestRef[];
  /** The form has an AI-use policy question: Drafts switch to "polish my draft". */
  readonly aiPolicy: boolean;
  /** The ATS parses Resumes and overwrites fields: attach it first and wait (research §4). */
  readonly resumeFirst: boolean;
  readonly repeats: readonly RepeatStep[];
  /** Everything needed to plan again after the page changes. */
  readonly context: PlanContext;
}

export interface PlanContext {
  readonly doc: Document;
  readonly adapter: AtsAdapter;
  readonly profile: ProfileView;
  readonly options: PlanOptions;
  readonly savedAnswers: readonly SavedAnswer[];
}
