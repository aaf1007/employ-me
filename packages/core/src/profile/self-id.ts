import { z } from 'zod';
import { VOCAB } from '../taxonomy/vocab';

// Self-ID Answers. These NEVER go to a Provider (design.md "Sensitive
// questions"). The helper package is lint-blocked from importing this module,
// and core/src/provider + core/src/protocol may not import it either.

const answer = <V extends readonly [string, ...string[]]>(values: V) =>
  z.enum(values).default('decline' as V[number]);

export const usSelfIdSchema = z.strictObject({
  sex: answer(VOCAB.usSex),
  hispanicLatino: answer(VOCAB.usHispanicLatino),
  race: answer(VOCAB.usRace),
  veteran: answer(VOCAB.usVeteran),
  disability: answer(VOCAB.usDisability),
});
export type UsSelfId = z.infer<typeof usSelfIdSchema>;

export const caSelfIdSchema = z.strictObject({
  genderIdentity: answer(VOCAB.caGenderIdentity),
  indigenous: answer(VOCAB.caIndigenous),
  visibleMinority: answer(VOCAB.caVisibleMinority),
  disability: answer(VOCAB.caDisability),
});
export type CaSelfId = z.infer<typeof caSelfIdSchema>;

/** Per-country Self-ID Answers. Anything you haven't answered is "decline". */
export const selfIdAnswersSchema = z.strictObject({
  US: usSelfIdSchema.prefault({}),
  CA: caSelfIdSchema.prefault({}),
});
export type SelfIdAnswers = z.infer<typeof selfIdAnswersSchema>;
export type SelfIdCountry = keyof SelfIdAnswers;
