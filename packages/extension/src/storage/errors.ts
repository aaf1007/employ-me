import { err } from '@employ-me/core';
import { z } from 'zod';

/**
 * Why a data operation failed. Like helper errors, each carries a fix in
 * plain words (CODING_STANDARDS.md "Errors"). Messages name fields and
 * stores, never the values in them.
 */
export const DATA_ERROR_REASONS = [
  'notFound',
  'invalidInput',
  'tooLarge',
  'corrupt',
  'storageFailed',
] as const;
export type DataErrorReason = (typeof DATA_ERROR_REASONS)[number];

export const issueSchema = z.object({
  /** Dotted path into the input: "identity.legalName.first", "background.workHistory.0.title". */
  path: z.string(),
  message: z.string(),
});
export type Issue = z.infer<typeof issueSchema>;

export const dataErrorSchema = z.object({
  reason: z.enum(DATA_ERROR_REASONS),
  message: z.string(),
  fix: z.string().min(1),
  issues: z.array(issueSchema).optional(),
});
export type DataError = z.infer<typeof dataErrorSchema>;

export const DATA_ERROR_FIXES: Readonly<Record<DataErrorReason, string>> = {
  notFound: 'It may have been deleted in another tab. Reload the page.',
  invalidInput: 'Check the highlighted fields and try again.',
  tooLarge: 'Use a file under 10 MB.',
  corrupt:
    "Some saved data couldn't be read. Export a backup from Settings if you can, then open an issue with this message.",
  storageFailed: "Chrome couldn't save your data. Check that your disk isn't full, then try again.",
};

export function dataError(
  reason: DataErrorReason,
  message: string,
  issues?: readonly Issue[],
): { readonly ok: false; readonly error: DataError } {
  return err({
    reason,
    message,
    fix: DATA_ERROR_FIXES[reason],
    ...(issues === undefined ? {} : { issues: [...issues] }),
  });
}

/** zod issues as display-ready, value-free messages keyed by dotted path. */
export function issuesFrom(error: z.ZodError, prefix: readonly PropertyKey[] = []): Issue[] {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path].map(String).join('.'),
    message: friendlyMessage(issue),
  }));
}

// Forms always hand the schema strings as strings, so a type mismatch on
// anything but a number means the value is missing.
function friendlyMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.expected === 'number' || issue.expected === 'int' ? 'Enter a number' : 'Required';
    case 'invalid_value':
      return 'Choose one of the options';
    case 'too_small':
      return issue.origin === 'string' && issue.minimum === 1 ? 'Required' : issue.message;
    case 'too_big':
      return issue.origin === 'string' ? `Keep it under ${String(issue.maximum)} characters` : issue.message;
    case 'invalid_format':
      if (issue.format === 'email') return 'Enter an email address, like sam@example.com';
      if (issue.format === 'url') return 'Enter a full link, starting with https://';
      if (issue.format === 'date') return 'Enter a date';
      return issue.message;
    case 'unrecognized_keys':
      return `employ-me doesn't keep ${issue.keys.join(', ')}`;
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
    case 'not_multiple_of':
    case 'custom':
      return issue.message;
  }
}
