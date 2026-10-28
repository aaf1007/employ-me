import {
  applicationSchema,
  isoDateTimeSchema,
  modelIdSchema,
  profileSchema,
  providerIdSchema,
  type Application,
  type Posting,
  type Snapshot,
  type Status,
} from '@employ-me/core';
import { z } from 'zod';

/**
 * The Profile's own fields. Resumes and Saved Answers are kept in stores of
 * their own, so saving one section of the Profile can never overwrite a Saved
 * Answer accepted in the side panel meanwhile. `getProfile` puts them back
 * together into core's Profile.
 */
export const profileFieldsSchema = profileSchema.omit({ resumes: true, savedAnswers: true });
export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type ProfileFieldsInput = z.input<typeof profileFieldsSchema>;

export const settingsSchema = z.strictObject({
  provider: providerIdSchema.default('claude'),
  /** Absent means the Provider's default: Sonnet for Claude, the CLI's default for Codex (design.md "AI"). */
  models: z.strictObject({ claude: modelIdSchema.optional(), codex: modelIdSchema.optional() }).prefault({}),
  /** Set when you finish the setup questionnaire. */
  setupCompletedAt: isoDateTimeSchema.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;

/** An Application as the Tracker lists it: everything but the Snapshot. */
export const applicationSummarySchema = applicationSchema
  .omit({ snapshot: true })
  .extend({ hasSnapshot: z.boolean() });
export type ApplicationSummary = z.infer<typeof applicationSummarySchema>;

/** What the applications store holds. `postingKeyId` feeds the by-Posting index. */
export const storedApplicationSchema = applicationSummarySchema.extend({ postingKeyId: z.string() });
export type StoredApplication = z.infer<typeof storedApplicationSchema>;

/** A submission the ATS confirmed, or you confirmed: it starts at Applied and keeps its Snapshot. */
export interface SubmittedApplication {
  readonly source: Extract<Application['source'], 'confirmation' | 'didYouApply'>;
  readonly posting: Posting;
  readonly snapshot: Snapshot;
  readonly appliedAt?: string;
}

/** One you add by hand or import from CSV: no Snapshot, and the Status you give it. */
export interface AddedApplication {
  readonly source: Extract<Application['source'], 'manual' | 'import'>;
  readonly posting: Posting;
  readonly appliedAt?: string;
  readonly status?: Status;
  readonly notes?: string;
}

export interface ImportedApplication extends AddedApplication {
  readonly source: 'import';
}

/**
 * A new Application. One with a Snapshot comes only from a confirmed
 * submission; one added by hand or imported never has one (design.md
 * "Tracking").
 */
export type NewApplication = SubmittedApplication | AddedApplication;
