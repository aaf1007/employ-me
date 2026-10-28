import {
  draftContextSchema,
  err,
  helperError,
  mapFieldsInputSchema,
  parseResumeInputSchema,
  type HelperError,
  type ProviderId,
  type Result,
} from '@employ-me/core/protocol';
import type { z } from 'zod';
import { draftAnswerPrompt, mapFieldsPrompt, parseResumePrompt, type Prompt } from '../prompts';
import { extractResumeText } from '../resume/extract';
import type { HelperProvider, ProviderEngine } from './task';

/**
 * A Provider backed by a CLI engine (Claude or Codex). The prompts, the
 * Resume text extraction and the output parsing are the same for both; the
 * engine only runs a task and returns structured output.
 */
export function createCliProvider(id: ProviderId, engine: ProviderEngine): HelperProvider {
  const execute = async <T>(prompt: Prompt<T>, signal: AbortSignal): Promise<Result<T, HelperError>> => {
    const raw = await engine.run(prompt.task, signal);
    return raw.ok ? prompt.finish(raw.value) : raw;
  };
  return {
    id,
    isFake: false,
    status: engine.status,
    close: engine.close ?? (() => Promise.resolve()),
    mapFields: (input, signal) =>
      revalidate(mapFieldsInputSchema, input, (valid) => execute(mapFieldsPrompt(valid), signal)),
    draftAnswer: (input, signal) =>
      revalidate(draftContextSchema, input, (valid) => execute(draftAnswerPrompt(valid), signal)),
    parseResume: (input, signal) =>
      revalidate(parseResumeInputSchema, input, async (valid) => {
        const text = await extractResumeText(valid);
        return text.ok ? execute(parseResumePrompt(text.value), signal) : text;
      }),
  };
}

/**
 * Dispatch already validated the request; checking again here keeps the
 * boundary true for any caller (design.md "Sensitive questions").
 */
function revalidate<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  run: (valid: z.infer<S>) => Promise<Result<T, HelperError>>,
): Promise<Result<T, HelperError>> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? run(parsed.data)
    : Promise.resolve(err(helperError('boundaryViolation', 'A Provider input failed the boundary schema')));
}
