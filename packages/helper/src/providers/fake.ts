import {
  draftContextSchema,
  err,
  helperError,
  mapFieldsInputSchema,
  ok,
  parseResumeInputSchema,
  type DraftAnswerOutput,
  type DraftContext,
  type HelperErrorReason,
  type MapFieldsInput,
  type MapFieldsOutput,
  type ParseResumeInput,
  type ParseResumeOutput,
  type Provider,
  type ProviderError,
  type ProviderId,
  type Result,
} from '@employ-me/core/protocol';
import type { z } from 'zod';

/**
 * A deterministic stand-in for a real Provider, so tests never spend the
 * user's plan. Selected with EMPLOY_ME_PROVIDER=fake (see select.ts).
 *
 * It re-validates every input against the strict boundary schemas, so any
 * test that routes a Fill through it also checks that nothing sensitive
 * reached the Provider.
 */
export interface FakeScript {
  readonly mapFields?: (input: MapFieldsInput) => MapFieldsOutput;
  readonly draftAnswer?: (input: DraftContext) => DraftAnswerOutput;
  readonly parseResume?: (input: ParseResumeInput) => ParseResumeOutput;
  /** Every call fails with this reason. Simulates an unavailable Provider. */
  readonly failWith?: HelperErrorReason;
}

export function createFakeProvider(id: ProviderId, script: FakeScript = {}): Provider {
  const run = <S extends z.ZodType, T>(
    schema: S,
    input: unknown,
    respond: (valid: z.infer<S>) => T,
  ): Promise<Result<T, ProviderError>> => {
    if (script.failWith !== undefined) {
      return Promise.resolve(err(helperError(script.failWith, `fake ${id} provider set to fail`)));
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return Promise.resolve(
        err(helperError('boundaryViolation', 'fake provider received an input outside the boundary schema')),
      );
    }
    return Promise.resolve(ok(respond(parsed.data)));
  };

  return {
    id,
    isFake: true,
    status: () => Promise.resolve({ id, state: 'ready', version: 'fake' }),
    mapFields: (input) => run(mapFieldsInputSchema, input, script.mapFields ?? defaultMapFields),
    draftAnswer: (input) => run(draftContextSchema, input, script.draftAnswer ?? defaultDraft),
    parseResume: (input) =>
      run(parseResumeInputSchema, input, script.parseResume ?? (() => ({ extract: {} }))),
  };
}

function defaultMapFields(input: MapFieldsInput): MapFieldsOutput {
  return {
    mappings: input.fields.map((field) =>
      field.control === 'textarea'
        ? { fieldId: field.fieldId, match: { kind: 'needsDraft' }, confidence: 1 }
        : { fieldId: field.fieldId, match: { kind: 'unknown' }, confidence: 0 },
    ),
  };
}

function defaultDraft(input: DraftContext): DraftAnswerOutput {
  return {
    draft: {
      text: `Fake draft for: ${input.question.label}`,
      language: input.question.language ?? 'en',
      claims: [],
    },
  };
}
