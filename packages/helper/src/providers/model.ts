import {
  err,
  modelIdSchema,
  ok,
  type HelperError,
  type ProviderId,
  type Result,
} from '@employ-me/core/protocol';

/** Where a model name came from, which decides what the user is told to fix. */
type ModelSource = 'request' | 'config';

const NAME: Readonly<Record<ProviderId, string>> = { claude: 'Claude', codex: 'Codex' };

/**
 * Which model a task runs on: the request's (the one picked in Settings),
 * else config.json's, else null for the Provider's default (design.md
 * "Default models"). A name is checked here again, whoever sent it: it
 * becomes a CLI argument, so one that fails core's `modelIdSchema` (it may
 * not start with "-") is refused, never passed on, and never echoed.
 */
export function resolveModel(
  id: ProviderId,
  requested: string | undefined,
  configured: string | undefined,
): Result<string | null, HelperError> {
  if (requested !== undefined) return checked(id, requested, 'request');
  if (configured !== undefined) return checked(id, configured, 'config');
  return ok(null);
}

function checked(id: ProviderId, name: string, source: ModelSource): Result<string, HelperError> {
  if (modelIdSchema.safeParse(name).success) return ok(name);
  return err(
    source === 'request'
      ? invalidModelName()
      : {
          reason: 'providerFailed',
          message: `The ${NAME[id]} model name in employ-me's config.json isn't a valid model name`,
          fix: `Fix or remove "${id}" under "models" in employ-me's config.json (run \`npx employ-me doctor\` to find it), then click Retry.`,
        },
  );
}

/** For a model name from Settings that fails `modelIdSchema`. The name is never echoed. */
export function invalidModelName(): HelperError {
  return {
    reason: 'invalidRequest',
    message: "The model name from Settings isn't a valid model name",
    fix: 'In Settings, use a model name of letters, digits and . _ : [ ] - that starts with a letter or digit (such as "sonnet"), or clear the field to use the default, then click Retry.',
  };
}
