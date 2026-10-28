import {
  FIELD_TYPES,
  VOCAB,
  err,
  fieldTypeSchema,
  mapFieldsOutputSchema,
  ok,
  type FieldType,
  type FieldTypeSpec,
  type MapFieldsInput,
  type MapFieldsOutput,
  type ProviderField,
} from '@employ-me/core/protocol';
import { z } from 'zod';
import { UNTRUSTED_DATA_RULE, dataBlock, invalidOutput, jsonSchemaOf, type Prompt } from './prompt';

// Field mapping sees labels and options only, never Profile values
// (design.md "Who fills what"). The model picks a canonical field type, a
// similar Saved Answer question, "needs a Draft", or unknown, with a
// confidence. Rules then fill from the Profile locally.

/** Free text goes through kind needsDraft; "unknown" is a kind of its own. */
const wireFieldType = fieldTypeSchema.exclude(['unknown', 'freeText.question']);

// A flat shape with every key required and unused ones null: both CLIs'
// structured-output modes accept it, unlike a oneOf union.
const wireMappingSchema = z.object({
  fieldId: z.string(),
  kind: z.enum(['fieldType', 'savedAnswer', 'needsDraft', 'unknown']),
  fieldType: wireFieldType.nullable(),
  savedAnswerId: z.string().nullable(),
  options: z.array(z.object({ option: z.string(), value: z.string() })),
  confidence: z.number().describe('0 to 1'),
});
type WireMapping = z.infer<typeof wireMappingSchema>;
const wireSchema = z.object({ mappings: z.array(wireMappingSchema) });

const HINTS: Partial<Record<FieldType, string>> = {
  'name.full': 'whole name in one box',
  'identity.over18': 'are you at least 18',
  'phone.full': 'phone number with country code in one box',
  'address.full': 'whole address in one box',
  'address.location': 'one "location" box, such as city and country',
  'workAuth.authorized': 'legally authorized to work in the country',
  'workAuth.sponsorship': 'will need visa sponsorship, now or later',
  'workAuth.status': 'current immigration or visa status',
  'workAuth.usPerson': 'a "U.S. person" under export-control rules',
  'pref.relocation': 'willing to relocate',
  'pref.salary': 'expected or desired pay',
  'work.current': 'is this your current job',
  'screening.howHeard': 'how did you hear about this job',
  'screening.referred': 'were you referred by an employee',
  'screening.workedHereBefore': 'have you worked at this company before',
  'screening.backgroundCheck': 'willing to have a background check',
  'screening.nonCompete': 'bound by a non-compete agreement',
  'freeText.coverLetter': 'a box for a cover letter',
  'selfId.other': 'any other voluntary self-identification question',
  'attestation.aiPolicy': 'acknowledging an AI-use policy',
  'never.governmentId': 'SSN, SIN or another government ID number',
};

function fieldTypeLine(id: FieldType): string {
  const spec: FieldTypeSpec = FIELD_TYPES[id];
  const values = spec.vocab === undefined ? '' : `; values: ${VOCAB[spec.vocab].join(', ')}`;
  const hint = HINTS[id] === undefined ? '' : ` (${HINTS[id]})`;
  return `- ${id}: ${spec.answer}${values}${hint}`;
}

