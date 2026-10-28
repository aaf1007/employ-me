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
import { resolveModel } from './model';
import type { HelperProvider, ProviderEngine } from './task';

/**
 * A Provider backed by a CLI engine (Claude or Codex). The prompts, the
 * Resume text extraction, the model choice and the output parsing are the
 * same for both; the engine only runs a task and returns structured output.
 */
export function createCliProvider(id: ProviderId, engine: ProviderEngine): HelperProvider {
  const execute = async <T>(
    prompt: Prompt<T>,
    signal: AbortSignal,
    requestedModel: string | undefined,
  ): Promise<Result<T, HelperError>> => {
    const model = resolveModel(id, requestedModel, engine.configuredModel);
    if (!model.ok) return model;
    const raw = await engine.run(prompt.task, signal, model.value);
    return raw.ok ? prompt.finish(raw.value) : raw;
  };
  return {
    id,
    isFake: false,
    status: engine.status,
    close: engine.close ?? (() => Promise.resolve()),
    mapFields: (input, signal, model) =>
      revalidate(mapFieldsInputSchema, input, (valid) => execute(mapFieldsPrompt(valid), signal, model)),
    draftAnswer: (input, signal, model) =>
      revalidate(draftContextSchema, input, (valid) => execute(draftAnswerPrompt(valid), signal, model)),
    parseResume: (input, signal, model) =>
      revalidate(parseResumeInputSchema, input, async (valid) => {
        const text = await extractResumeText(valid);
        return text.ok ? execute(parseResumePrompt(text.value), signal, model) : text;
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