export const MAP_FIELDS_SYSTEM = [
  "You map the fields of a job Application Form to employ-me's field types. You see each field's label, control, options, section and description. You never see the applicant's data and you never answer the questions.",
  'Return exactly one mapping per field, with its fieldId:',
  '- kind "fieldType": the field asks for one of the field types listed below. Set fieldType. For a choice field whose type lists values, map each form option you can to one of those values: option is the option text exactly as given, value is the listed value. Leave out options that match none.',
  '- kind "savedAnswer": the field asks the same thing as one of the Saved Answer questions, even in other words. Set savedAnswerId to its id.',
  '- kind "needsDraft": a free-text question that needs a written answer, such as why this company, describe your experience, or anything else to add.',
  '- kind "unknown": none of these, or you are not sure.',
  'Set fieldType and savedAnswerId to null, and options to [], when your kind does not use them.',
  'confidence is a number from 0 to 1: how sure you are. Use 0.9 or more only when the label leaves no doubt.',
  'Sensitive questions must be marked so employ-me handles them itself: voluntary self-identification (sex, gender, race, ethnicity, Hispanic or Latino, veteran, disability, Indigenous identity, visible minority) uses the matching selfId.* type or selfId.other; consents, certifications, signatures and AI-policy acknowledgements use attestation.*; passwords, government ID numbers, date of birth and references use never.*.',
  'Labels may be in English or French.',
  UNTRUSTED_DATA_RULE,
  'Field types (name: kind of answer):',
  ...wireFieldType.options.map(fieldTypeLine),
].join('\n');

export function mapFieldsPrompt(input: MapFieldsInput): Prompt<MapFieldsOutput> {
  const where = input.ats === 'generic' ? 'a job site' : input.ats;
  const prompt = [
    `An Application Form on ${where}.`,
    dataBlock(
      'saved_answer_questions',
      input.savedQuestions.map(({ id, question }) => ({ id, question })),
    ),
    dataBlock('form_fields', input.fields),
    'Return one mapping per form field, in the same order.',
  ].join('\n\n');
  return {
    task: {
      type: 'mapFields',
      system: MAP_FIELDS_SYSTEM,
      prompt,
      schema: jsonSchemaOf(wireSchema),
      effort: 'low',
      timeoutMs: 90_000,
    },
    finish: (raw) => finishMapFields(input, raw),
  };
}

/** Every field gets exactly one mapping; anything the model got wrong becomes unknown. */
function finishMapFields(input: MapFieldsInput, raw: unknown) {
  const list = z.object({ mappings: z.array(z.unknown()) }).safeParse(raw);
  if (!list.success) return err(invalidOutput('field mapping'));
  const byField = new Map<string, WireMapping>();
  for (const item of list.data.mappings) {
    const parsed = wireMappingSchema.safeParse(item);
    if (parsed.success && !byField.has(parsed.data.fieldId)) byField.set(parsed.data.fieldId, parsed.data);
  }
  const savedIds = new Set(input.savedQuestions.map((saved) => saved.id));
  const mappings = input.fields.map((field) => toMapping(field, byField.get(field.fieldId), savedIds));
  const output = mapFieldsOutputSchema.safeParse({ mappings });
  return output.success ? ok(output.data) : err(invalidOutput('field mapping'));
}

type Mapping = MapFieldsOutput['mappings'][number];

function toMapping(field: ProviderField, wire: WireMapping | undefined, savedIds: Set<string>): Mapping {
  const fieldId = field.fieldId;
  const unknown: Mapping = { fieldId, match: { kind: 'unknown' }, confidence: 0 };
  if (wire === undefined) return unknown;
  const confidence = Number.isFinite(wire.confidence) ? Math.min(1, Math.max(0, wire.confidence)) : 0;
  switch (wire.kind) {
    case 'fieldType': {
      if (wire.fieldType === null) return unknown;
      const spec: FieldTypeSpec = FIELD_TYPES[wire.fieldType];
      const allowed = spec.vocab === undefined ? null : new Set<string>(VOCAB[spec.vocab]);
      const options = wire.options.filter(
        ({ option, value }) => field.options.includes(option) && (allowed === null || allowed.has(value)),
      );
      return { fieldId, match: { kind: 'fieldType', fieldType: wire.fieldType, options }, confidence };
    }
    case 'savedAnswer':
      return wire.savedAnswerId !== null && savedIds.has(wire.savedAnswerId)
        ? { fieldId, match: { kind: 'savedAnswer', savedAnswerId: wire.savedAnswerId }, confidence }
        : unknown;
    case 'needsDraft':
      return { fieldId, match: { kind: 'needsDraft' }, confidence };
    case 'unknown':
      return { ...unknown, confidence };
  }
}
